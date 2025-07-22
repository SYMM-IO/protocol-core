// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/muon/LibMuonFundingRate.sol";
import "../../libraries/LibAccount.sol";
import "../../libraries/LibQuote.sol";
import "../../storages/QuoteStorage.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/SymbolStorage.sol";

/**
 * @title FundingRateFacetImpl
 * @notice Implements funding rate mechanisms for perpetual futures trading
 * @dev Two funding systems are supported:
 *      1. Direct funding rate: Immediate price adjustment based on funding rate
 *      2. Accumulated funding: Tracks funding over epochs and applies in bulk
 */
library FundingRateFacetImpl {
	/**
	 * @notice Applies direct funding rate to open positions
	 * @dev This adjusts the open price of positions based on the funding rate
	 *      - Positive rate: User pays funding fee
	 *      - Negative rate: User receives funding fee
	 * @param partyA The trader's address
	 * @param quoteIds Array of position IDs to apply funding to
	 * @param rates Array of funding rates (in 1e18 precision, can be negative)
	 * @param upnlSig Signature containing unrealized PnL for solvency checks
	 */
	function chargeFundingRate(address partyA, uint256[] memory quoteIds, int256[] memory rates, PairUpnlSig memory upnlSig) internal {
		// Verify the signature contains valid unrealized PnL data
		LibMuonFundingRate.verifyPairUpnl(upnlSig, msg.sender, partyA);
		require(quoteIds.length == rates.length && quoteIds.length > 0, "ChargeFundingFacet: Length not match");

		int256 partyBAvailableBalance = LibAccount.partyBAvailableBalanceForLiquidation(upnlSig.upnlPartyB, msg.sender, partyA);
		int256 partyAAvailableBalance = LibAccount.partyAAvailableBalanceForLiquidation(
			upnlSig.upnlPartyA,
			AccountStorage.layout().allocatedBalances[partyA],
			partyA
		);

		uint256 epochDuration;
		uint256 windowTime;

		// Process each position
		for (uint256 i = 0; i < quoteIds.length; i++) {
			Quote storage quote = QuoteStorage.layout().quotes[quoteIds[i]];

			// Validate quote ownership and status
			require(quote.partyA == partyA, "ChargeFundingFacet: Invalid quote");
			require(quote.partyB == msg.sender, "ChargeFundingFacet: Sender isn't partyB of quote");
			require(
				quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
				"ChargeFundingFacet: Invalid state"
			);

			// Ensure we're not mixing funding systems
			require(
				quote.lastFundingPaymentTimestamp == 0 || SymbolStorage.layout().fundingFees[quote.symbolId][quote.partyB].epochDuration == 0,
				"ChargeFundingFacet: Use accumulated funding fee"
			);

			// Get symbol-specific funding parameters
			epochDuration = SymbolStorage.layout().symbols[quote.symbolId].fundingRateEpochDuration;
			require(epochDuration > 0, "ChargeFundingFacet: Zero funding epoch duration");
			windowTime = SymbolStorage.layout().symbols[quote.symbolId].fundingRateWindowTime;

			// Calculate which epoch we're paying for
			uint256 latestEpochTimestamp = (block.timestamp / epochDuration) * epochDuration;
			uint256 paidTimestamp;

			// Check if we're within the current epoch's payment window
			if (block.timestamp <= latestEpochTimestamp + windowTime) {
				// Pay for the current epoch
				require(latestEpochTimestamp > quote.lastFundingPaymentTimestamp, "ChargeFundingFacet: Funding already paid for this window");
				paidTimestamp = latestEpochTimestamp;
			} else {
				// We're in the grace period before the next epoch
				uint256 nextEpochTimestamp = latestEpochTimestamp + epochDuration;
				require(block.timestamp >= nextEpochTimestamp - windowTime, "ChargeFundingFacet: Current timestamp is out of window");
				require(nextEpochTimestamp > quote.lastFundingPaymentTimestamp, "ChargeFundingFacet: Funding already paid for this window");
				paidTimestamp = nextEpochTimestamp;
			}

			// Apply funding rate to position
			if (rates[i] >= 0) {
				// Positive funding: Longs pay shorts
				require(uint256(rates[i]) <= quote.maxFundingRate, "ChargeFundingFacet: High funding rate");
				uint256 priceAdjustment = (quote.openedPrice * uint256(rates[i])) / 1e18;

				if (quote.positionType == PositionType.LONG) {
					// Long positions: increase open price (negative PnL effect)
					quote.openedPrice += priceAdjustment;
				} else {
					// Short positions: decrease open price (positive PnL effect)
					quote.openedPrice -= priceAdjustment;
				}

				// Transfer funding from longs to shorts
				partyAAvailableBalance -= int256((LibQuote.quoteOpenAmount(quote) * priceAdjustment) / 1e18);
				partyBAvailableBalance += int256((LibQuote.quoteOpenAmount(quote) * priceAdjustment) / 1e18);
			} else {
				// Negative funding: Shorts pay longs
				require(uint256(-rates[i]) <= quote.maxFundingRate, "ChargeFundingFacet: High funding rate");
				uint256 priceAdjustment = (quote.openedPrice * uint256(-rates[i])) / 1e18;

				if (quote.positionType == PositionType.LONG) {
					// Long positions: decrease open price (positive PnL effect)
					quote.openedPrice -= priceAdjustment;
				} else {
					// Short positions: increase open price (negative PnL effect)
					quote.openedPrice += priceAdjustment;
				}

				// Transfer funding from shorts to longs
				partyAAvailableBalance += int256((LibQuote.quoteOpenAmount(quote) * priceAdjustment) / 1e18);
				partyBAvailableBalance -= int256((LibQuote.quoteOpenAmount(quote) * priceAdjustment) / 1e18);
			}

			// Mark this epoch as paid
			quote.lastFundingPaymentTimestamp = paidTimestamp;
		}

		// Ensure neither party becomes insolvent after funding payments
		require(partyAAvailableBalance >= 0, "ChargeFundingFacet: PartyA will be insolvent");
		require(partyBAvailableBalance >= 0, "ChargeFundingFacet: PartyB will be insolvent");

		// Increment nonces for replay protection
		AccountStorage.layout().partyBNonces[msg.sender][partyA] += 1;
		AccountStorage.layout().partyANonces[partyA] += 1;
	}

	/**
	 * @notice Updates the epoch duration for accumulated funding calculation
	 * @dev This recalculates accumulated fees when changing epoch duration
	 * @param symbolIds Array of symbol IDs to update
	 * @param durations New epoch durations for each symbol
	 * @param partyB Market maker address
	 */
	function setEpochDuration(uint256[] memory symbolIds, uint256[] memory durations, address partyB) internal {
		require(symbolIds.length == durations.length, "ChargeFundingFacet: Invalid length");

		for (uint256 i = 0; i < symbolIds.length; i++) {
			require(durations[i] > 0, "ChargeFundingFacet: Zero epoch duration");
			FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[symbolIds[i]][partyB];
			require(fundingFee.epochDuration > 0, "ChargeFundingFacet: Zero epoch duration");

			// Calculate how many epochs have passed since last update
			uint256 lastEpochStartTime = (fundingFee.epochs / fundingFee.epochDuration) * fundingFee.epochDuration;
			uint256 newEpochs = (block.timestamp - lastEpochStartTime) / fundingFee.epochDuration;

			// Recalculate weighted average of accumulated fees
			int256 totalLongFeeWeight = (fundingFee.accumulatedLongFee * int256(fundingFee.epochs)) + (fundingFee.currentLongFee * int256(newEpochs));
			int256 totalShortFeeWeight = (fundingFee.accumulatedShortFee * int256(fundingFee.epochs)) +
				(fundingFee.currentShortFee * int256(newEpochs));
			int256 totalEpochs = int256(newEpochs) + int256(fundingFee.epochs);

			// Update accumulated fees and epoch duration
			fundingFee.accumulatedLongFee = totalLongFeeWeight / totalEpochs;
			fundingFee.accumulatedShortFee = totalShortFeeWeight / totalEpochs;
			fundingFee.epochDuration = durations[i];
			fundingFee.epochs += newEpochs;
		}
	}

	/**
	 * @notice Updates accumulated funding fees for symbols
	 * @dev Calculates weighted average of fees across epochs
	 * @param symbolIds Array of symbol IDs
	 * @param longFees New funding fees for long positions (as rate, not price-adjusted)
	 * @param shortFees New funding fees for short positions (as rate, not price-adjusted)
	 * @param marketPrices Current market prices to convert rates to price terms
	 */
	function updateAccumulatedFundingFee(
		uint256[] memory symbolIds,
		int256[] memory longFees,
		int256[] memory shortFees,
		int256[] memory marketPrices
	) internal {
		require(
			symbolIds.length == longFees.length && longFees.length == shortFees.length && symbolIds.length == marketPrices.length,
			"ChargeFundingFacet: Invalid length"
		);

		for (uint256 i = 0; i < symbolIds.length; i++) {
			FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[symbolIds[i]][msg.sender];
			require(fundingFee.epochDuration > 0, "ChargeFundingFacet: Zero epoch duration");

			// Calculate epochs passed since last update
			uint256 lastEpochStartTime = (fundingFee.epochs / fundingFee.epochDuration) * fundingFee.epochDuration;
			uint256 newEpochs = (block.timestamp - lastEpochStartTime) / fundingFee.epochDuration;

			// Calculate weighted average of accumulated fees
			int256 totalLongFeeWeight = (fundingFee.accumulatedLongFee * int256(fundingFee.epochs)) + (fundingFee.currentLongFee * int256(newEpochs));
			int256 totalShortFeeWeight = (fundingFee.accumulatedShortFee * int256(fundingFee.epochs)) +
				(fundingFee.currentShortFee * int256(newEpochs));
			int256 totalEpochs = int256(newEpochs) + int256(fundingFee.epochs);

			// Convert funding rates to price-adjusted fees
			fundingFee.currentLongFee = (longFees[i] * marketPrices[i]) / 1e18;
			fundingFee.currentShortFee = (shortFees[i] * marketPrices[i]) / 1e18;

			// Update accumulated averages
			fundingFee.accumulatedLongFee = totalLongFeeWeight / totalEpochs;
			fundingFee.accumulatedShortFee = totalShortFeeWeight / totalEpochs;
			fundingFee.epochs += newEpochs;
		}
	}

	/**
	 * @notice Sets funding fees for both long and short positions
	 * @param symbolIds Symbol identifiers
	 * @param longFees Funding rates for long positions
	 * @param shortFees Funding rates for short positions
	 * @param marketPrices Current market prices
	 */
	function setFundingFee(uint256[] memory symbolIds, int256[] memory longFees, int256[] memory shortFees, int256[] memory marketPrices) internal {
		updateAccumulatedFundingFee(symbolIds, longFees, shortFees, marketPrices);
	}

	/**
	 * @notice Updates only long position funding fees
	 * @dev Preserves existing short fees while updating long fees
	 */
	function setLongFundingFee(uint256[] memory symbolIds, int256[] memory longFees, int256[] memory marketPrices) internal {
		require(symbolIds.length == longFees.length && symbolIds.length == marketPrices.length, "ChargeFundingFacet: Invalid length");
		int256[] memory shortFees = new int256[](longFees.length);

		// Preserve existing short fees
		for (uint256 i = 0; i < symbolIds.length; i++) {
			FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[symbolIds[i]][msg.sender];
			// Convert back from price-adjusted to rate
			shortFees[i] = (fundingFee.currentShortFee * 1e18) / marketPrices[i];
		}
		updateAccumulatedFundingFee(symbolIds, longFees, shortFees, marketPrices);
	}

	/**
	 * @notice Updates only short position funding fees
	 * @dev Preserves existing long fees while updating short fees
	 */
	function setShortFundingFee(uint256[] memory symbolIds, int256[] memory shortFees, int256[] memory marketPrices) internal {
		require(symbolIds.length == shortFees.length && symbolIds.length == marketPrices.length, "ChargeFundingFacet: Invalid length");
		int256[] memory longFees = new int256[](shortFees.length);

		// Preserve existing long fees
		for (uint256 i = 0; i < symbolIds.length; i++) {
			FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[symbolIds[i]][msg.sender];
			// Convert back from price-adjusted to rate
			longFees[i] = (fundingFee.currentLongFee * 1e18) / marketPrices[i];
		}
		updateAccumulatedFundingFee(symbolIds, longFees, shortFees, marketPrices);
	}

	/**
	 * @notice Applies accumulated funding fees to positions
	 * @dev Uses the accumulated funding fee system instead of direct rates
	 * @param partyA Trader address
	 * @param partyB Market maker address
	 * @param quoteIds Position IDs to charge
	 * @param upnlSig Unrealized PnL signature for solvency checks
	 */
	function chargeAccumulatedFundingFee(address partyA, address partyB, uint256[] memory quoteIds, PairUpnlSig memory upnlSig) internal {
		LibMuonFundingRate.verifyPairUpnl(upnlSig, partyB, partyA);

		// Apply accumulated funding to each position
		for (uint256 i = 0; i < quoteIds.length; i++) {
			Quote storage quote = QuoteStorage.layout().quotes[quoteIds[i]];
			require(quote.partyA == partyA, "ChargeFundingFacet: Invalid quote");
			require(quote.partyB == partyB, "ChargeFundingFacet: Sender isn't partyB of quote");
			require(
				quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
				"ChargeFundingFacet: Invalid state"
			);

			// Delegate to library function that handles the actual fee calculation
			LibQuote.chargeAccumulatedFundingFee(quoteIds[i]);
		}

		// Verify solvency after all funding fees are applied
		int256 partyBAvailableBalance = LibAccount.partyBAvailableBalanceForLiquidation(upnlSig.upnlPartyB, partyB, partyA);
		int256 partyAAvailableBalance = LibAccount.partyAAvailableBalanceForLiquidation(
			upnlSig.upnlPartyA,
			AccountStorage.layout().allocatedBalances[partyA],
			partyA
		);

		require(partyAAvailableBalance >= 0, "ChargeFundingFacet: PartyA will be insolvent");
		require(partyBAvailableBalance >= 0, "ChargeFundingFacet: PartyB will be insolvent");
	}
}
