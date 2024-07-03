// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/GlobalAppStorage.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/BridgeStorage.sol";
import "../../storages/MAStorage.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

library BridgeFacetImpl {
	using SafeERC20 for IERC20;

	function transferToBridge(address user, uint256 amount, address bridge) internal returns (uint256 currentId) {
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
		BridgeStorage.Layout storage bridgeLayout = BridgeStorage.layout();

		require(bridgeLayout.bridges[bridge], "BridgeFacet: Invalid bridge");
		require(bridge != user, "BridgeFacet: Bridge and user can't be the same");

		uint256 amountWith18Decimals = (amount * 1e18) / (10 ** IERC20Metadata(appLayout.collateral).decimals());
		require(AccountStorage.layout().balances[user] >= amountWith18Decimals, "BridgeFacet: Insufficient balance");

		currentId = ++bridgeLayout.lastId;
		BridgeTransaction memory bridgeTransaction = BridgeTransaction({
			id: currentId,
			amount: amount,
			user: user,
			bridge: bridge,
			timestamp: block.timestamp,
			status: BridgeTransactionStatus.RECEIVED
		});
		AccountStorage.layout().balances[user] -= amountWith18Decimals;
		bridgeLayout.bridgeTransactions[currentId] = bridgeTransaction;
		bridgeLayout.bridgeTransactionIds[bridge].push(currentId);
	}

	function withdrawReceivedBridgeValue(uint256 transactionId) internal {
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
		BridgeStorage.Layout storage bridgeLayout = BridgeStorage.layout();
		require(transactionId <= bridgeLayout.lastId, "BridgeFacet: Invalid transactionId");

		BridgeTransaction storage bridgeTransaction = bridgeLayout.bridgeTransactions[transactionId];

		require(bridgeTransaction.status == BridgeTransactionStatus.RECEIVED, "BridgeFacet: Already withdrawn");
		require(block.timestamp >= MAStorage.layout().deallocateCooldown + bridgeTransaction.timestamp, "BridgeFacet: Cooldown hasn't reached");
		require(msg.sender == bridgeTransaction.bridge, "BridgeFacet: Sender is not the transaction's bridge");

		bridgeTransaction.status = BridgeTransactionStatus.WITHDRAWN;
		IERC20(appLayout.collateral).safeTransfer(bridgeTransaction.bridge, bridgeTransaction.amount);
	}

	function withdrawReceivedBridgeValues(uint256[] memory transactionIds) internal {
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
		BridgeStorage.Layout storage bridgeLayout = BridgeStorage.layout();

		uint256 totalAmount = 0;
		for (uint256 i = transactionIds.length; i != 0; i--) {
			require(transactionIds[i - 1] <= bridgeLayout.lastId, "BridgeFacet: Invalid transactionId");
			BridgeTransaction storage bridgeTransaction = bridgeLayout.bridgeTransactions[transactionIds[i - 1]];
			require(bridgeTransaction.status == BridgeTransactionStatus.RECEIVED, "BridgeFacet: Already withdrawn");
			require(block.timestamp >= MAStorage.layout().deallocateCooldown + bridgeTransaction.timestamp, "BridgeFacet: Cooldown hasn't reached");
			require(bridgeTransaction.bridge == msg.sender, "BridgeFacet: Sender is not the transaction's bridge");

			totalAmount += bridgeTransaction.amount;
			bridgeTransaction.status = BridgeTransactionStatus.WITHDRAWN;
		}

		IERC20(appLayout.collateral).safeTransfer(msg.sender, totalAmount);
	}

	function suspendBridgeTransaction(uint256 transactionId) internal {
		BridgeStorage.Layout storage bridgeLayout = BridgeStorage.layout();
		BridgeTransaction storage bridgeTransaction = bridgeLayout.bridgeTransactions[transactionId];
		
		require(transactionId <= bridgeLayout.lastId, "BridgeFacet: Invalid transactionId");
		require(bridgeTransaction.status == BridgeTransactionStatus.RECEIVED, "BridgeFacet: Invalid status");
		bridgeTransaction.status = BridgeTransactionStatus.SUSPENDED;
	}

	function restoreBridgeTransaction(uint256 transactionId, uint256 validAmount) internal {
		BridgeStorage.Layout storage bridgeLayout = BridgeStorage.layout();
		BridgeTransaction storage bridgeTransaction = bridgeLayout.bridgeTransactions[transactionId];
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();

		require(bridgeTransaction.status == BridgeTransactionStatus.SUSPENDED, "BridgeFacet: Invalid status");
		require(bridgeLayout.invalidBridgedAmountsPool != address(0), "BridgeFacet: Zero address");
		require(validAmount <= bridgeTransaction.amount, "BridgeFacet: High valid amount");

		AccountStorage.layout().balances[bridgeLayout.invalidBridgedAmountsPool] +=
			((bridgeTransaction.amount - validAmount) * (10 ** 18)) /
			(10 ** IERC20Metadata(appLayout.collateral).decimals());
		bridgeTransaction.status = BridgeTransactionStatus.RECEIVED;
		bridgeTransaction.amount = validAmount;
	}
}
