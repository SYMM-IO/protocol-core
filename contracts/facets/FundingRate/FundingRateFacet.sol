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

	// TODO: add comments + add modifiers + add signature?
	function setFundingFee(
		uint256[] memory symbolIds,
		int256[] memory longFees,
		int256[] memory shortFees
	) external whenNotPartyBActionsPaused onlyPartyB {
		FundingRateFacetImpl.setFundingFee(symbolIds, longFees, shortFees);
		emit SetLongFundingFee(symbolIds, longFees, msg.sender);
		emit SetShortFundingFee(symbolIds, shortFees, msg.sender);
	}

	// TODO: add comments + add modifiers + add signature?
	function setLongFundingFee(uint256[] memory symbolIds, int256[] memory longFees) external whenNotPartyBActionsPaused onlyPartyB {
		FundingRateFacetImpl.setLongFundingFee(symbolIds, longFees);
		emit SetLongFundingFee(symbolIds, longFees, msg.sender);
	}

	// TODO: add comments + add modifiers + add signature?
	function setShortFundingFee(uint256[] memory symbolIds, int256[] memory shortFees) external whenNotPartyBActionsPaused onlyPartyB {
		FundingRateFacetImpl.setShortFundingFee(symbolIds, shortFees);
		emit SetShortFundingFee(symbolIds, shortFees, msg.sender);
	}

	// TODO: add comments + add modifiers + add signature?
	function setEpochDurations(uint256[] memory symbolIds, uint256[] memory durations) external whenNotPartyBActionsPaused onlyPartyB {
		FundingRateFacetImpl.setEpochDuration(symbolIds, durations, msg.sender);
		emit SetEpochDuration(symbolIds, durations, msg.sender);
	}

	// TODO: add comments + add modifiers + add signature?
	function chargeAccumulatedFundingFee(uint256[] memory quoteIds) external whenNotPartyBActionsPaused whenNotPartyBActionsPaused {
		FundingRateFacetImpl.chargeAccumulatedFundingFee(quoteIds);
		emit ChargeAccumulatedFundingFee(quoteIds, msg.sender);
	}
}
