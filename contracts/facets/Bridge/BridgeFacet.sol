// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "./BridgeFacetImpl.sol";
import "./IBridgeFacet.sol";

contract BridgeFacet is Accessibility, Pausable, IBridgeFacet {
	/// @notice Transfers a specified amount of collateral to the designated bridge address.
	/// @dev This function can only be called when accounting operations are not paused and the sender is not suspended.
	/// @param amount The precise amount of collateral to be transferred, specified in decimal units.
	/// @param bridgeAddress The address of the bridge to which the collateral will be transferred.
	function transferToBridge(uint256 amount, address bridgeAddress) external whenNotAccountingPaused notSuspended(msg.sender) {
		BridgeFacetImpl.transferToBridge(msg.sender, amount, bridgeAddress);
		emit TransferToBridge(msg.sender, amount, bridgeAddress);
	}

	/// @notice Withdraws the received bridge value associated with a specific transaction ID.
	/// @dev This function can only be called when accounting operations are not paused and the sender is not suspended.
	/// @param transactionId The ID of the transaction for which the received bridge value will be withdrawn.
	function withdrawReceivedBridgeValue(uint256 transactionId) external whenNotAccountingPaused notSuspended(msg.sender) {
		BridgeFacetImpl.withdrawReceivedBridgeValue(transactionId);
		emit WithdrawReceivedBridgeValue(transactionId);
	}

	/// @notice Withdraws the received bridge values associated with multiple transaction IDs.
	/// @dev This function can only be called when accounting operations are not paused and the sender is not suspended.
	/// @param transactionIds An array of transaction IDs for which the received bridge values will be withdrawn.
	function withdrawReceivedBridgeValues(uint256[] memory transactionIds) external whenNotAccountingPaused notSuspended(msg.sender) {
		BridgeFacetImpl.withdrawReceivedBridgeValues(transactionIds);
		emit WithdrawReceivedBridgeValues(transactionIds);
	}
}
