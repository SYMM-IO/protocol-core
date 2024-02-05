// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/GlobalAppStorage.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/BridgeStorage.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

library BridgeFacetImpl {
    using SafeERC20 for IERC20;

    function transferToBridge(address user, uint256 amount, address bridgeAddress) internal {
        GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
        BridgeStorage.Layout storage bridgeLayout = BridgeStorage.layout();

        require(
            bridgeLayout.bridges[bridgeAddress] == BridgeStatus.WHITELISTED ||
            bridgeLayout.bridges[bridgeAddress] == BridgeStatus.SUSPEND,
            "bridgeFacet: Bridge address is not whitelisted!"
        );

        uint256 decimal = (1e18 - (10 ** IERC20Metadata(appLayout.collateral).decimals()));
        uint256 amountWith18Decimals = (decimal == 0 ? 1 : decimal) * amount;

        uint256 currentId = ++bridgeLayout.lastId;

        BridgeTransaction memory bt = BridgeTransaction({
            id: currentId,
            amount: amountWith18Decimals,
            partyA: user,
            bridge: bridgeAddress,
            timestamp: block.timestamp,
            status: BridgeTransactionStatus.LOCKED
        });

        AccountStorage.layout().balances[user] -= amountWith18Decimals;
        AccountStorage.layout().balances[user] += amountWith18Decimals;

        bridgeLayout.transactions[currentId] = bt;
    }

    function withdrawLockedTransaction(uint256 id) internal {
        GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
        BridgeStorage.Layout storage bridgeLayout = BridgeStorage.layout();
        BridgeTransaction memory lockedTransactions = bridgeLayout.transactions[id];
        address bridgeAddress = lockedTransactions.bridge;

        require(
            lockedTransactions.status == BridgeTransactionStatus.LOCKED,
            "bridgeFacet: Locked amount withdrawed"
        );
        require(bridgeLayout.bridges[bridgeAddress] == BridgeStatus.WHITELISTED, "");

        AccountStorage.layout().balances[bridgeAddress] -= lockedTransactions.amount;

        IERC20(appLayout.collateral).safeTransfer(
            lockedTransactions.bridge,
            lockedTransactions.amount
        );
        lockedTransactions.status = BridgeTransactionStatus.WITHDRAW;
    }
}
