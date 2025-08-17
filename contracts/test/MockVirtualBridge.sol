// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "../interfaces/IVirtualBridge.sol";

/**
 * @title MockVirtualBridge
 * @notice Test helper that implements IVirtualBridge and exposes
 *         state for assertions in tests. Supports configurable
 *         revert behavior and simple scenario simulation.
 */
contract MockVirtualBridge is IVirtualBridge {
	// ============ Types ============

	struct CallData {
		address user;
		uint256 amount;
		address collateral;
		bytes data;
	}

	// ============ Storage ============

	// Last captured inputs
	CallData private _lastTransferCall;
	CallData private _lastCompleteCall;

	// Call counters
	uint256 public transferCallCount;
	uint256 public completeCallCount;

	// ============ Events ============

	event OnTransferToBridge(address indexed user, uint256 amount, address indexed collateral, bytes data);
	event OnBridgeComplete(address indexed user, uint256 amount, address indexed collateral, bytes data);

	// ============ Configurable behavior ============
	bool public shouldRevertOnTransfer;
	bool public shouldRevertOnComplete;
	string public revertMessageOnTransfer;
	string public revertMessageOnComplete;

	// ============ IVirtualBridge ============

	function onTransferToBridge(address user, uint256 amount, address collateral, bytes memory data) external override {
		if (shouldRevertOnTransfer) {
			string memory msg_ = bytes(revertMessageOnTransfer).length > 0 ? revertMessageOnTransfer : "MockVirtualBridge: revert on transfer";
			revert(msg_);
		}
		transferCallCount += 1;
		_lastTransferCall = CallData({ user: user, amount: amount, collateral: collateral, data: data });

		emit OnTransferToBridge(user, amount, collateral, data);
	}

	function onBridgeComplete(address user, uint256 amount, address collateral, bytes memory data) external override {
		if (shouldRevertOnComplete) {
			string memory msg_ = bytes(revertMessageOnComplete).length > 0 ? revertMessageOnComplete : "MockVirtualBridge: revert on complete";
			revert(msg_);
		}
		completeCallCount += 1;
		_lastCompleteCall = CallData({ user: user, amount: amount, collateral: collateral, data: data });

		emit OnBridgeComplete(user, amount, collateral, data);
	}

	// ============ Getters for test assertions ============

	function getLastTransferCall() external view returns (address user, uint256 amount, address collateral, bytes memory data, uint256 callCount) {
		CallData memory c = _lastTransferCall;
		return (c.user, c.amount, c.collateral, c.data, transferCallCount);
	}

	function getLastCompleteCall() external view returns (address user, uint256 amount, address collateral, bytes memory data, uint256 callCount) {
		CallData memory c = _lastCompleteCall;
		return (c.user, c.amount, c.collateral, c.data, completeCallCount);
	}
}
