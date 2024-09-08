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
}
