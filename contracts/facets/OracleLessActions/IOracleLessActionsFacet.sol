// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;
import "./IOracleLessActionsEvents.sol";
import "../../storages/MuonStorage.sol";

interface IOracleLessActionsFacet is IOracleLessActionsEvents {
	function bindToPartyB(address partyB) external;

	function unbindFromPartyB(address partyB) external;

	function lockQuotes(uint256[] memory quoteIds) external;

	function openPositions(uint256[] memory quoteIds, uint256[] memory filledAmounts, uint256[] memory openedPrices) external;

	function fillCloseRequests(uint256[] memory quoteIds, uint256[] memory filledAmounts, uint256[] memory closedPrices) external;
}
