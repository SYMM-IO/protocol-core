// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/MuonStorage.sol";
import "./IClearingHouseFacetEvents.sol";

interface IClearingHouseFacet is IClearingHouseFacetEvents {
	function liquidateCrossPartyB(address partyB, CrossLiquidation memory liquidationSig) external;
	function deallocateForCrossLiquidation(address partyB, address partyA, uint256 amount) external;
	function transferToPartyA(address partyB, address partyA, uint256 amount) external;
	function transferToLiquidator(address partyB, uint256 liquidatorShare) external;
	function liquidatePendingQuotes(address partyB, address partyA) external;
	function liquidateCrossPositionsPartyB(address partyB, address partyA, QuotePriceSig memory priceSig) external;
}
