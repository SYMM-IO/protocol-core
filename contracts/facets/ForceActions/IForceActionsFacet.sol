// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/MuonStorage.sol";
import "./ForceActionsFacetEvents.sol";

interface IForceActionsFacet is ForceActionsFacetEvents {
	function forceCancelQuote(uint256 quoteId) external;

	function forceCancelCloseRequest(uint256 quoteId) external;

	function forceClosePosition(uint256 quoteId, HighLowPriceSig memory sig) external;

	function settleAndForceClosePosition(
		uint256 quoteId,
		HighLowPriceSig memory highLowPriceSig,
		SettlementSig memory settleSig,
		uint256[] memory updatedPrices
	) external;
}
