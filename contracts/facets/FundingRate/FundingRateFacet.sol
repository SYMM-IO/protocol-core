// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./FundingRateFacetImpl.sol";
import "../../utils/Pausable.sol";
import "./IFundingRateFacet.sol";

contract FundingRateFacet is Pausable, IFundingRateFacet {
	/// @notice Charges funding rates for a given Party A.
	/// @dev This function can only be called when Party B actions are not paused.
	/// @param partyA The address of Party A.
	/// @param quoteIds An array of quote IDs associated with the funding rates.
	/// @param rates An array of funding rates.
	/// @param upnlSig The signature of the PairUpnl data structure.
	function chargeFundingRate(
		address partyA,
		uint256[] memory quoteIds,
		int256[] memory rates,
		PairUpnlSig memory upnlSig
	) external whenNotPartyBActionsPaused {
		FundingRateFacetImpl.chargeFundingRate(partyA, quoteIds, rates, upnlSig);
		emit ChargeFundingRate(msg.sender, partyA, quoteIds, rates);
	}
}
