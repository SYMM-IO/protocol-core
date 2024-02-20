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

	function isSolventAfterOpenPosition(uint256 quoteId, uint256 filledAmount, PairUpnlAndPriceSig memory upnlSig) internal view returns (bool) {
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		int256 partyBAvailableBalance = LibAccount.partyBAvailableBalanceForLiquidation(upnlSig.upnlPartyB, quote.partyB, quote.partyA);
		int256 partyAAvailableBalance = LibAccount.partyAAvailableBalanceForLiquidation(upnlSig.upnlPartyA, quote.partyA);

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

	function getAvailableBalanceAfterClosePosition(
		uint256 quoteId,
		uint256 filledAmount,
		uint256 closedPrice,
		PairUpnlAndPriceSig memory upnlSig
	) internal view returns (int256 partyBAvailableBalance, int256 partyAAvailableBalance) {
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		uint256 unlockedAmount = (filledAmount * (quote.lockedValues.cva + quote.lockedValues.lf)) / LibQuote.quoteOpenAmount(quote);

		partyBAvailableBalance =
			LibAccount.partyBAvailableBalanceForLiquidation(upnlSig.upnlPartyB, quote.partyB, quote.partyA) +
			int256(unlockedAmount);

		partyAAvailableBalance = LibAccount.partyAAvailableBalanceForLiquidation(upnlSig.upnlPartyA, quote.partyA) + int256(unlockedAmount);

		if (quote.positionType == PositionType.LONG) {
			if (closedPrice >= upnlSig.price) {
				uint256 diff = (filledAmount * (closedPrice - upnlSig.price)) / 1e18;
				partyBAvailableBalance -= int256(diff);
				partyAAvailableBalance += int256(diff);
			} else {
				uint256 diff = (filledAmount * (upnlSig.price - closedPrice)) / 1e18;
				partyBAvailableBalance += int256(diff);
				partyAAvailableBalance -= int256(diff);
			}
		} else if (quote.positionType == PositionType.SHORT) {
			if (closedPrice <= upnlSig.price) {
				uint256 diff = (filledAmount * (upnlSig.price - closedPrice)) / 1e18;
				partyBAvailableBalance -= int256(diff);
				partyAAvailableBalance += int256(diff);
			} else {
				uint256 diff = (filledAmount * (closedPrice - upnlSig.price)) / 1e18;
				partyBAvailableBalance += int256(diff);
				partyAAvailableBalance -= int256(diff);
			}
		}
	}

	function isSolventAfterClosePosition(
		uint256 quoteId,
		uint256 filledAmount,
		uint256 closedPrice,
		PairUpnlAndPriceSig memory upnlSig
	) internal view returns (bool) {
		(int256 partyBAvailableBalance, int256 partyAAvailableBalance) = getAvailableBalanceAfterClosePosition(
			quoteId,
			filledAmount,
			closedPrice,
			upnlSig
		);
		require(partyBAvailableBalance >= 0 && partyAAvailableBalance >= 0, "LibSolvency: Available balance is lower than zero");
		return true;
	}

	function isSolventAfterRequestToClosePosition(
		uint256 quoteId,
		uint256 closePrice,
		uint256 quantityToClose,
		SingleUpnlAndPriceSig memory upnlSig
	) internal view returns (bool) {
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		uint256 unlockedAmount = (quantityToClose * (quote.lockedValues.cva + quote.lockedValues.lf)) / LibQuote.quoteOpenAmount(quote);

		int256 availableBalance = LibAccount.partyAAvailableBalanceForLiquidation(upnlSig.upnl, msg.sender) + int256(unlockedAmount);

		require(availableBalance >= 0, "LibSolvency: Available balance is lower than zero");
		if (quote.positionType == PositionType.LONG && closePrice <= upnlSig.price) {
			require(
				uint256(availableBalance) >= ((quantityToClose * (upnlSig.price - closePrice)) / 1e18),
				"LibSolvency: partyA will be liquidatable"
			);
		} else if (quote.positionType == PositionType.SHORT && closePrice >= upnlSig.price) {
			require(
				uint256(availableBalance) >= ((quantityToClose * (closePrice - upnlSig.price)) / 1e18),
				"LibSolvency: partyA will be liquidatable"
			);
		}
		return true;
	}
}
