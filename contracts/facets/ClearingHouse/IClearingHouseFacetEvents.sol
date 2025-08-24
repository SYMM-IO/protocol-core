// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

interface IClearingHouseFacetEvents {
	event LiquidateCrossPartyB(address indexed initiator, address indexed partyB, bytes liquidationId, int256 upnl, uint256 timestamp);

	event DeallocateForCrossLiquidation(address indexed partyB, address[] indexed partyAs, uint256[] amounts);
	event DistributeForCrossLiquidation(address indexed partyB, address[] partyA, uint256[] amount);
	event LiquidatePendingPositionsForCrossLiquidation(address indexed partyB, address[] indexed partyAs);
	event LiquidatePositionsForCrossLiquidation(
		address indexed partyB,
		address indexed partyA,
		uint256[] quoteIds,
		uint256[] liquidatedAmounts,
		uint256[] closeIds
	);
}
