// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

interface IExternalTransferRelayer {
	/**
	 * @notice Called when an external transfer is initiated from symmio to target and funds are send over there
	 * @param collateral The collateral token being transferred
	 * @param sender The address initiating the transfer
	 * @param receiver The address receiving the transfer
	 * @param amount The amount of collateral being transferred
	 */
	function onTransfer(address collateral, address sender, address receiver, uint256 amount, address target) external;
}
