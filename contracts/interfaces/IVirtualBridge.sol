// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

interface IVirtualBridge {
	function onTransferToBridge(address user, uint256 amount, address collateral, bytes memory data) external;
	function onBridgeComplete(address user, uint256 amount, address collateral, bytes memory data) external;
}
