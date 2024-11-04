// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./FundingRateFacetImpl.sol";
import "../../utils/Pausable.sol";
import "../../utils/Accessibility.sol";
import "./IFundingRateFacet.sol";

contract FundingRateFacet is Accessibility, Pausable, IFundingRateFacet {
	/// @notice Charges funding rates for a given Party A position.
	/// @param partyA The address of Party A.
	/// @param quoteIds An array of quote IDs that we are about to get fudning for.
	/// @param rates An array of funding rates.
	/// @param upnlSig The Muon signature for upnl of both parties.
	function chargeFundingRate(
		address partyA,
		uint256[] memory quoteIds,
		int256[] memory rates,
		PairUpnlSig memory upnlSig
	) external whenNotPartyBActionsPaused notLiquidatedPartyA(partyA) {
		FundingRateFacetImpl.chargeFundingRate(partyA, quoteIds, rates, upnlSig);
		emit ChargeFundingRate(msg.sender, partyA, quoteIds, rates);
	}

	/// @notice Set funding rates for a given Symbols.
	/// @param symbolIds An array of symbol ids.
	/// @param longFees An array of funding fees for long positions in 18 decimals.
	/// @param shortFees An array of funding fees for short positions in 18 decimals.
	function setFundingFee(
		uint256[] memory symbolIds,
		int256[] memory longFees,
		int256[] memory shortFees,
		int256[] memory marketPrices
	) external whenNotPartyBActionsPaused onlyPartyB {
		FundingRateFacetImpl.setFundingFee(symbolIds, longFees, shortFees, marketPrices);
		emit SetLongFundingFee(symbolIds, longFees, marketPrices, msg.sender);
		emit SetShortFundingFee(symbolIds, shortFees, marketPrices, msg.sender);
	}

	/// @notice Set funding rates for a given Symbols.
	/// @param symbolIds An array of symbol ids.
	/// @param longFees An array of funding fees for long positions in 18 decimals.
	function setLongFundingFee(
		uint256[] memory symbolIds,
		int256[] memory longFees,
		int256[] memory marketPrices
	) external whenNotPartyBActionsPaused onlyPartyB {
		FundingRateFacetImpl.setLongFundingFee(symbolIds, longFees, marketPrices);
		emit SetLongFundingFee(symbolIds, longFees, marketPrices, msg.sender);
	}

	/// @notice Set funding rates for a given Symbols.
	/// @param symbolIds An array of symbol ids.
	/// @param shortFees An array of funding fees for short positions in 18 decimals.
	function setShortFundingFee(
		uint256[] memory symbolIds,
		int256[] memory shortFees,
		int256[] memory marketPrices
	) external whenNotPartyBActionsPaused onlyPartyB {
		FundingRateFacetImpl.setShortFundingFee(symbolIds, shortFees, marketPrices);
		emit SetShortFundingFee(symbolIds, shortFees, marketPrices, msg.sender);
	}

	/// @notice Set epoch durations for funding rates for a given Symbols.
	/// @param symbolIds An array of symbol ids.
	/// @param durations An array of durations for funding fees.
	function setEpochDurations(uint256[] memory symbolIds, uint256[] memory durations) external whenNotPartyBActionsPaused onlyPartyB {
		FundingRateFacetImpl.setEpochDuration(symbolIds, durations, msg.sender);
		emit SetEpochDuration(symbolIds, durations, msg.sender);
	}

	/// @notice Charges funding rates for a given Party A position.
	/// @param partyA The address of Party A.
	/// @param partyB The address of Party B.
	/// @param quoteIds An array of quote IDs that we are about to get fudning for.
	/// @param upnlSig The Muon signature for upnl of both parties.
	function chargeAccumulatedFundingFee(
		address partyA,
		address partyB,
		uint256[] memory quoteIds,
		PairUpnlSig memory upnlSig
	) external whenNotPartyBActionsPaused whenNotPartyAActionsPaused notLiquidatedPartyA(partyA) notLiquidatedPartyB(partyB, partyA) {
		FundingRateFacetImpl.chargeAccumulatedFundingFee(partyA, partyB, quoteIds, upnlSig);
		emit ChargeAccumulatedFundingFee(partyA, partyB, quoteIds, msg.sender);
	}
}

