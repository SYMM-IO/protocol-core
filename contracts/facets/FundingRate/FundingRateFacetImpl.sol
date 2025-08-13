// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/muon/LibMuonFundingRate.sol";
import "../../libraries/LibAccount.sol";
import "../../libraries/LibQuote.sol";
import "../../libraries/LibFundingRate.sol";
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
				SymbolStorage.layout().fundingFees[quote.symbolId][quote.partyB].epochDuration == 0,
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
	 * @dev Recalculates weighted averages to maintain consistency when changing epoch duration
	 * @param symbolIds Array of symbol IDs to update
	 * @param durations New epoch durations for each symbol (in seconds)
	 * @param partyB Market maker address
	 */
	function setEpochDuration(uint256[] memory symbolIds, uint256[] memory durations, address partyB) internal {
		require(symbolIds.length == durations.length, "FundingRateFacet: Invalid length");

		for (uint256 i = 0; i < symbolIds.length; i++) {
			FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[symbolIds[i]][partyB];
			uint256 currentEpochWithNewDuration = LibFundingRate.getEpochOfTimestamp(block.timestamp, durations[i]);

			if (fundingFee.epochDuration != 0) {
				// Update weighted averages before changing epoch duration
				LibFundingRate.updateAccumulatedRates(fundingFee);

				// Calculate new weighted averages
				fundingFee.startEpoch = fundingFee.startEpochTimeStamp / durations[i];

				uint256 durationRatio = ((durations[i] * 1e18) / fundingFee.epochDuration);
				fundingFee.accumulatedLongRate = (fundingFee.accumulatedLongRate * int256(durationRatio)) / 1e18;
				fundingFee.accumulatedShortRate = (fundingFee.accumulatedShortRate * int256(durationRatio)) / 1e18;

				fundingFee.currentLongRate = (fundingFee.currentLongRate * int256(durationRatio)) / 1e18;
				fundingFee.currentShortRate = (fundingFee.currentShortRate * int256(durationRatio)) / 1e18;

				// Update epoch duration
				fundingFee.lastUpdatedEpoch = LibFundingRate.getEpochOfTimestamp(fundingFee.lastUpdatedTimeStamp, durations[i]);
			} else {
				fundingFee.lastUpdatedEpoch = currentEpochWithNewDuration;
				fundingFee.lastUpdatedTimeStamp = block.timestamp;
			}

			fundingFee.epochDuration = durations[i];
		}
	}

	/**
	 * @notice Updates accumulated funding fees for symbols
	 * @dev Maintains a weighted average of funding rates across all epochs
	 * @param symbolIds Array of symbol IDs
	 * @param longRates New funding rates for long positions (as percentages, not price-adjusted)
	 * @param shortRates New funding rates for short positions (as percentages, not price-adjusted)
	 * @param marketPrices Current market prices to convert rates to price-adjusted values
	 */
	function updateAccumulatedFundingFee(
		uint256[] memory symbolIds,
		int256[] memory longRates,
		int256[] memory shortRates,
		int256[] memory marketPrices
	) internal {
		require(
			symbolIds.length == longRates.length && longRates.length == shortRates.length && symbolIds.length == marketPrices.length,
			"FundingRateFacet: Invalid length"
		);

		for (uint256 i = 0; i < symbolIds.length; i++) {
			FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[symbolIds[i]][msg.sender];

			require(fundingFee.epochDuration > 0, "FundingRateFacet: Epoch duration not set");
			LibFundingRate.updateAccumulatedRates(fundingFee);

			// Convert funding rates to price-adjusted values and store
			fundingFee.currentLongRate = (longRates[i] * marketPrices[i]) / 1e18;
			fundingFee.currentShortRate = (shortRates[i] * marketPrices[i]) / 1e18;

			if(fundingFee.startEpoch == 0){
				fundingFee.startEpoch = LibFundingRate.getEpochOfTimestamp(block.timestamp, fundingFee.epochDuration);
				fundingFee.startEpochTimeStamp = block.timestamp;
			}
		}
	}

	/**
	 * @notice Sets funding fees for both long and short positions
	 */
	function setFundingFee(uint256[] memory symbolIds, int256[] memory longRates, int256[] memory shortRates, int256[] memory marketPrices) internal {
		updateAccumulatedFundingFee(symbolIds, longRates, shortRates, marketPrices);
	}

	/**
	 * @notice Updates only long position funding fees
	 * @dev Preserves existing short fees while updating long fees
	 */
	function setLongFundingFee(uint256[] memory symbolIds, int256[] memory longRates, int256[] memory marketPrices) internal {
		require(symbolIds.length == longRates.length && symbolIds.length == marketPrices.length, "FundingRateFacet: Invalid length");

		int256[] memory shortRates = new int256[](longRates.length);

		// Preserve existing short rates
		for (uint256 i = 0; i < symbolIds.length; i++) {
			FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[symbolIds[i]][msg.sender];
			require(marketPrices[i] > 0, "FundingRateFacet: Invalid market price");
			// Convert back from price-adjusted to rate
			if (marketPrices[i] > 0) {
				shortRates[i] = (fundingFee.currentShortRate * 1e18) / marketPrices[i];
			}
		}
		updateAccumulatedFundingFee(symbolIds, longRates, shortRates, marketPrices);
	}

	/**
	 * @notice Updates only short position funding fees
	 * @dev Preserves existing long fees while updating short fees
	 */
	function setShortFundingFee(uint256[] memory symbolIds, int256[] memory shortRates, int256[] memory marketPrices) internal {
		require(symbolIds.length == shortRates.length && symbolIds.length == marketPrices.length, "FundingRateFacet: Invalid length");

		int256[] memory longRates = new int256[](shortRates.length);

		// Preserve existing long rates
		for (uint256 i = 0; i < symbolIds.length; i++) {
			FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[symbolIds[i]][msg.sender];
			require(marketPrices[i] > 0, "FundingRateFacet: Invalid market price");
			// Convert back from price-adjusted to rate
			if (marketPrices[i] > 0) {
				longRates[i] = (fundingFee.currentLongRate * 1e18) / marketPrices[i];
			}
		}
		updateAccumulatedFundingFee(symbolIds, longRates, shortRates, marketPrices);
	}

	/**
	 * @notice Applies accumulated funding fees to positions
	 * @dev Uses the accumulated funding fee system with weighted averages
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
			require(quote.partyA == partyA, "FundingRateFacet: Invalid quote");
			require(quote.partyB == partyB, "FundingRateFacet: Sender isn't partyB of quote");
			require(
				quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
				"FundingRateFacet: Invalid state"
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

		require(partyAAvailableBalance >= 0, "FundingRateFacet: PartyA will be insolvent");
		require(partyBAvailableBalance >= 0, "FundingRateFacet: PartyB will be insolvent");
	}
}
