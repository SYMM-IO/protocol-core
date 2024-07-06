// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;
import "../../interfaces/IPartiesEvents.sol";

interface ILiquidationEvents is IPartiesEvents {
	event LiquidatePartyA(address liquidator, address partyA, uint256 allocatedBalance, int256 upnl, int256 totalUnrealizedLoss, bytes liquidationId);
	event LiquidatePartyA(address liquidator, address partyA, uint256 allocatedBalance, int256 upnl, int256 totalUnrealizedLoss); // For backward compatibility, will be removed in future
	event DeferredLiquidatePartyA(
		address liquidator,
		address partyA,
		uint256 allocatedBalance,
		int256 upnl,
		int256 totalUnrealizedLoss,
		bytes liquidationId,
		uint256 liquidationBlockNumber,
		uint256 liquidationTimestamp,
		uint256 liquidationAllocatedBalance
	);
	event LiquidatePositionsPartyA(
		address liquidator,
		address partyA,
		uint256[] quoteIds,
		uint256[] liquidatedAmounts,
		uint256[] closeIds,
		bytes liquidationId
	);
	event LiquidatePositionsPartyA(address liquidator, address partyA, uint256[] quoteIds); // For backward compatibility, will be removed in future
	event LiquidatePendingPositionsPartyA(address liquidator, address partyA, uint256[] quoteIds, uint256[] liquidatedAmounts, bytes liquidationId);
	event LiquidatePendingPositionsPartyA(address liquidator, address partyA); // For backward compatibility, will be removed in future
	event SettlePartyALiquidation(address partyA, address[] partyBs, int256[] amounts, bytes liquidationId);
	event SettlePartyALiquidation(address partyA, address[] partyBs, int256[] amounts); // For backward compatibility, will be removed in future
	event LiquidationDisputed(address partyA, bytes liquidationId);
	event LiquidationDisputed(address partyA); // For backward compatibility, will be removed in future
	event ResolveLiquidationDispute(address partyA, address[] partyBs, int256[] amounts, bool disputed, bytes liquidationId);
	event ResolveLiquidationDispute(address partyA, address[] partyBs, int256[] amounts, bool disputed); // For backward compatibility, will be removed in future
	event FullyLiquidatedPartyA(address partyA, bytes liquidationId);
	event FullyLiquidatedPartyA(address partyA); // For backward compatibility, will be removed in future
	event LiquidatePositionsPartyB(
		address liquidator,
		address partyB,
		address partyA,
		uint256[] quoteIds,
		uint256[] liquidatedAmounts,
		uint256[] closeIds
	);
	event LiquidatePositionsPartyB(address liquidator, address partyB, address partyA, uint256[] quoteIds); // For backward compatibility, will be removed in future
	event FullyLiquidatedPartyB(address partyB, address partyA);
	event SetSymbolsPrices(address liquidator, address partyA, uint256[] symbolIds, uint256[] prices, bytes liquidationId);
	event SetSymbolsPrices(address liquidator, address partyA, uint256[] symbolIds, uint256[] prices); // For backward compatibility, will be removed in future
	event DisputeForLiquidation(address liquidator, address partyA, bytes liquidationId);
}
