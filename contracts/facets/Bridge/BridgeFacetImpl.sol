// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/GlobalAppStorage.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/BridgeStorage.sol";
import "../../storages/MAStorage.sol";

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

library BridgeFacetImpl {
    using SafeERC20 for IERC20;

    function transferToBridge(address partyA, uint256 amount, address bridge) internal {
        GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
        BridgeStorage.Layout storage bridgeLayout = BridgeStorage.layout();

        require(bridgeLayout.bridges[bridge], "BridgeFacet: Bridge address is not whitelist");

        uint256 decimal = (1e18 - (10 ** IERC20Metadata(appLayout.collateral).decimals()));
        uint256 amountWith18Decimals = (decimal == 0 ? 1 : decimal) * amount;
        uint256 currentId = ++bridgeLayout.lastId;

        BridgeTransaction memory bridgeTransaction = BridgeTransaction({
            id: currentId,
            amount: amountWith18Decimals,
            partyA: partyA,
            bridge: bridge,
            timestamp: block.timestamp,
            status: BridgeTransactionStatus.LOCKED
        });

        AccountStorage.layout().balances[partyA] -= amountWith18Decimals;
        AccountStorage.layout().balances[bridge] += amountWith18Decimals;

        bridgeLayout.BridgeTransactions[currentId] = bridgeTransaction;
    }

    function withdrawLockedTransaction(uint256 id) internal {
        GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
        BridgeStorage.Layout storage bridgeLayout = BridgeStorage.layout();
        BridgeTransaction storage bridgeTransaction = bridgeLayout.BridgeTransactions[id];
        address bridgeAddress = bridgeTransaction.bridge;

        require(msg.sender == bridgeAddress, "BridgeFacet: msg.sender is not bridge");
        require(bridgeLayout.bridges[bridgeAddress], "BridgeFacet: Bridge address is not whitelist");
        require(bridgeTransaction.status == BridgeTransactionStatus.LOCKED, "BridgeFacet: Locked amount withdrawn");
        require(block.timestamp >= MAStorage.layout().deallocateCooldown + bridgeTransaction.timestamp, "BridgeFacet: Cooldown hasn't reached");

        AccountStorage.layout().balances[bridgeAddress] -= bridgeTransaction.amount;
        IERC20(appLayout.collateral).safeTransfer(bridgeTransaction.bridge, bridgeTransaction.amount);

        bridgeTransaction.status = BridgeTransactionStatus.WITHDRAWN;
        bridgeLayout.BridgeTransactions[id] = bridgeTransaction;
    }
}
