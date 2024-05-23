// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;
import "../../interfaces/IPartiesEvents.sol";

interface ILiquidationEvents is IPartiesEvents {
	event LiquidatePartyA(
		address liquidator,
		address partyA,
		uint256 allocatedBalance,
		int256 upnl,
		int256 totalUnrealizedLoss,
		bytes liquidationId,
		uint256 liqduiationBlockNumber,
		uint256 liqduiationTimestamp,
		uint256 liqduiationAllocatedBalance
	);
	event LiquidatePositionsPartyA(
		address liquidator,
		address partyA,
		uint256[] quoteIds,
		uint256[] liquidatedAmounts,
		uint256[] closeIds,
		bytes liquidationId
	);
	event LiquidatePendingPositionsPartyA(address liquidator, address partyA, uint256[] quoteIds, uint256[] liquidatedAmounts, bytes liquidationId);
	event SettlePartyALiquidation(address partyA, address[] partyBs, int256[] amounts, bytes liquidationId);
	event LiquidationDisputed(address partyA, bytes liquidationId);
	event ResolveLiquidationDispute(address partyA, address[] partyBs, int256[] amounts, bool disputed, bytes liquidationId);
	event FullyLiquidatedPartyA(address partyA, bytes liquidationId);
	event LiquidatePositionsPartyB(
		address liquidator,
		address partyB,
		address partyA,
		uint256[] quoteIds,
		uint256[] liquidatedAmounts,
		uint256[] closeIds
	);
	event FullyLiquidatedPartyB(address partyB, address partyA);
	event SetSymbolsPrices(address liquidator, address partyA, uint256[] symbolIds, uint256[] prices, bytes liquidationId);
	event DisputeForLiquidation(address liquidator, address partyA, bytes liquidationId);
}
