// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/MuonStorage.sol";
import "../storages/QuoteStorage.sol";
import "./LibAccount.sol";
import "./LibQuote.sol";

library LibSolvency {
	using LockedValuesOps for LockedValues;

	/**
	 * @dev Checks whether both parties (Party A and Party B) will remain solvent after opening a position for a given quote.
	 * @param quoteId The ID of the quote for which the position is being opened.
	 * @param filledAmount The amount of the quote that will be filled by opening the position.
	 * @param upnlSig The struct containing the PairUpnlAndPriceSig information including the unrealized PNL and price signature.
	 * @return A boolean indicating whether both parties remain solvent after opening the position.
	 */
	function isSolventAfterOpenPosition(uint256 quoteId, uint256 filledAmount, PairUpnlAndPriceSig memory upnlSig) internal view returns (bool) {
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		int256 partyBAvailableBalance = LibAccount.partyBAvailableBalanceForLiquidation(upnlSig.upnlPartyB, quote.partyB, quote.partyA);
		int256 partyAAvailableBalance = LibAccount.partyAAvailableBalanceForLiquidation(
			upnlSig.upnlPartyA,
			AccountStorage.layout().allocatedBalances[quote.partyA],
			quote.partyA
		);

		if (quote.positionType == PositionType.LONG) {
			if (quote.openedPrice >= upnlSig.price) {
				uint256 diff = (filledAmount * (quote.openedPrice - upnlSig.price)) / 1e18;
				require(partyAAvailableBalance - int256(diff) >= 0, "LibSolvency: PartyA will be liquidatable");
				require(partyBAvailableBalance + int256(diff) >= 0, "LibSolvency: PartyB will be liquidatable");
			} else {
				uint256 diff = (filledAmount * (upnlSig.price - quote.openedPrice)) / 1e18;
				require(partyBAvailableBalance - int256(diff) >= 0, "LibSolvency: PartyB will be liquidatable");
				require(partyAAvailableBalance + int256(diff) >= 0, "LibSolvency: PartyA will be liquidatable");
			}
		} else if (quote.positionType == PositionType.SHORT) {
			if (quote.openedPrice >= upnlSig.price) {
				uint256 diff = (filledAmount * (quote.openedPrice - upnlSig.price)) / 1e18;
				require(partyBAvailableBalance - int256(diff) >= 0, "LibSolvency: PartyB will be liquidatable");
				require(partyAAvailableBalance + int256(diff) >= 0, "LibSolvency: PartyA will be liquidatable");
			} else {
				uint256 diff = (filledAmount * (upnlSig.price - quote.openedPrice)) / 1e18;
				require(partyAAvailableBalance - int256(diff) >= 0, "LibSolvency: PartyA will be liquidatable");
				require(partyBAvailableBalance + int256(diff) >= 0, "LibSolvency: PartyB will be liquidatable");
			}
		}

		return true;
	}

	/**
	 * @dev Calculates the available balances for Party A and Party B after closing positions for given quotes.
	 * @param quoteIds The ID of the quotes for which the position is being closed.
	 * @param filledAmounts The amount of the quotes that will be filled by closing the position.
	 * @param closedPrices The price at which the positions will be closed.
	 * @param marketPrices The market price of positions that will be closed.
	 * @param upnlPartyB The upnl of partyB
	 * @param upnlPartyA The upnl of partyA
	 * @param partyB Address of partyB
	 * @param partyA Address of partyA
	 * @return partyBAvailableBalance The available balance for Party B after closing the position.
	 * @return partyAAvailableBalance The available balance for Party A after closing the position.
	 */
	function getAvailableBalanceAfterClosePosition(
		uint256[] memory quoteIds,
		uint256[] memory filledAmounts,
		uint256[] memory closedPrices,
		uint256[] memory marketPrices,
		int256 upnlPartyB,
		int256 upnlPartyA,
		address partyB,
		address partyA
	) internal view returns (int256 partyBAvailableBalance, int256 partyAAvailableBalance) {
		partyBAvailableBalance = LibAccount.partyBAvailableBalanceForLiquidation(upnlPartyB, partyB, partyA);
		partyAAvailableBalance = LibAccount.partyAAvailableBalanceForLiquidation(
			upnlPartyA,
			AccountStorage.layout().allocatedBalances[partyA],
			partyA
		);
		for (uint8 i = 0; i < quoteIds.length; i++) {
			uint256 quoteId = quoteIds[i];
			uint256 filledAmount = filledAmounts[i];
			uint256 closedPrice = closedPrices[i];
			uint256 marketPrice = marketPrices[i];
			Quote storage quote = QuoteStorage.layout().quotes[quoteId];
			uint256 unlockedAmount = (filledAmount * (quote.lockedValues.cva + quote.lockedValues.lf)) / LibQuote.quoteOpenAmount(quote);

			partyBAvailableBalance += int256(unlockedAmount);

			partyAAvailableBalance += int256(unlockedAmount);

			if (quote.positionType == PositionType.LONG) {
				if (closedPrice >= marketPrice) {
					uint256 diff = (filledAmount * (closedPrice - marketPrice)) / 1e18;
					partyBAvailableBalance -= int256(diff);
					partyAAvailableBalance += int256(diff);
				} else {
					uint256 diff = (filledAmount * (marketPrice - closedPrice)) / 1e18;
					partyBAvailableBalance += int256(diff);
					partyAAvailableBalance -= int256(diff);
				}
			} else if (quote.positionType == PositionType.SHORT) {
				if (closedPrice <= marketPrice) {
					uint256 diff = (filledAmount * (marketPrice - closedPrice)) / 1e18;
					partyBAvailableBalance -= int256(diff);
					partyAAvailableBalance += int256(diff);
				} else {
					uint256 diff = (filledAmount * (closedPrice - marketPrice)) / 1e18;
					partyBAvailableBalance += int256(diff);
					partyAAvailableBalance -= int256(diff);
				}
			}
		}
	}

	/**
	 * @dev Checks whether both parties (Party A and Party B) will remain solvent after closing positions for given quotes.
	 * @param quoteIds The ID of the quotes for which the position is being closed.
	 * @param filledAmounts The amount of the quotes that will be filled by closing the position.
	 * @param closedPrices The price at which the positions will be closed.
	 * @param marketPrices The market price of positions that will be closed.
	 * @param upnlPartyB The upnl of partyB
	 * @param upnlPartyA The upnl of partyA
	 * @param partyB Address of partyB
	 * @param partyA Address of partyA
	 * @return A boolean indicating whether both parties remain solvent after closing the position.
	 */
	function isSolventAfterClosePosition(
		uint256[] memory quoteIds,
		uint256[] memory filledAmounts,
		uint256[] memory closedPrices,
		uint256[] memory marketPrices,
		int256 upnlPartyB,
		int256 upnlPartyA,
		address partyB,
		address partyA
	) internal view returns (bool) {
		(int256 partyBAvailableBalance, int256 partyAAvailableBalance) = getAvailableBalanceAfterClosePosition(
			quoteIds,
			filledAmounts,
			closedPrices,
			marketPrices,
			upnlPartyB,
			upnlPartyA,
			partyB,
			partyA
		);

		require(partyBAvailableBalance >= 0 && partyAAvailableBalance >= 0, "LibSolvency: Available balance is lower than zero");
		return true;
	}
}
