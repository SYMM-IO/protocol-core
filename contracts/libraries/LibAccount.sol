// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./LibLockedValues.sol";
import "../storages/AccountStorage.sol";

library LibAccount {
    using LockedValuesOps for LockedValues;

    function partyATotalLockedBalances(address partyA) internal view returns (uint256) {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        return
            accountLayout.pendingLockedBalances[partyA].totalForPartyA() +
            accountLayout.lockedBalances[partyA].totalForPartyA();
    }

    function partyBTotalLockedBalances(
        address partyB,
        address partyA
    ) internal view returns (uint256) {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        return
            accountLayout.partyBPendingLockedBalances[partyB][partyA].totalForPartyB() +
            accountLayout.partyBLockedBalances[partyB][partyA].totalForPartyB();
    }

    function partyAAvailableForQuote(int256 upnl, address partyA) internal view returns (int256) {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        int256 available;
        if (upnl >= 0) {
            available =
                int256(accountLayout.allocatedBalances[partyA]) +
                upnl -
                int256(
                    (accountLayout.lockedBalances[partyA].totalForPartyA() +
                        accountLayout.pendingLockedBalances[partyA].totalForPartyA())
                );
        } else {
            int256 mm = int256(accountLayout.lockedBalances[partyA].partyAmm);
            int256 considering_mm = -upnl > mm ? -upnl : mm;
            available =
                int256(accountLayout.allocatedBalances[partyA]) -
                int256(
                    (accountLayout.lockedBalances[partyA].cva +
                        accountLayout.lockedBalances[partyA].lf +
                        accountLayout.pendingLockedBalances[partyA].totalForPartyA())
                ) -
                considering_mm;
        }
        return available;
    }

    function partyAAvailableBalance(int256 upnl, address partyA) internal view returns (int256) {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        int256 available;
        if (upnl >= 0) {
            available =
                int256(accountLayout.allocatedBalances[partyA]) +
                upnl -
                int256(accountLayout.lockedBalances[partyA].totalForPartyA());
        } else {
            int256 mm = int256(accountLayout.lockedBalances[partyA].partyAmm);
            int256 considering_mm = -upnl > mm ? -upnl : mm;
            available =
                int256(accountLayout.allocatedBalances[partyA]) -
                int256(
                    accountLayout.lockedBalances[partyA].cva +
                        accountLayout.lockedBalances[partyA].lf
                ) -
                considering_mm;
        }
        return available;
    }

    function partyAAvailableBalanceForLiquidation(
        int256 upnl,
        address partyA
    ) internal view returns (int256) {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        int256 freeBalance = int256(accountLayout.allocatedBalances[partyA]) -
            int256(accountLayout.lockedBalances[partyA].cva + accountLayout.lockedBalances[partyA].lf);
        return freeBalance + upnl;
    }

    function partyBAvailableForQuote(
        int256 upnl,
        address partyB,
        address partyA
    ) internal view returns (int256) {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        int256 available;
        if (upnl >= 0) {
            available =
                int256(accountLayout.partyBAllocatedBalances[partyB][partyA]) +
                upnl -
                int256(
                    (accountLayout.partyBLockedBalances[partyB][partyA].totalForPartyB() +
                        accountLayout.partyBPendingLockedBalances[partyB][partyA].totalForPartyB())
                );
        } else {
            int256 mm = int256(accountLayout.partyBLockedBalances[partyB][partyA].partyBmm);
            int256 considering_mm = -upnl > mm ? -upnl : mm;
            available =
                int256(accountLayout.partyBAllocatedBalances[partyB][partyA]) -
                int256(
                    (accountLayout.partyBLockedBalances[partyB][partyA].cva +
                        accountLayout.partyBLockedBalances[partyB][partyA].lf +
                        accountLayout.partyBPendingLockedBalances[partyB][partyA].totalForPartyB())
                ) -
                considering_mm;
        }
        return available;
    }

    function partyBAvailableBalance(
        int256 upnl,
        address partyB,
        address partyA
    ) internal view returns (int256) {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        int256 available;
        if (upnl >= 0) {
            available =
                int256(accountLayout.partyBAllocatedBalances[partyB][partyA]) +
                upnl -
                int256(accountLayout.partyBLockedBalances[partyB][partyA].totalForPartyB());
        } else {
            int256 mm = int256(accountLayout.partyBLockedBalances[partyB][partyA].partyBmm);
            int256 considering_mm = -upnl > mm ? -upnl : mm;
            available =
                int256(accountLayout.partyBAllocatedBalances[partyB][partyA]) -
                int256(
                    accountLayout.partyBLockedBalances[partyB][partyA].cva +
                        accountLayout.partyBLockedBalances[partyB][partyA].lf
                ) -
                considering_mm;
        }
        return available;
    }

    function partyBAvailableBalanceForLiquidation(
        int256 upnl,
        address partyB,
        address partyA
    ) internal view returns (int256) {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        int256 a = int256(accountLayout.partyBAllocatedBalances[partyB][partyA]) -
            int256(accountLayout.partyBLockedBalances[partyB][partyA].cva +
                accountLayout.partyBLockedBalances[partyB][partyA].lf);
        return a + upnl;
    }
}
