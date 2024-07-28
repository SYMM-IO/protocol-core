// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/QuoteStorage.sol";
import "../storages/MAStorage.sol";
import "./LibAccount.sol";
import "./LibQuote.sol";
import "./LibLockedValues.sol";

library LibPartyBPositionsActions {
	using LockedValuesOps for LockedValues;

	function fillCloseRequest(uint256 quoteId, uint256 filledAmount, uint256 closedPrice) internal {
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		require(
			quote.quoteStatus == QuoteStatus.CLOSE_PENDING || quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
			"PartyBFacet: Invalid state"
		);
		require(block.timestamp <= quote.deadline, "PartyBFacet: Quote is expired");
		if (quote.positionType == PositionType.LONG) {
			require(closedPrice >= quote.requestedClosePrice, "PartyBFacet: Closed price isn't valid");
		} else {
			require(closedPrice <= quote.requestedClosePrice, "PartyBFacet: Closed price isn't valid");
		}
		if (quote.orderType == OrderType.LIMIT) {
			require(quote.quantityToClose >= filledAmount, "PartyBFacet: Invalid filledAmount");
		} else {
			require(quote.quantityToClose == filledAmount, "PartyBFacet: Invalid filledAmount");
		}
		LibQuote.closeQuote(quote, filledAmount, closedPrice);
	}

	function openPosition(uint256 quoteId, uint256 filledAmount, uint256 openedPrice) internal returns (uint256 currentId) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();

		Quote storage quote = quoteLayout.quotes[quoteId];
		require(SymbolStorage.layout().symbols[quote.symbolId].isValid, "PartyBFacet: Symbol is not valid");
		require(quote.quoteStatus == QuoteStatus.LOCKED || quote.quoteStatus == QuoteStatus.CANCEL_PENDING, "PartyBFacet: Invalid state");
		require(block.timestamp <= quote.deadline, "PartyBFacet: Quote is expired");

		address feeCollector = appLayout.affiliateFeeCollector[quote.affiliate] == address(0)
			? appLayout.defaultFeeCollector
			: appLayout.affiliateFeeCollector[quote.affiliate];
		if (quote.orderType == OrderType.LIMIT) {
			require(quote.quantity >= filledAmount && filledAmount > 0, "PartyBFacet: Invalid filledAmount");
			accountLayout.balances[feeCollector] += (filledAmount * quote.requestedOpenPrice * quote.tradingFee) / 1e36;
		} else {
			require(quote.quantity == filledAmount, "PartyBFacet: Invalid filledAmount");
			accountLayout.balances[feeCollector] += (filledAmount * quote.marketPrice * quote.tradingFee) / 1e36;
		}
		if (quote.positionType == PositionType.LONG) {
			require(openedPrice <= quote.requestedOpenPrice, "PartyBFacet: Opened price isn't valid");
		} else {
			require(openedPrice >= quote.requestedOpenPrice, "PartyBFacet: Opened price isn't valid");
		}

		quote.openedPrice = openedPrice;
		quote.initialOpenedPrice = openedPrice;
		quote.statusModifyTimestamp = block.timestamp;

		LibQuote.removeFromPendingQuotes(quote);

		if (quote.quantity == filledAmount) {
			accountLayout.pendingLockedBalances[quote.partyA].subQuote(quote);
			accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(quote);
			quote.lockedValues.mul(openedPrice).div(quote.requestedOpenPrice);

			// check locked values
			require(
				quote.lockedValues.totalForPartyA() >= SymbolStorage.layout().symbols[quote.symbolId].minAcceptableQuoteValue,
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
				(quote.lockedValues.lf * filledAmount) / quote.quantity,
				(quote.lockedValues.partyAmm * filledAmount) / quote.quantity,
				(quote.lockedValues.partyBmm * filledAmount) / quote.quantity
			);
			LockedValues memory appliedFilledLockedValues = filledLockedValues;
			appliedFilledLockedValues = appliedFilledLockedValues.mulMem(openedPrice);
			appliedFilledLockedValues = appliedFilledLockedValues.divMem(quote.requestedOpenPrice);
			// check that opened position is not minor position
			require(
				appliedFilledLockedValues.totalForPartyA() >= SymbolStorage.layout().symbols[quote.symbolId].minAcceptableQuoteValue,
				"PartyBFacet: Quote value is low"
			);
			// check that new pending position is not minor position
			require(
				newStatus == QuoteStatus.CANCELED ||
					(quote.lockedValues.totalForPartyA() - filledLockedValues.totalForPartyA()) >=
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
				lockedValues: LockedValues(0, 0, 0, 0),
				initialLockedValues: LockedValues(0, 0, 0, 0),
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
				tradingFee: quote.tradingFee,
				affiliate: quote.affiliate,
				paidFundingFee: 0,
				lastFundingTimestamp: 0
			});

			quoteLayout.quoteIdsOf[quote.partyA].push(currentId);
			quoteLayout.quotes[currentId] = q;
			Quote storage newQuote = quoteLayout.quotes[currentId];

			if (newStatus == QuoteStatus.CANCELED) {
				// send trading Fee back to partyA
				uint256 fee = LibQuote.getTradingFee(newQuote.id);
				accountLayout.allocatedBalances[newQuote.partyA] += fee;
				emit SharedEvents.BalanceChangePartyA(newQuote.partyA, fee, SharedEvents.BalanceChangeType.PLATFORM_FEE_IN);

				// part of quote has been filled and part of it has been canceled
				accountLayout.pendingLockedBalances[quote.partyA].subQuote(quote);
				accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(quote);
			} else {
				accountLayout.pendingLockedBalances[quote.partyA].sub(filledLockedValues);
				accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(quote);
			}
			newQuote.lockedValues = quote.lockedValues.sub(filledLockedValues);
			newQuote.initialLockedValues = newQuote.lockedValues;
			quote.quantity = filledAmount;
			quote.lockedValues = appliedFilledLockedValues;
		}
		// lock with amount of filledAmount
		accountLayout.lockedBalances[quote.partyA].addQuote(quote);
		accountLayout.partyBLockedBalances[quote.partyB][quote.partyA].addQuote(quote);

		quote.lastFundingTimestamp = block.timestamp;
		quote.paidFundingFee = LibQuote.getAccumulatedFundingFee(quoteId);

		// check leverage (is in 18 decimals)
		require(
			(quote.quantity * quote.openedPrice) / quote.lockedValues.totalForPartyA() <= SymbolStorage.layout().symbols[quote.symbolId].maxLeverage,
			"PartyBFacet: Leverage is high"
		);

		quote.quoteStatus = QuoteStatus.OPENED;
		LibQuote.addToOpenPositions(quoteId);
	}
}
