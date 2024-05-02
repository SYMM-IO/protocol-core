// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./IBridgeEvents.sol";

interface IBridgeFacet is IBridgeEvents {
	function transferToBridge(uint256 amount, address bridgeAddress) external;

	function suspendBridgeTransaction(uint256 transactionId) external;

	function restoreBridgeTransaction(uint256 transactionId, uint256 validAmount) external;

	function withdrawReceivedBridgeValue(uint256 transactionId) external;

	function withdrawReceivedBridgeValues(uint256[] memory transactionIds) external;
}
