// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/MuonStorage.sol";
import "./IClearingHouseFacetEvents.sol";

interface IClearingHouseFacet is IClearingHouseFacetEvents {
	function liquidateCrossPartyB(address partyB, CrossLiquidationSig memory liquidationSig) external;
	function deallocateForCrossLiquidation(address partyB, address[] memory partyAs, uint256[] memory amounts) external;
	function distributeForCrossLiquidation(address partyB, address[] memory receivers, uint256[] memory amount) external;
	function liquidatePendingPositionsForCrossLiquidation(address partyB, address[] memory partyAs) external;
	function liquidatePositionsForCrossLiquidation(address partyB, address partyA, QuotePriceSig memory priceSig) external;
}
