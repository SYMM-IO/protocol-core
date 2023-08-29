// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/GlobalAppStorage.sol";
import "../../storages/MAStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../libraries/LibMuon.sol";
import "../../libraries/LibAccount.sol";

library AccountFacetImpl {
    using SafeERC20 for IERC20;

    function deposit(address user, uint256 amount) internal {
        GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
        IERC20(appLayout.collateral).safeTransferFrom(msg.sender, address(this), amount);
        uint256 amountWith18Decimals = (amount * 1e18) /
        (10 ** IERC20Metadata(appLayout.collateral).decimals());
        AccountStorage.layout().balances[user] += amountWith18Decimals;
    }

    function withdraw(address user, uint256 amount) internal {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
        require(
            block.timestamp >=
            accountLayout.withdrawCooldown[msg.sender] + MAStorage.layout().deallocateCooldown,
            "AccountFacet: Cooldown hasn't reached"
        );
        uint256 amountWith18Decimals = (amount * 1e18) /
        (10 ** IERC20Metadata(appLayout.collateral).decimals());
        accountLayout.balances[msg.sender] -= amountWith18Decimals;
        IERC20(appLayout.collateral).safeTransfer(user, amount);
    }

    function allocate(uint256 amount) internal {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        require(
            accountLayout.allocatedBalances[msg.sender] + amount <=
            GlobalAppStorage.layout().balanceLimitPerUser,
            "AccountFacet: Allocated balance limit reached"
        );
        require(accountLayout.balances[msg.sender] >= amount, "AccountFacet: Insufficient balance");
        accountLayout.balances[msg.sender] -= amount;
        accountLayout.allocatedBalances[msg.sender] += amount;
    }

    function deallocate(uint256 amount, SingleUpnlSig memory upnlSig) internal {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        require(
            accountLayout.allocatedBalances[msg.sender] >= amount,
            "AccountFacet: Insufficient allocated Balance"
        );
        LibMuon.verifyPartyAUpnl(upnlSig, msg.sender);
        int256 availableBalance = LibAccount.partyAAvailableForQuote(upnlSig.upnl, msg.sender);
        require(availableBalance >= 0, "AccountFacet: Available balance is lower than zero");
        require(uint256(availableBalance) >= amount, "AccountFacet: partyA will be liquidatable");

        accountLayout.partyANonces[msg.sender] += 1;
        accountLayout.allocatedBalances[msg.sender] -= amount;
        accountLayout.balances[msg.sender] += amount;
        accountLayout.withdrawCooldown[msg.sender] = block.timestamp;
    }

    function transferAllocation(
        uint256 amount,
        address origin,
        address recipient,
        SingleUpnlSig memory upnlSig
    ) internal {
        MAStorage.Layout storage maLayout = MAStorage.layout();
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        require(
            !maLayout.partyBLiquidationStatus[msg.sender][origin],
            "PartyBFacet: PartyB isn't solvent"
        );
        require(
            !maLayout.partyBLiquidationStatus[msg.sender][recipient],
            "PartyBFacet: PartyB isn't solvent"
        );
        require(
            !MAStorage.layout().liquidationStatus[origin],
            "PartyBFacet: Origin isn't solvent"
        );
        require(
            !MAStorage.layout().liquidationStatus[recipient],
            "PartyBFacet: Recipient isn't solvent"
        );
        // deallocate from origin
        require(
            accountLayout.partyBAllocatedBalances[msg.sender][origin] >= amount,
            "PartyBFacet: Insufficient locked balance"
        );
        LibMuon.verifyPartyBUpnl(upnlSig, msg.sender, origin);
        int256 availableBalance = LibAccount.partyBAvailableForQuote(
            upnlSig.upnl,
            msg.sender,
            origin
        );
        require(availableBalance >= 0, "PartyBFacet: Available balance is lower than zero");
        require(uint256(availableBalance) >= amount, "PartyBFacet: Will be liquidatable");

        accountLayout.partyBNonces[msg.sender][origin] += 1;
        accountLayout.partyBAllocatedBalances[msg.sender][origin] -= amount;
        // allocate for recipient
        accountLayout.partyBAllocatedBalances[msg.sender][recipient] += amount;
    }

    function allocateForPartyB(uint256 amount, address partyA) internal {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();

        require(accountLayout.balances[msg.sender] >= amount, "PartyBFacet: Insufficient balance");
        require(
            !MAStorage.layout().partyBLiquidationStatus[msg.sender][partyA],
            "PartyBFacet: PartyB isn't solvent"
        );
        accountLayout.balances[msg.sender] -= amount;
        accountLayout.partyBAllocatedBalances[msg.sender][partyA] += amount;
    }

    function deallocateForPartyB(
        uint256 amount,
        address partyA,
        SingleUpnlSig memory upnlSig
    ) internal {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        require(
            accountLayout.partyBAllocatedBalances[msg.sender][partyA] >= amount,
            "PartyBFacet: Insufficient locked balance"
        );
        LibMuon.verifyPartyBUpnl(upnlSig, msg.sender, partyA);
        int256 availableBalance = LibAccount.partyBAvailableForQuote(
            upnlSig.upnl,
            msg.sender,
            partyA
        );
        require(availableBalance >= 0, "PartyBFacet: Available balance is lower than zero");
        require(uint256(availableBalance) >= amount, "PartyBFacet: Will be liquidatable");

        accountLayout.partyBNonces[msg.sender][partyA] += 1;
        accountLayout.partyBAllocatedBalances[msg.sender][partyA] -= amount;
        accountLayout.balances[msg.sender] += amount;
        accountLayout.withdrawCooldown[msg.sender] = block.timestamp;
    }
}
