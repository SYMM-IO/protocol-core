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
import "../../libraries/SharedEvents.sol";
import "../../storages/MAStorage.sol";
import "../../storages/QuoteStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../storages/GlobalAppStorage.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/SymbolStorage.sol";

library PartyBFacetImpl {
	using LockedValuesOps for LockedValues;

	function lockQuote(uint256 quoteId, SingleUpnlSig memory upnlSig) internal {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		Quote storage quote = quoteLayout.quotes[quoteId];
		LibMuon.verifyPartyBUpnl(upnlSig, msg.sender, quote.partyA);
		LibPartyB.checkPartyBValidationToLockQuote(quoteId, upnlSig.upnl);
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
		uint256 fee = LibQuote.getTradingFee(quoteId);
		accountLayout.allocatedBalances[quote.partyA] += fee;
		emit SharedEvents.BalanceChangePartyA(quote.partyA, fee, SharedEvents.BalanceChangeType.PLATFORM_FEE_IN);

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
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();

		Quote storage quote = quoteLayout.quotes[quoteId];
		require(accountLayout.suspendedAddresses[quote.partyA] == false, "PartyBFacet: PartyA is suspended");
		require(SymbolStorage.layout().symbols[quote.symbolId].isValid, "PartyBFacet: Symbol is not valid");
		require(!accountLayout.suspendedAddresses[msg.sender], "PartyBFacet: Sender is Suspended");

		require(!appLayout.partyBEmergencyStatus[quote.partyB], "PartyBFacet: PartyB is in emergency mode");
		require(!appLayout.emergencyMode, "PartyBFacet: System is in emergency mode");

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

		LibSolvency.isSolventAfterOpenPosition(quoteId, filledAmount, upnlSig);
		// check leverage (is in 18 decimals)
		require(
			(quote.quantity * quote.openedPrice) / quote.lockedValues.totalForPartyA() <= SymbolStorage.layout().symbols[quote.symbolId].maxLeverage,
			"PartyBFacet: Leverage is high"
		);

		quote.quoteStatus = QuoteStatus.OPENED;
		LibQuote.addToOpenPositions(quoteId);
	}

	function fillCloseRequest(uint256 quoteId, uint256 filledAmount, uint256 closedPrice, PairUpnlAndPriceSig memory upnlSig) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		LibMuon.verifyPairUpnlAndPrice(upnlSig, quote.partyB, quote.partyA, quote.symbolId);
		uint256[] memory quoteIds = new uint256[](1);
		uint256[] memory filledAmounts = new uint256[](1);
		uint256[] memory closedPrices = new uint256[](1);
		uint256[] memory marketPrices = new uint256[](1);
		quoteIds[0] = quoteId;
		filledAmounts[0] = filledAmount;
		closedPrices[0] = closedPrice;
		marketPrices[0] = upnlSig.price;
		LibSolvency.isSolventAfterClosePosition(
			quoteIds,
			filledAmounts,
			closedPrices,
			marketPrices,
			upnlSig.upnlPartyB,
			upnlSig.upnlPartyA,
			quote.partyB,
			quote.partyA
		);
		accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
		accountLayout.partyANonces[quote.partyA] += 1;
		LibPartyB.fillCloseRequest(quoteId, filledAmount, closedPrice);
	}

	function acceptCancelCloseRequest(uint256 quoteId) internal {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];

		require(quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING, "PartyBFacet: Invalid state");
		quote.statusModifyTimestamp = block.timestamp;
		quote.quoteStatus = QuoteStatus.OPENED;
		quote.requestedClosePrice = 0;
		quote.quantityToClose = 0;
	}

	function emergencyClosePosition(uint256 quoteId, PairUpnlAndPriceSig memory upnlSig) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		Symbol memory symbol = SymbolStorage.layout().symbols[quote.symbolId];
		require(
			GlobalAppStorage.layout().emergencyMode || GlobalAppStorage.layout().partyBEmergencyStatus[quote.partyB] || !symbol.isValid,
			"PartyBFacet: Operation not allowed. Either emergency mode must be active, party B must be in emergency status, or the symbol must be delisted"
		);
		require(quote.quoteStatus == QuoteStatus.OPENED || quote.quoteStatus == QuoteStatus.CLOSE_PENDING, "PartyBFacet: Invalid state");
		LibMuon.verifyPairUpnlAndPrice(upnlSig, quote.partyB, quote.partyA, quote.symbolId);
		uint256 filledAmount = LibQuote.quoteOpenAmount(quote);
		quote.quantityToClose = filledAmount;
		quote.requestedClosePrice = upnlSig.price;
		require(
			LibAccount.partyAAvailableBalanceForLiquidation(upnlSig.upnlPartyA, accountLayout.allocatedBalances[quote.partyA], quote.partyA) >= 0,
			"PartyBFacet: PartyA is insolvent"
		);
		require(
			LibAccount.partyBAvailableBalanceForLiquidation(upnlSig.upnlPartyB, quote.partyB, quote.partyA) >= 0,
			"PartyBFacet: PartyB should be solvent"
		);
		accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
		accountLayout.partyANonces[quote.partyA] += 1;
		LibQuote.closeQuote(quote, filledAmount, upnlSig.price);
	}
}
