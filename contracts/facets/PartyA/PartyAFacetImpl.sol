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
import "../../libraries/LibLiquidation.sol";
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
		uint256 lf,
		uint256 partyAmm,
		uint256 partyBmm,
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

		LockedValues memory lockedValues = LockedValues(cva, lf, partyAmm, partyBmm);
		uint256 tradingPrice = orderType == OrderType.LIMIT ? price : upnlSig.price;
		require(
			lockedValues.lf >= (symbolLayout.symbols[symbolId].minAcceptablePortionLF * lockedValues.totalForPartyA()) / 1e18,
			"PartyAFacet: LF is not enough"
		);

		require(lockedValues.totalForPartyA() >= symbolLayout.symbols[symbolId].minAcceptableQuoteValue, "PartyAFacet: Quote value is low");
		for (uint8 i = 0; i < partyBsWhiteList.length; i++) {
			require(partyBsWhiteList[i] != msg.sender, "PartyAFacet: Sender isn't allowed in partyBWhiteList");
		}

		LibMuon.verifyPartyAUpnlAndPrice(upnlSig, msg.sender, symbolId);

		int256 availableBalance = LibAccount.partyAAvailableForQuote(upnlSig.upnl, msg.sender);
		require(availableBalance > 0, "PartyAFacet: Available balance is lower than zero");
		require(
			uint256(availableBalance) >=
				lockedValues.totalForPartyA() + ((quantity * tradingPrice * symbolLayout.symbols[symbolId].tradingFee) / 1e36),
			"PartyAFacet: insufficient available balance"
		);

		// lock funds the in middle of way
		accountLayout.pendingLockedBalances[msg.sender].add(lockedValues);
		currentId = ++quoteLayout.lastId;

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

		require(quote.quoteStatus == QuoteStatus.PENDING || quote.quoteStatus == QuoteStatus.LOCKED, "PartyAFacet: Invalid state");

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

	function requestToClosePosition(uint256 quoteId, uint256 closePrice, uint256 quantityToClose, OrderType orderType, uint256 deadline) internal {
		SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];

		require(quote.quoteStatus == QuoteStatus.OPENED, "PartyAFacet: Invalid state");
		require(deadline >= block.timestamp, "PartyAFacet: Low deadline");
		require(LibQuote.quoteOpenAmount(quote) >= quantityToClose, "PartyAFacet: Invalid quantityToClose");

		// check that remaining position is not too small
		if (LibQuote.quoteOpenAmount(quote) > quantityToClose) {
			require(
				((LibQuote.quoteOpenAmount(quote) - quantityToClose) * quote.lockedValues.totalForPartyA()) / LibQuote.quoteOpenAmount(quote) >=
					symbolLayout.symbols[quote.symbolId].minAcceptableQuoteValue,
				"PartyAFacet: Remaining quote value is low"
			);
		}
		quoteLayout.closeIds[quoteId] = ++quoteLayout.lastCloseId;
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
		require(block.timestamp > quote.statusModifyTimestamp + maLayout.forceCancelCooldown, "PartyAFacet: Cooldown not reached");
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

		require(quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING, "PartyAFacet: Invalid state");
		require(block.timestamp > quote.statusModifyTimestamp + maLayout.forceCancelCloseCooldown, "PartyAFacet: Cooldown not reached");

		quote.statusModifyTimestamp = block.timestamp;
		quote.quoteStatus = QuoteStatus.OPENED;
		quote.requestedClosePrice = 0;
		quote.quantityToClose = 0;
	}

	function forceClosePosition(
		uint256 quoteId,
		HighLowPriceSig memory sig
	) internal returns (uint256 closePrice, bool isPartyBLiquidated, int256 upnlPartyB, uint256 partyBAllocatedBalance) {
		MAStorage.Layout storage maLayout = MAStorage.layout();
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		require(quote.quoteStatus == QuoteStatus.CLOSE_PENDING, "PartyAFacet: Invalid state");
		require(sig.endTime + maLayout.forceCloseSecondCooldown <= quote.deadline, "PartyBFacet: Close request is expired");
		require(quote.orderType == OrderType.LIMIT, "PartyBFacet: Quote's order type should be LIMIT");
		require(sig.startTime >= quote.statusModifyTimestamp + maLayout.forceCloseFirstCooldown, "PartyAFacet: Cooldown not reached");
		require(sig.endTime <= block.timestamp - maLayout.forceCloseSecondCooldown, "PartyAFacet: Cooldown not reached");
		require(sig.averagePrice <= sig.highest && sig.averagePrice >= sig.lowest, "PartyAFacet: Invalid average price");
		if (quote.positionType == PositionType.LONG) {
			require(
				sig.highest >= quote.requestedClosePrice + (quote.requestedClosePrice * maLayout.forceCloseGapRatio) / 1e18,
				"PartyAFacet: Requested close price not reached"
			);
			closePrice = quote.requestedClosePrice + (quote.requestedClosePrice * maLayout.forceClosePricePenalty) / 1e18;
			closePrice = closePrice > sig.averagePrice ? closePrice : sig.averagePrice; // max
		} else {
			require(
				sig.lowest <= quote.requestedClosePrice - (quote.requestedClosePrice * maLayout.forceCloseGapRatio) / 1e18,
				"PartyAFacet: Requested close price not reached"
			);
			closePrice = quote.requestedClosePrice - (quote.requestedClosePrice * maLayout.forceClosePricePenalty) / 1e18;
			closePrice = closePrice > sig.averagePrice ? sig.averagePrice : closePrice; // min
		}

		if (closePrice == sig.averagePrice)
			require(sig.endTime - sig.startTime >= maLayout.forceCloseMinSigPeriod, "PartyAFacet: Invalid signature period");

		LibMuon.verifyHighLowPrice(sig, quote.partyB, quote.partyA, quote.symbolId);
		AccountStorage.layout().partyANonces[quote.partyA] += 1;
		AccountStorage.layout().partyBNonces[quote.partyB][quote.partyA] += 1;

		(int256 partyBAvailableBalance, int256 partyAAvailableBalance) = LibSolvency.getAvailableBalanceAfterClosePosition(
			quoteId,
			quote.quantityToClose,
			closePrice,
			PairUpnlAndPriceSig({
				reqId: sig.reqId,
				timestamp: sig.timestamp,
				upnlPartyA: sig.upnlPartyA,
				upnlPartyB: sig.upnlPartyB,
				price: sig.currentPrice,
				gatewaySignature: sig.gatewaySignature,
				sigs: sig.sigs
			})
		);
		require(partyAAvailableBalance >= 0, "PartyAFacet: PartyA will be insolvent");
		if (partyBAvailableBalance < 0) {
			int256 diff = (int256(quote.quantityToClose) * (int256(closePrice) - int256(sig.currentPrice))) / 1e18;
			if (quote.positionType == PositionType.LONG) {
				diff = diff * -1;
			}
			partyBAllocatedBalance = AccountStorage.layout().partyBAllocatedBalances[quote.partyB][quote.partyA];
			isPartyBLiquidated = true;
			upnlPartyB = sig.upnlPartyB + diff;
			LibLiquidation.liquidatePartyB(quote.partyB, quote.partyA, upnlPartyB, block.timestamp);
		} else {
			LibQuote.closeQuote(quote, quote.quantityToClose, closePrice);
		}
	}
}
