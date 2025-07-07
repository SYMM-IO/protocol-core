// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

interface IClearingHouseFacetEvents {
	event LiquidatePartyBClearingHouse(
		address indexed initiator,
		address indexed partyB,
		bytes liquidationId,
		int256 upnl,
		int256 totalUnrealizedLoss,
		uint256 timestamp
	);

	event DeallocateForLiquidation(address indexed partyB, address indexed partyA, uint256 amount);
	event TransferToPartyA(address indexed partyB, address indexed partyA, uint256 amount);
	event TransferToLiquidator(address indexed partyB, address indexed liquidator, uint256 amount);
	event LiquidatePendingQuotes(address indexed partyB, address indexed partyA);
	event LiquidatePositionsPartyB(
		address indexed partyB,
		address indexed partyA,
		uint256[] quoteIds,
		uint256[] liquidatedAmounts,
		uint256[] closeIds
	);
}
