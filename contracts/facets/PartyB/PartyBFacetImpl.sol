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
import "../../libraries/LibPartyB.sol";
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
        LibPartyB.checkPartyBValidationToLockQuote(quoteId, upnlSig.upnl);
        if (increaseNonce) {
            accountLayout.partyBNonces[msg.sender][quote.partyA] += 1;
        }
        quote.statusModifyTimestamp = block.timestamp;
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
            quote.statusModifyTimestamp = block.timestamp;
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
        quote.statusModifyTimestamp = block.timestamp;
        quote.quoteStatus = QuoteStatus.CANCELED;
        accountLayout.pendingLockedBalances[quote.partyA].subQuote(quote);
        accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(quote);
        // send trading Fee back to partyA
        accountLayout.allocatedBalances[quote.partyA] += LibQuote.getTradingFee(quoteId);

        LibQuote.removeFromPendingQuotes(quote);
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
        require(accountLayout.suspendedAddresses[quote.partyA] == false, "PartyBFacet: PartyA is suspended");
        require(
            SymbolStorage.layout().symbols[quote.symbolId].isValid,
            "PartyBFacet: Symbol is not valid"
        );

        require(!GlobalAppStorage.layout().partyBEmergencyStatus[quote.partyB], "PartyBFacet: PartyB is in emergency mode");
        require(!GlobalAppStorage.layout().emergencyMode, "PartyBFacet: System is in emergency mode");

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
            accountLayout.balances[GlobalAppStorage.layout().feeCollector] +=
                (filledAmount * quote.requestedOpenPrice * quote.tradingFee) / 1e36;
        } else {
            require(quote.quantity == filledAmount, "PartyBFacet: Invalid filledAmount");
            accountLayout.balances[GlobalAppStorage.layout().feeCollector] +=
                (filledAmount * quote.marketPrice * quote.tradingFee) / 1e36;
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
        quote.initialOpenedPrice = openedPrice;


        accountLayout.partyANonces[quote.partyA] += 1;
        accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
        quote.statusModifyTimestamp = block.timestamp;

        LibQuote.removeFromPendingQuotes(quote);

        if (quote.quantity == filledAmount) {
            accountLayout.pendingLockedBalances[quote.partyA].subQuote(quote);
            accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(quote);
            quote.lockedValues.mul(openedPrice).div(quote.requestedOpenPrice);

            // check locked values
            require(
                quote.lockedValues.total() >=
                SymbolStorage.layout().symbols[quote.symbolId].minAcceptableQuoteValue,
                "PartyBFacet: Quote value is low"
            );
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
                initialOpenedPrice: 0,
                requestedOpenPrice: quote.requestedOpenPrice,
                marketPrice: quote.marketPrice,
                quantity: quote.quantity - filledAmount,
                closedAmount: 0,
                lockedValues: LockedValues(0, 0, 0),
                initialLockedValues: LockedValues(0, 0, 0),
                maxFundingRate: quote.maxFundingRate,
                partyA: quote.partyA,
                partyB: address(0),
                quoteStatus: newStatus,
                avgClosedPrice: 0,
                requestedClosePrice: 0,
                parentId: quote.id,
                createTimestamp: quote.createTimestamp,
                statusModifyTimestamp: block.timestamp,
                quantityToClose: 0,
                lastFundingPaymentTimestamp: 0,
                deadline: quote.deadline,
                tradingFee: quote.tradingFee
            });

            quoteLayout.quoteIdsOf[quote.partyA].push(currentId);
            quoteLayout.quotes[currentId] = q;
            Quote storage newQuote = quoteLayout.quotes[currentId];

            if (newStatus == QuoteStatus.CANCELED) {
                // send trading Fee back to partyA
                accountLayout.allocatedBalances[newQuote.partyA] += LibQuote.getTradingFee(newQuote.id);
                // part of quote has been filled and part of it has been canceled
                accountLayout.pendingLockedBalances[quote.partyA].subQuote(quote);
                accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(
                    quote
                );
            } else {
                accountLayout.pendingLockedBalances[quote.partyA].sub(filledLockedValues);
                accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(
                    quote
                );
            }
            newQuote.lockedValues = quote.lockedValues.sub(filledLockedValues);
            newQuote.initialLockedValues = newQuote.lockedValues;
            quote.quantity = filledAmount;
            quote.lockedValues = appliedFilledLockedValues;
        }
        // lock with amount of filledAmount
        accountLayout.lockedBalances[quote.partyA].addQuote(quote);
        accountLayout.partyBLockedBalances[quote.partyB][quote.partyA].addQuote(quote);

        LibSolvency.isSolventAfterOpenPosition(quoteId, filledAmount, upnlSig);
        // check leverage (is in 18 decimals)
        require(
            quote.quantity * quote.openedPrice / quote.lockedValues.total() <= SymbolStorage.layout().symbols[quote.symbolId].maxLeverage,
            "PartyBFacet: Leverage is high"
        );

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
        quote.statusModifyTimestamp = block.timestamp;
        quote.quoteStatus = QuoteStatus.OPENED;
        quote.requestedClosePrice = 0;
        quote.quantityToClose = 0;
    }

    function emergencyClosePosition(uint256 quoteId, PairUpnlAndPriceSig memory upnlSig) internal {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        require(quote.quoteStatus == QuoteStatus.OPENED || quote.quoteStatus == QuoteStatus.CLOSE_PENDING, "PartyBFacet: Invalid state");
        LibMuon.verifyPairUpnlAndPrice(upnlSig, quote.partyB, quote.partyA, quote.symbolId);
        uint256 filledAmount = LibQuote.quoteOpenAmount(quote);
        quote.quantityToClose = filledAmount;
        quote.requestedClosePrice = upnlSig.price;
        LibSolvency.isSolventAfterClosePosition(quoteId, filledAmount, upnlSig.price, upnlSig);
        accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
        accountLayout.partyANonces[quote.partyA] += 1;
        LibQuote.closeQuote(quote, filledAmount, upnlSig.price);
    }

    function chargeFundingRate(
        address partyA,
        uint256[] memory quoteIds,
        int256[] memory rates,
        PairUpnlSig memory upnlSig
    ) internal {
        LibMuon.verifyPairUpnl(upnlSig, msg.sender, partyA);
        require(quoteIds.length == rates.length, "PartyBFacet: Length not match");
        int256 partyBAvailableBalance = LibAccount.partyBAvailableBalanceForLiquidation(
            upnlSig.upnlPartyB,
            msg.sender,
            partyA
        );
        int256 partyAAvailableBalance = LibAccount.partyAAvailableBalanceForLiquidation(
            upnlSig.upnlPartyA,
            partyA
        );
        uint256 epochDuration;
        uint256 windowTime;
        for (uint256 i = 0; i < quoteIds.length; i++) {
            Quote storage quote = QuoteStorage.layout().quotes[quoteIds[i]];
            require(quote.partyA == partyA, "PartyBFacet: Invalid quote");
            require(quote.partyB == msg.sender, "PartyBFacet: Sender isn't partyB of quote");
            require(
                quote.quoteStatus == QuoteStatus.OPENED ||
                    quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
                    quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
                "PartyBFacet: Invalid state"
            );
            epochDuration = SymbolStorage.layout().symbols[quote.symbolId].fundingRateEpochDuration;
            require(epochDuration > 0, "PartyBFacet: Zero funding epoch duration");
            windowTime = SymbolStorage.layout().symbols[quote.symbolId].fundingRateWindowTime;
            uint256 latestEpochTimestamp = (block.timestamp / epochDuration) * epochDuration;
            uint256 paidTimestamp;
            if (block.timestamp <= latestEpochTimestamp + windowTime) {
                require(
                    latestEpochTimestamp > quote.lastFundingPaymentTimestamp,
                    "PartyBFacet: Funding already paid for this window"
                );
                paidTimestamp = latestEpochTimestamp;
            } else {
                uint256 nextEpochTimestamp = latestEpochTimestamp + epochDuration;
                require(
                    block.timestamp >= nextEpochTimestamp - windowTime,
                    "PartyBFacet: Current timestamp is out of window"
                );
                require(
                    nextEpochTimestamp > quote.lastFundingPaymentTimestamp,
                    "PartyBFacet: Funding already paid for this window"
                );
                paidTimestamp = nextEpochTimestamp;
            }
            if (rates[i] >= 0) {
                require(
                    uint256(rates[i]) <= quote.maxFundingRate,
                    "PartyBFacet: High funding rate"
                );
                uint256 priceDiff = (quote.openedPrice * uint256(rates[i])) / 1e18;
                if (quote.positionType == PositionType.LONG) {
                    quote.openedPrice += priceDiff;
                } else {
                    quote.openedPrice -= priceDiff;
                }
                partyAAvailableBalance -= int256(LibQuote.quoteOpenAmount(quote) * priceDiff / 1e18);
                partyBAvailableBalance += int256(LibQuote.quoteOpenAmount(quote) * priceDiff / 1e18);
            } else {
                require(
                    uint256(-rates[i]) <= quote.maxFundingRate,
                    "PartyBFacet: High funding rate"
                );
                uint256 priceDiff = (quote.openedPrice * uint256(-rates[i])) / 1e18;
                if (quote.positionType == PositionType.LONG) {
                    quote.openedPrice -= priceDiff;
                } else {
                    quote.openedPrice += priceDiff;
                }
                partyAAvailableBalance += int256(LibQuote.quoteOpenAmount(quote) * priceDiff / 1e18);
                partyBAvailableBalance -= int256(LibQuote.quoteOpenAmount(quote) * priceDiff / 1e18);
            }
            quote.lastFundingPaymentTimestamp = paidTimestamp;
        }
        require(partyAAvailableBalance >= 0, "PartyBFacet: PartyA will be insolvent");
        require(partyBAvailableBalance >= 0, "PartyBFacet: PartyB will be insolvent");
        AccountStorage.layout().partyBNonces[msg.sender][partyA] += 1;
        AccountStorage.layout().partyANonces[partyA] += 1;
    }
}
