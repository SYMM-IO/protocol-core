// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./LibLockedValues.sol";
import "../libraries/SharedEvents.sol";
import "../storages/QuoteStorage.sol";
import "../storages/AccountStorage.sol";
import "../storages/GlobalAppStorage.sol";
import "../storages/SymbolStorage.sol";
import "../storages/MAStorage.sol";

library LibQuote {
	using LockedValuesOps for LockedValues;

	/**
	 * @notice Calculates the remaining open amount of a quote.
	 * @param quote The quote for which to calculate the remaining open amount.
	 * @return The remaining open amount of the quote.
	 */
	function quoteOpenAmount(Quote storage quote) internal view returns (uint256) {
		return quote.quantity - quote.closedAmount;
	}

	/**
	 * @notice Gets the index of an item in an array.
	 * @param array_ The array in which to search for the item.
	 * @param item The item to find the index of.
	 * @return The index of the item in the array, or type(uint256).max if the item is not found.
	 */
	function getIndexOfItem(uint256[] storage array_, uint256 item) internal view returns (uint256) {
		for (uint256 index = 0; index < array_.length; index++) {
			if (array_[index] == item) return index;
		}
		return type(uint256).max;
	}

	/**
	 * @notice Removes an item from an array.
	 * @param array_ The array from which to remove the item.
	 * @param item The item to remove from the array.
	 */
	function removeFromArray(uint256[] storage array_, uint256 item) internal {
		uint256 index = getIndexOfItem(array_, item);
		require(index != type(uint256).max, "LibQuote: Item not Found");
		array_[index] = array_[array_.length - 1];
		array_.pop();
	}

	/**
	 * @notice Removes a quote from the pending quotes of Party A.
	 * @param quote The quote to remove from the pending quotes.
	 */
	function removeFromPartyAPendingQuotes(Quote storage quote) internal {
		removeFromArray(QuoteStorage.layout().partyAPendingQuotes[quote.partyA], quote.id);
	}

	/**
	 * @notice Removes a quote from the pending quotes of Party B.
	 * @param quote The quote to remove from the pending quotes.
	 */
	function removeFromPartyBPendingQuotes(Quote storage quote) internal {
		removeFromArray(QuoteStorage.layout().partyBPendingQuotes[quote.partyB][quote.partyA], quote.id);
	}

	/**
	 * @notice Removes a quote from both Party A's and Party B's pending quotes.
	 * @param quote The quote to remove from the pending quotes.
	 */
	function removeFromPendingQuotes(Quote storage quote) internal {
		removeFromPartyAPendingQuotes(quote);
		removeFromPartyBPendingQuotes(quote);
	}

	/**
	 * @notice Adds a quote to the open positions.
	 * @param quoteId The ID of the quote to add to the open positions.
	 */
	function addToOpenPositions(uint256 quoteId) internal {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];

		quoteLayout.partyAOpenPositions[quote.partyA].push(quote.id);
		quoteLayout.partyBOpenPositions[quote.partyB][quote.partyA].push(quote.id);

		quoteLayout.partyAPositionsIndex[quote.id] = quoteLayout.partyAPositionsCount[quote.partyA];
		quoteLayout.partyBPositionsIndex[quote.id] = quoteLayout.partyBPositionsCount[quote.partyB][quote.partyA];

		quoteLayout.partyAPositionsCount[quote.partyA] += 1;
		quoteLayout.partyBPositionsCount[quote.partyB][quote.partyA] += 1;
	}

	/**
	 * @notice Removes a quote from the open positions.
	 * @param quoteId The ID of the quote to remove from the open positions.
	 */
	function removeFromOpenPositions(uint256 quoteId) internal {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];
		uint256 indexOfPartyAPosition = quoteLayout.partyAPositionsIndex[quote.id];
		uint256 indexOfPartyBPosition = quoteLayout.partyBPositionsIndex[quote.id];
		uint256 lastOpenPositionIndex = quoteLayout.partyAPositionsCount[quote.partyA] - 1;
		quoteLayout.partyAOpenPositions[quote.partyA][indexOfPartyAPosition] = quoteLayout.partyAOpenPositions[quote.partyA][lastOpenPositionIndex];
		quoteLayout.partyAPositionsIndex[quoteLayout.partyAOpenPositions[quote.partyA][lastOpenPositionIndex]] = indexOfPartyAPosition;
		quoteLayout.partyAOpenPositions[quote.partyA].pop();

		lastOpenPositionIndex = quoteLayout.partyBPositionsCount[quote.partyB][quote.partyA] - 1;
		quoteLayout.partyBOpenPositions[quote.partyB][quote.partyA][indexOfPartyBPosition] = quoteLayout.partyBOpenPositions[quote.partyB][
			quote.partyA
		][lastOpenPositionIndex];
		quoteLayout.partyBPositionsIndex[quoteLayout.partyBOpenPositions[quote.partyB][quote.partyA][lastOpenPositionIndex]] = indexOfPartyBPosition;
		quoteLayout.partyBOpenPositions[quote.partyB][quote.partyA].pop();

		quoteLayout.partyAPositionsIndex[quote.id] = 0;
		quoteLayout.partyBPositionsIndex[quote.id] = 0;
	}

	/**
	 * @notice Calculates the value of a quote for Party A based on the current price and filled amount.
	 * @param currentPrice The current price of the quote.
	 * @param filledAmount The filled amount of the quote.
	 * @param quote The quote for which to calculate the value.
	 * @return hasMadeProfit A boolean indicating whether Party A has made a profit.
	 * @return pnl The profit or loss value for Party A.
	 */
	function getValueOfQuoteForPartyA(
		uint256 currentPrice,
		uint256 filledAmount,
		Quote storage quote
	) internal view returns (bool hasMadeProfit, uint256 pnl) {
		if (currentPrice > quote.openedPrice) {
			if (quote.positionType == PositionType.LONG) {
				hasMadeProfit = true;
			} else {
				hasMadeProfit = false;
			}
			pnl = ((currentPrice - quote.openedPrice) * filledAmount) / 1e18;
		} else {
			if (quote.positionType == PositionType.LONG) {
				hasMadeProfit = false;
			} else {
				hasMadeProfit = true;
			}
			pnl = ((quote.openedPrice - currentPrice) * filledAmount) / 1e18;
		}
	}

	/**
	 * @notice Gets the trading fee for a quote.
	 * @param quoteId The ID of the quote for which to get the trading fee.
	 * @return fee The trading fee for the quote.
	 */
	function getTradingFee(uint256 quoteId) internal view returns (uint256 fee) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];
		if (quote.orderType == OrderType.LIMIT) {
			fee = (LibQuote.quoteOpenAmount(quote) * quote.requestedOpenPrice * quote.tradingFee) / 1e36;
		} else {
			fee = (LibQuote.quoteOpenAmount(quote) * quote.marketPrice * quote.tradingFee) / 1e36;
		}
	}

	/**
	 * @notice Closes a quote.
	 * @param quote The quote to close.
	 * @param filledAmount The filled amount of the quote.
	 * @param closedPrice The price at which the quote is closed.
	 */
	function closeQuote(Quote storage quote, uint256 filledAmount, uint256 closedPrice) internal {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();

		require(
			quote.lockedValues.cva == 0 || (quote.lockedValues.cva * filledAmount) / LibQuote.quoteOpenAmount(quote) > 0,
			"LibQuote: Low filled amount"
		);
		require(
			quote.lockedValues.partyAmm == 0 || (quote.lockedValues.partyAmm * filledAmount) / LibQuote.quoteOpenAmount(quote) > 0,
			"LibQuote: Low filled amount"
		);
		require(
			quote.lockedValues.partyBmm == 0 || (quote.lockedValues.partyBmm * filledAmount) / LibQuote.quoteOpenAmount(quote) > 0,
			"LibQuote: Low filled amount"
		);
		require((quote.lockedValues.lf * filledAmount) / LibQuote.quoteOpenAmount(quote) > 0, "LibQuote: Low filled amount");
		LockedValues memory lockedValues = LockedValues(
			quote.lockedValues.cva - ((quote.lockedValues.cva * filledAmount) / (LibQuote.quoteOpenAmount(quote))),
			quote.lockedValues.lf - ((quote.lockedValues.lf * filledAmount) / (LibQuote.quoteOpenAmount(quote))),
			quote.lockedValues.partyAmm - ((quote.lockedValues.partyAmm * filledAmount) / (LibQuote.quoteOpenAmount(quote))),
			quote.lockedValues.partyBmm - ((quote.lockedValues.partyBmm * filledAmount) / (LibQuote.quoteOpenAmount(quote)))
		);
		accountLayout.lockedBalances[quote.partyA].subQuote(quote).add(lockedValues);
		accountLayout.partyBLockedBalances[quote.partyB][quote.partyA].subQuote(quote).add(lockedValues);
		quote.lockedValues = lockedValues;

		if (LibQuote.quoteOpenAmount(quote) == quote.quantityToClose) {
			require(
				quote.lockedValues.totalForPartyA() == 0 ||
					quote.lockedValues.totalForPartyA() >= symbolLayout.symbols[quote.symbolId].minAcceptableQuoteValue,
				"LibQuote: Remaining quote value is low"
			);
		}

		chargeAccumulatedFundingFee(quote.id);

		(bool hasMadeProfit, uint256 pnl) = LibQuote.getValueOfQuoteForPartyA(closedPrice, filledAmount, quote);

		if (hasMadeProfit) {
			require(
				accountLayout.partyBAllocatedBalances[quote.partyB][quote.partyA] >= pnl,
				"LibQuote: PartyA should first exit its positions that are incurring losses"
			);
			accountLayout.allocatedBalances[quote.partyA] += pnl;
			emit SharedEvents.BalanceChangePartyA(quote.partyA, pnl, SharedEvents.BalanceChangeType.REALIZED_PNL_IN);
			accountLayout.partyBAllocatedBalances[quote.partyB][quote.partyA] -= pnl;
			emit SharedEvents.BalanceChangePartyB(quote.partyB, quote.partyA, pnl, SharedEvents.BalanceChangeType.REALIZED_PNL_OUT);
		} else {
			require(
				accountLayout.allocatedBalances[quote.partyA] >= pnl,
				"LibQuote: PartyA should first exit its positions that are currently in profit."
			);
			accountLayout.allocatedBalances[quote.partyA] -= pnl;
			emit SharedEvents.BalanceChangePartyA(quote.partyA, pnl, SharedEvents.BalanceChangeType.REALIZED_PNL_OUT);
			accountLayout.partyBAllocatedBalances[quote.partyB][quote.partyA] += pnl;
			emit SharedEvents.BalanceChangePartyB(quote.partyB, quote.partyA, pnl, SharedEvents.BalanceChangeType.REALIZED_PNL_IN);
		}

		quote.avgClosedPrice = (quote.avgClosedPrice * quote.closedAmount + filledAmount * closedPrice) / (quote.closedAmount + filledAmount);

		quote.closedAmount += filledAmount;
		quote.quantityToClose -= filledAmount;

		if (quote.closedAmount == quote.quantity) {
			quote.statusModifyTimestamp = block.timestamp;
			quote.quoteStatus = QuoteStatus.CLOSED;
			quote.requestedClosePrice = 0;
			removeFromOpenPositions(quote.id);
			quoteLayout.partyAPositionsCount[quote.partyA] -= 1;
			quoteLayout.partyBPositionsCount[quote.partyB][quote.partyA] -= 1;
		} else if (quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING || quote.quantityToClose == 0) {
			quote.quoteStatus = QuoteStatus.OPENED;
			quote.statusModifyTimestamp = block.timestamp;
			quote.requestedClosePrice = 0;
			quote.quantityToClose = 0; // for CANCEL_CLOSE_PENDING status
		}
	}

	/**
	 * @notice Expires a quote.
	 * @param quoteId The ID of the quote to expire.
	 * @return result The resulting status of the quote after expiration.
	 */
	function expireQuote(uint256 quoteId) internal returns (QuoteStatus result) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		Quote storage quote = quoteLayout.quotes[quoteId];
		require(block.timestamp > quote.deadline, "LibQuote: Quote isn't expired");
		require(
			quote.quoteStatus == QuoteStatus.PENDING ||
				quote.quoteStatus == QuoteStatus.CANCEL_PENDING ||
				quote.quoteStatus == QuoteStatus.LOCKED ||
				quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
				quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
			"LibQuote: Invalid state"
		);
		require(!MAStorage.layout().liquidationStatus[quote.partyA], "LibQuote: PartyA isn't solvent");
		require(!MAStorage.layout().partyBLiquidationStatus[quote.partyB][quote.partyA], "LibQuote: PartyB isn't solvent");
		if (quote.quoteStatus == QuoteStatus.PENDING || quote.quoteStatus == QuoteStatus.LOCKED || quote.quoteStatus == QuoteStatus.CANCEL_PENDING) {
			quote.statusModifyTimestamp = block.timestamp;
			accountLayout.pendingLockedBalances[quote.partyA].subQuote(quote);

			// send trading Fee back to partyA
			uint256 fee = LibQuote.getTradingFee(quote.id);
			accountLayout.allocatedBalances[quote.partyA] += fee;
			emit SharedEvents.BalanceChangePartyA(quote.partyA, fee, SharedEvents.BalanceChangeType.PLATFORM_FEE_IN);

			removeFromPartyAPendingQuotes(quote);
			if (quote.quoteStatus == QuoteStatus.LOCKED || quote.quoteStatus == QuoteStatus.CANCEL_PENDING) {
				accountLayout.partyBPendingLockedBalances[quote.partyB][quote.partyA].subQuote(quote);
				removeFromPartyBPendingQuotes(quote);
			}
			quote.quoteStatus = QuoteStatus.EXPIRED;
			result = QuoteStatus.EXPIRED;
		} else if (quote.quoteStatus == QuoteStatus.CLOSE_PENDING || quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING) {
			quote.statusModifyTimestamp = block.timestamp;
			quote.requestedClosePrice = 0;
			quote.quantityToClose = 0;
			quote.quoteStatus = QuoteStatus.OPENED;
			result = QuoteStatus.OPENED;
		}
	}

	function getAccumulatedFundingFee(uint256 quoteId) internal view returns (int256 fee) {
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[quote.symbolId][quote.partyB];
		if (fundingFee.epochDuration == 0 || quote.lastFundingPaymentTimestamp == 0) {
			return 0;
		}
		uint256 newEpochs = (block.timestamp - ((fundingFee.epochs / fundingFee.epochDuration) * fundingFee.epochDuration)) /
			fundingFee.epochDuration;
		int256 totalFee;
		if (quote.positionType == PositionType.LONG) {
			totalFee = (fundingFee.accumulatedLongFee * int256(fundingFee.epochs)) + (int256(newEpochs) * fundingFee.currentLongFee);
		} else {
			totalFee = (fundingFee.accumulatedShortFee * int256(fundingFee.epochs)) + (int256(newEpochs) * fundingFee.currentShortFee);
		}
		fee = (int256(LibQuote.quoteOpenAmount(quote)) * (totalFee - quote.paidFundingFee)) / 1e18;
		int256 maxFee = int256(quote.maxFundingRate) * int256(block.timestamp - quote.lastFundingPaymentTimestamp);
		if (fee > 0) {
			fee = maxFee > fee ? fee : maxFee;
		} else {
			fee = -maxFee < fee ? fee : -maxFee;
		}
	}

	function chargeAccumulatedFundingFee(uint256 quoteId) internal {
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		int256 fee = getAccumulatedFundingFee(quoteId);
		if (fee > 0) {
			AccountStorage.layout().partyBAllocatedBalances[quote.partyB][quote.partyA] -= uint256(fee);
			AccountStorage.layout().allocatedBalances[quote.partyA] += uint256(fee);
			quote.lastFundingPaymentTimestamp = block.timestamp;
			quote.paidFundingFee += fee;
			emit SharedEvents.BalanceChangePartyA(quote.partyA, uint256(fee), SharedEvents.BalanceChangeType.FUNDING_FEE_IN);
			emit SharedEvents.BalanceChangePartyB(quote.partyB, quote.partyA, uint256(fee), SharedEvents.BalanceChangeType.FUNDING_FEE_OUT);
		} else if (fee < 0) {
			AccountStorage.layout().partyBAllocatedBalances[quote.partyB][quote.partyA] += uint256(-fee);
			AccountStorage.layout().allocatedBalances[quote.partyA] -= uint256(-fee);
			quote.lastFundingPaymentTimestamp = block.timestamp;
			quote.paidFundingFee += fee;
			emit SharedEvents.BalanceChangePartyA(quote.partyA, uint256(-fee), SharedEvents.BalanceChangeType.FUNDING_FEE_OUT);
			emit SharedEvents.BalanceChangePartyB(quote.partyB, quote.partyA, uint256(-fee), SharedEvents.BalanceChangeType.FUNDING_FEE_IN);
		}
	}
}
