// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/MuonStorage.sol";
import "./SettlementFacetEvents.sol";

interface ISettlementFacet is SettlementFacetEvents {
	function settleUpnl(SettlementSig memory settleSig, uint256[] memory updatedPrices, address partyA) external;
	function settleUpnlAndFillCloseRequests(
		SettlementSig memory settleSig,
		uint256[] memory updatedPrices,
		address partyA,
		uint256[] memory quoteIds,
		uint256[] memory filledAmounts,
		uint256[] memory closedPrices,
		PairUpnlAndPricesSig memory upnlSig
	) external;
}
