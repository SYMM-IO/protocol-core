// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/LibLockedValues.sol";
import "../../libraries/LibMuon.sol";
import "../../libraries/LibAccount.sol";
import "../../libraries/LibSolvency.sol";
import "../../libraries/LibQuote.sol";
import "../../storages/MAStorage.sol";
import "../../storages/QuoteStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/SymbolStorage.sol";

library PartyAFacetImpl {
    using LockedValuesOps for LockedValues;

    function sendQuote(
        address[] memory partyBsWhiteList,
        uint256 symbolId,
        PositionType positionType,
        OrderType orderType,
        uint256 price,
        uint256 quantity,
        uint256 cva,
        uint256 mm,
        uint256 lf,
        uint256 maxFundingRate,
        uint256 deadline,
        SingleUpnlAndPriceSig memory upnlSig
    ) internal returns (uint256 currentId) {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        MAStorage.Layout storage maLayout = MAStorage.layout();
        SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();

        require(
            quoteLayout.partyAPendingQuotes[msg.sender].length < maLayout.pendingQuotesValidLength,
            "PartyAFacet: Number of pending quotes out of range"
        );
        require(symbolLayout.symbols[symbolId].isValid, "PartyAFacet: Symbol is not valid");
        require(deadline >= block.timestamp, "PartyAFacet: Low deadline");

        LockedValues memory lockedValues = LockedValues(cva, mm, lf);
        uint256 tradingPrice = orderType == OrderType.LIMIT ? price : upnlSig.price;
        uint256 notionalValue = (quantity * tradingPrice) / 1e18;
        require(
            lockedValues.total() <= notionalValue,
            "PartyAFacet: Leverage can't be lower than one"
        );

        require(
            lockedValues.lf >=
                (symbolLayout.symbols[symbolId].minAcceptablePortionLF * lockedValues.total()) /
                    1e18,
            "PartyAFacet: LF is not enough"
        );

        require(
            lockedValues.total() >= symbolLayout.symbols[symbolId].minAcceptableQuoteValue,
            "PartyAFacet: Quote value is low"
        );
        for (uint8 i = 0; i < partyBsWhiteList.length; i++) {
            require(
                partyBsWhiteList[i] != msg.sender,
                "PartyAFacet: Sender isn't allowed in partyBWhiteList"
            );
        }

        LibMuon.verifyPartyAUpnlAndPrice(upnlSig, msg.sender, symbolId);

        int256 availableBalance = LibAccount.partyAAvailableForQuote(upnlSig.upnl, msg.sender);
        require(availableBalance > 0, "PartyAFacet: Available balance is lower than zero");
        require(
            uint256(availableBalance) >=
                lockedValues.total() +
                    ((quantity * tradingPrice * symbolLayout.symbols[symbolId].tradingFee) / 1e36),
            "PartyAFacet: insufficient available balance"
        );

        // lock funds the in middle of way
        accountLayout.pendingLockedBalances[msg.sender].add(lockedValues);
        currentId = ++quoteLayout.lastId;
        accountLayout.partyANonces[msg.sender] += 1;

        // create quote.
        Quote memory quote = Quote({
            id: currentId,
            partyBsWhiteList: partyBsWhiteList,
            symbolId: symbolId,
            positionType: positionType,
            orderType: orderType,
            openedPrice: 0,
            initialOpenedPrice: 0,
            requestedOpenPrice: price,
            marketPrice: upnlSig.price,
            quantity: quantity,
            closedAmount: 0,
            lockedValues: lockedValues,
            initialLockedValues: lockedValues,
            maxFundingRate: maxFundingRate,
            partyA: msg.sender,
            partyB: address(0),
            quoteStatus: QuoteStatus.PENDING,
            avgClosedPrice: 0,
            requestedClosePrice: 0,
            parentId: 0,
            createTimestamp: block.timestamp,
            statusModifyTimestamp: block.timestamp,
            quantityToClose: 0,
            lastFundingPaymentTimestamp: 0,
            deadline: deadline,
            tradingFee: symbolLayout.symbols[symbolId].tradingFee
        });
        quoteLayout.quoteIdsOf[msg.sender].push(currentId);
        quoteLayout.partyAPendingQuotes[msg.sender].push(currentId);
        quoteLayout.quotes[currentId] = quote;
        
        accountLayout.allocatedBalances[msg.sender] -= LibQuote.getTradingFee(currentId);
    }

    function requestToCancelQuote(uint256 quoteId) internal returns (QuoteStatus result) {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];

        require(
            quote.quoteStatus == QuoteStatus.PENDING || quote.quoteStatus == QuoteStatus.LOCKED,
            "PartyAFacet: Invalid state"
        );

        if (block.timestamp > quote.deadline) {
            result = LibQuote.expireQuote(quoteId);
        } else if (quote.quoteStatus == QuoteStatus.PENDING) {
            quote.quoteStatus = QuoteStatus.CANCELED;
            accountLayout.allocatedBalances[quote.partyA] += LibQuote.getTradingFee(quote.id);
            accountLayout.pendingLockedBalances[quote.partyA].subQuote(quote);
            LibQuote.removeFromPartyAPendingQuotes(quote);
            result = QuoteStatus.CANCELED;
        } else {
            // Quote is locked
            quote.quoteStatus = QuoteStatus.CANCEL_PENDING;
            result = QuoteStatus.CANCEL_PENDING;
        }
        quote.statusModifyTimestamp = block.timestamp;
    }

    function requestToClosePosition(
        uint256 quoteId,
        uint256 closePrice,
        uint256 quantityToClose,
        OrderType orderType,
        uint256 deadline
    ) internal {
        SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];

        require(quote.quoteStatus == QuoteStatus.OPENED, "PartyAFacet: Invalid state");
        require(deadline >= block.timestamp, "PartyAFacet: Low deadline");
        require(
            LibQuote.quoteOpenAmount(quote) >= quantityToClose,
            "PartyAFacet: Invalid quantityToClose"
        );

        // check that remaining position is not too small
        if (LibQuote.quoteOpenAmount(quote) > quantityToClose) {
            require(
                ((LibQuote.quoteOpenAmount(quote) - quantityToClose) * quote.lockedValues.total()) /
                    LibQuote.quoteOpenAmount(quote) >=
                    symbolLayout.symbols[quote.symbolId].minAcceptableQuoteValue,
                "PartyAFacet: Remaining quote value is low"
            );
        }

        quote.statusModifyTimestamp = block.timestamp;
        quote.quoteStatus = QuoteStatus.CLOSE_PENDING;
        quote.requestedClosePrice = closePrice;
        quote.quantityToClose = quantityToClose;
        quote.orderType = orderType;
        quote.deadline = deadline;
    }

    function requestToCancelCloseRequest(uint256 quoteId) internal returns (QuoteStatus) {
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];

        require(quote.quoteStatus == QuoteStatus.CLOSE_PENDING, "PartyAFacet: Invalid state");
        if (block.timestamp > quote.deadline) {
            LibQuote.expireQuote(quoteId);
            return QuoteStatus.OPENED;
        } else {
            quote.statusModifyTimestamp = block.timestamp;
            quote.quoteStatus = QuoteStatus.CANCEL_CLOSE_PENDING;
            return QuoteStatus.CANCEL_CLOSE_PENDING;
        }
    }

    function forceCancelQuote(uint256 quoteId) internal {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        MAStorage.Layout storage maLayout = MAStorage.layout();
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];

        require(quote.quoteStatus == QuoteStatus.CANCEL_PENDING, "PartyAFacet: Invalid state");
        require(
            block.timestamp > quote.statusModifyTimestamp + maLayout.forceCancelCooldown,
            "PartyAFacet: Cooldown not reached"
        );
        quote.statusModifyTimestamp = block.timestamp;
        quote.quoteStatus = QuoteStatus.CANCELED;
        accountLayout.pendingLockedBalances[quote.partyA].subQuote(quote);
        accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(quote);

        // send trading Fee back to partyA
        accountLayout.allocatedBalances[quote.partyA] += LibQuote.getTradingFee(quote.id);

        LibQuote.removeFromPendingQuotes(quote);
    }

    function forceCancelCloseRequest(uint256 quoteId) internal {
        MAStorage.Layout storage maLayout = MAStorage.layout();
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];

        require(
            quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
            "PartyAFacet: Invalid state"
        );
        require(
            block.timestamp > quote.statusModifyTimestamp + maLayout.forceCancelCloseCooldown,
            "PartyAFacet: Cooldown not reached"
        );

        quote.statusModifyTimestamp = block.timestamp;
        quote.quoteStatus = QuoteStatus.OPENED;
        quote.requestedClosePrice = 0;
        quote.quantityToClose = 0;
    }

    function forceClosePosition(uint256 quoteId, PairUpnlAndPriceSig memory upnlSig) internal {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        MAStorage.Layout storage maLayout = MAStorage.layout();
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];

        uint256 filledAmount = quote.quantityToClose;
        require(quote.quoteStatus == QuoteStatus.CLOSE_PENDING, "PartyAFacet: Invalid state");
        require(
            block.timestamp > quote.statusModifyTimestamp + maLayout.forceCloseCooldown,
            "PartyAFacet: Cooldown not reached"
        );
        require(block.timestamp <= quote.deadline, "PartyBFacet: Quote is expired");
        require(
            quote.orderType == OrderType.LIMIT,
            "PartyBFacet: Quote's order type should be LIMIT"
        );
        if (quote.positionType == PositionType.LONG) {
            require(
                upnlSig.price >=
                    quote.requestedClosePrice +
                        (quote.requestedClosePrice * maLayout.forceCloseGapRatio) /
                        1e18,
                "PartyAFacet: Requested close price not reached"
            );
        } else {
            require(
                upnlSig.price <=
                    quote.requestedClosePrice -
                        (quote.requestedClosePrice * maLayout.forceCloseGapRatio) /
                        1e18,
                "PartyAFacet: Requested close price not reached"
            );
        }

        LibMuon.verifyPairUpnlAndPrice(upnlSig, quote.partyB, quote.partyA, quote.symbolId);
        LibSolvency.isSolventAfterClosePosition(
            quoteId,
            filledAmount,
            upnlSig.price,
            upnlSig
        );
        accountLayout.partyANonces[quote.partyA] += 1;
        accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
        LibQuote.closeQuote(quote, filledAmount, upnlSig.price);
    }
}
