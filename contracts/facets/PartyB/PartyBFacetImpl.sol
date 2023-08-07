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
import "../../storages/GlobalAppStorage.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/SymbolStorage.sol";

library PartyBFacetImpl {
    using LockedValuesOps for LockedValues;

    function lockQuote(uint256 quoteId, SingleUpnlSig memory upnlSig, bool increaseNonce) internal {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();

        Quote storage quote = quoteLayout.quotes[quoteId];
        LibMuon.verifyPartyBUpnl(upnlSig, msg.sender, quote.partyA);
        checkPartyBValidationToLockQuote(quoteId, upnlSig.upnl);
        if (increaseNonce) {
            accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
        }
        quote.modifyTimestamp = block.timestamp;
        quote.quoteStatus = QuoteStatus.LOCKED;
        quote.partyB = msg.sender;
        // lock funds for partyB
        accountLayout.partyBPendingLockedBalances[msg.sender][quote.partyA].addQuote(quote);
        quoteLayout.partyBPendingQuotes[msg.sender][quote.partyA].push(quote.id);
    }

    function unlockQuote(uint256 quoteId) internal returns (QuoteStatus) {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();

        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        require(quote.quoteStatus == QuoteStatus.LOCKED, "PartyBFacet: Invalid state");
        if (block.timestamp > quote.deadline) {
            QuoteStatus result = LibQuote.expireQuote(quoteId);
            return result;
        } else {
            accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
            quote.modifyTimestamp = block.timestamp;
            quote.quoteStatus = QuoteStatus.PENDING;
            accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(quote);
            LibQuote.removeFromPartyBPendingQuotes(quote);
            quote.partyB = address(0);
            return QuoteStatus.PENDING;
        }
    }

    function acceptCancelRequest(uint256 quoteId) internal {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();

        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        require(quote.quoteStatus == QuoteStatus.CANCEL_PENDING, "PartyBFacet: Invalid state");
        accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
        quote.modifyTimestamp = block.timestamp;
        quote.quoteStatus = QuoteStatus.CANCELED;
        accountLayout.pendingLockedBalances[quote.partyA].subQuote(quote);
        accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(quote);
        // send trading Fee back to partyA
        LibQuote.returnTradingFee(quoteId);

        LibQuote.removeFromPendingQuotes(quote);
    }

    function checkPartyBValidationToLockQuote(uint256 quoteId, int256 upnl) internal view {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        MAStorage.Layout storage maLayout = MAStorage.layout();

        Quote storage quote = quoteLayout.quotes[quoteId];
        require(quote.quoteStatus == QuoteStatus.PENDING, "PartyBFacet: Invalid state");
        require(block.timestamp <= quote.deadline, "PartyBFacet: Quote is expired");
        require(quoteId <= quoteLayout.lastId, "PartyBFacet: Invalid quoteId");
        int256 availableBalance = LibAccount.partyBAvailableForQuote(
            upnl,
            msg.sender,
            quote.partyA
        );
        require(availableBalance >= 0, "PartyBFacet: Available balance is lower than zero");
        require(
            uint256(availableBalance) >= quote.lockedValues.total(),
            "PartyBFacet: insufficient available balance"
        );
        require(
            !maLayout.partyBLiquidationStatus[msg.sender][quote.partyA],
            "PartyBFacet: PartyB isn't solvent"
        );
        bool isValidPartyB;
        if (quote.partyBsWhiteList.length == 0) {
            require(msg.sender != quote.partyA, "PartyBFacet: PartyA can't be partyB too");
            isValidPartyB = true;
        } else {
            for (uint8 index = 0; index < quote.partyBsWhiteList.length; index++) {
                if (msg.sender == quote.partyBsWhiteList[index]) {
                    isValidPartyB = true;
                    break;
                }
            }
        }
        require(isValidPartyB, "PartyBFacet: Sender isn't whitelisted");
    }

    function openPosition(
        uint256 quoteId,
        uint256 filledAmount,
        uint256 openedPrice,
        PairUpnlAndPriceSig memory upnlSig
    ) internal returns (uint256 currentId) {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();

        Quote storage quote = quoteLayout.quotes[quoteId];
        require(
            quote.quoteStatus == QuoteStatus.LOCKED ||
            quote.quoteStatus == QuoteStatus.CANCEL_PENDING,
            "PartyBFacet: Invalid state"
        );
        require(block.timestamp <= quote.deadline, "PartyBFacet: Quote is expired");
        if (quote.orderType == OrderType.LIMIT) {
            require(
                quote.quantity >= filledAmount && filledAmount > 0,
                "PartyBFacet: Invalid filledAmount"
            );
        } else {
            require(quote.quantity == filledAmount, "PartyBFacet: Invalid filledAmount");
        }
        if (quote.positionType == PositionType.LONG) {
            require(
                openedPrice <= quote.requestedOpenPrice,
                "PartyBFacet: Opened price isn't valid"
            );
        } else {
            require(
                openedPrice >= quote.requestedOpenPrice,
                "PartyBFacet: Opened price isn't valid"
            );
        }
        LibMuon.verifyPairUpnlAndPrice(upnlSig, quote.partyB, quote.partyA, quote.symbolId);

        quote.openedPrice = openedPrice;
        LibSolvency.isSolventAfterOpenPosition(quoteId, filledAmount, upnlSig);

        accountLayout.partyANonces[quote.partyA] += 1;
        accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
        quote.modifyTimestamp = block.timestamp;

        LibQuote.removeFromPendingQuotes(quote);

        if (quote.quantity == filledAmount) {
            accountLayout.pendingLockedBalances[quote.partyA].subQuote(quote);
            accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(quote);
            quote.lockedValues.mul(openedPrice).div(quote.requestedOpenPrice);
            accountLayout.lockedBalances[quote.partyA].addQuote(quote);
            accountLayout.partyBLockedBalances[quote.partyB][quote.partyA].addQuote(quote);
        }
        // partially fill
        else {
            currentId = ++quoteLayout.lastId;
            QuoteStatus newStatus;
            if (quote.quoteStatus == QuoteStatus.CANCEL_PENDING) {
                newStatus = QuoteStatus.CANCELED;
            } else {
                newStatus = QuoteStatus.PENDING;
                quoteLayout.partyAPendingQuotes[quote.partyA].push(currentId);
            }
            LockedValues memory filledLockedValues = LockedValues(
                (quote.lockedValues.cva * filledAmount) / quote.quantity,
                (quote.lockedValues.mm * filledAmount) / quote.quantity,
                (quote.lockedValues.lf * filledAmount) / quote.quantity
            );
            LockedValues memory appliedFilledLockedValues = filledLockedValues;
            appliedFilledLockedValues = appliedFilledLockedValues.mulMem(openedPrice);
            appliedFilledLockedValues = appliedFilledLockedValues.divMem(quote.requestedOpenPrice);
            // check that opened position is not minor position
            require(
                appliedFilledLockedValues.total() >=
                SymbolStorage.layout().symbols[quote.symbolId].minAcceptableQuoteValue,
                "PartyBFacet: Quote value is low"
            );
            // check that new pending position is not minor position
            require(
                (quote.lockedValues.total() - filledLockedValues.total()) >=
                SymbolStorage.layout().symbols[quote.symbolId].minAcceptableQuoteValue,
                "PartyBFacet: Quote value is low"
            );

            Quote memory q = Quote({
                id: currentId,
                partyBsWhiteList: quote.partyBsWhiteList,
                symbolId: quote.symbolId,
                positionType: quote.positionType,
                orderType: quote.orderType,
                openedPrice: 0,
                requestedOpenPrice: quote.requestedOpenPrice,
                marketPrice: quote.marketPrice,
                quantity: quote.quantity - filledAmount,
                closedAmount: 0,
                lockedValues: LockedValues(0, 0, 0),
                initialLockedValues: LockedValues(0, 0, 0),
                maxInterestRate: quote.maxInterestRate,
                partyA: quote.partyA,
                partyB: address(0),
                quoteStatus: newStatus,
                avgClosedPrice: 0,
                requestedClosePrice: 0,
                parentId: quote.id,
                createTimestamp: quote.createTimestamp,
                modifyTimestamp: block.timestamp,
                quantityToClose: 0,
                deadline: quote.deadline
            });

            quoteLayout.quoteIdsOf[quote.partyA].push(currentId);
            quoteLayout.quotes[currentId] = q;
            Quote storage newQuote = quoteLayout.quotes[currentId];

            if (newStatus == QuoteStatus.CANCELED) {
                // send trading Fee back to partyA
                LibQuote.returnTradingFee(currentId);
                // part of quote has been filled and part of it has been canceled
                accountLayout.pendingLockedBalances[quote.partyA].subQuote(quote);
                accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(
                    quote
                );
            } else {
                accountLayout.pendingLockedBalances[quote.partyA].sub(filledLockedValues);
                accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].sub(
                    filledLockedValues
                );
            }
            newQuote.lockedValues = quote.lockedValues.sub(filledLockedValues);
            newQuote.initialLockedValues = newQuote.lockedValues;
            quote.quantity = filledAmount;
            quote.lockedValues = appliedFilledLockedValues;

            // lock with amount of filledAmount
            accountLayout.lockedBalances[quote.partyA].addQuote(quote);
            accountLayout.partyBLockedBalances[quote.partyB][quote.partyA].addQuote(quote);
        }
        quote.quoteStatus = QuoteStatus.OPENED;
        LibQuote.addToOpenPositions(quoteId);
    }

    function fillCloseRequest(
        uint256 quoteId,
        uint256 filledAmount,
        uint256 closedPrice,
        PairUpnlAndPriceSig memory upnlSig
    ) internal {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        require(
            quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
            quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
            "PartyBFacet: Invalid state"
        );
        require(block.timestamp <= quote.deadline, "PartyBFacet: Quote is expired");
        if (quote.positionType == PositionType.LONG) {
            require(
                closedPrice >= quote.requestedClosePrice,
                "PartyBFacet: Closed price isn't valid"
            );
        } else {
            require(
                closedPrice <= quote.requestedClosePrice,
                "PartyBFacet: Closed price isn't valid"
            );
        }
        if (quote.orderType == OrderType.LIMIT) {
            require(quote.quantityToClose >= filledAmount, "PartyBFacet: Invalid filledAmount");
        } else {
            require(quote.quantityToClose == filledAmount, "PartyBFacet: Invalid filledAmount");
        }

        LibMuon.verifyPairUpnlAndPrice(upnlSig, quote.partyB, quote.partyA, quote.symbolId);
        LibSolvency.isSolventAfterClosePosition(quoteId, filledAmount, closedPrice, upnlSig);

        accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
        accountLayout.partyANonces[quote.partyA] += 1;
        LibQuote.closeQuote(quote, filledAmount, closedPrice);
    }

    function acceptCancelCloseRequest(uint256 quoteId) internal {
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];

        require(
            quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
            "PartyBFacet: Invalid state"
        );
        AccountStorage.layout().partyBNonces[quote.partyB][quote.partyA] += 1;
        quote.modifyTimestamp = block.timestamp;
        quote.quoteStatus = QuoteStatus.OPENED;
        quote.requestedClosePrice = 0;
        quote.quantityToClose = 0;
    }

    function emergencyClosePosition(uint256 quoteId, PairUpnlAndPriceSig memory upnlSig) internal {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        require(quote.quoteStatus == QuoteStatus.OPENED, "PartyBFacet: Invalid state");
        LibMuon.verifyPairUpnlAndPrice(upnlSig, quote.partyB, quote.partyA, quote.symbolId);
        uint256 filledAmount = LibQuote.quoteOpenAmount(quote);
        quote.quantityToClose = filledAmount;
        quote.requestedClosePrice = upnlSig.price;
        LibSolvency.isSolventAfterClosePosition(quoteId, filledAmount, upnlSig.price, upnlSig);
        accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
        accountLayout.partyANonces[quote.partyA] += 1;
        LibQuote.closeQuote(quote, filledAmount, upnlSig.price);
    }

}
