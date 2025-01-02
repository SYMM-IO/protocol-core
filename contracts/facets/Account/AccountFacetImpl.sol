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
import "../../libraries/muon/LibMuonAccount.sol";
import "../../libraries/LibAccount.sol";

library AccountFacetImpl {
	using SafeERC20 for IERC20;

	function deposit(address user, uint256 amount) internal {
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
		IERC20(appLayout.collateral).safeTransferFrom(msg.sender, address(this), amount);
		uint256 amountWith18Decimals = (amount * 1e18) / (10 ** IERC20Metadata(appLayout.collateral).decimals());
		AccountStorage.layout().balances[user] += amountWith18Decimals;
	}

	function securedDepositFor(address user, uint256 amount) internal {
		AccountStorage.layout().balances[user] += amount;
	}

	function withdraw(address user, uint256 amount) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
		require(
			block.timestamp >= accountLayout.withdrawCooldown[msg.sender] + MAStorage.layout().deallocateCooldown,
			"AccountFacet: Cooldown hasn't reached"
		);
		uint256 amountWith18Decimals = (amount * 1e18) / (10 ** IERC20Metadata(appLayout.collateral).decimals());
		accountLayout.balances[msg.sender] -= amountWith18Decimals;
		IERC20(appLayout.collateral).safeTransfer(user, amount);
	}

	function allocate(uint256 amount) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(
			accountLayout.allocatedBalances[msg.sender] + amount <= GlobalAppStorage.layout().balanceLimitPerUser,
			"AccountFacet: Allocated balance limit reached"
		);
		require(accountLayout.balances[msg.sender] >= amount, "AccountFacet: Insufficient balance");
		accountLayout.balances[msg.sender] -= amount;
		accountLayout.allocatedBalances[msg.sender] += amount;
	}

	function deallocate(uint256 amount, SingleUpnlSig memory upnlSig) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(
			block.timestamp >= accountLayout.withdrawCooldown[msg.sender] + MAStorage.layout().deallocateDebounceTime,
			"AccountFacet: Too many deallocate in a short window"
		);
		require(accountLayout.allocatedBalances[msg.sender] >= amount, "AccountFacet: Insufficient allocated Balance");
		LibMuonAccount.verifyPartyAUpnl(upnlSig, msg.sender);
		int256 availableBalance = LibAccount.partyAAvailableForQuote(upnlSig.upnl, msg.sender);
		require(availableBalance >= 0, "AccountFacet: Available balance is lower than zero");
		require(uint256(availableBalance) >= amount, "AccountFacet: partyA will be liquidatable");

		accountLayout.allocatedBalances[msg.sender] -= amount;
		accountLayout.balances[msg.sender] += amount;
		accountLayout.withdrawCooldown[msg.sender] = block.timestamp;
	}

	function deferredWithdraw(uint256 amount, address to) internal returns (uint256 currentId) {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(to != address(0), "AccountFacet: Zero address");
		require(accountLayout.balances[msg.sender] >= amount, "AccountFacet: Insufficient balance");

		accountLayout.balances[msg.sender] -= amount;

		currentId = ++accountLayout.lastdeferredWithdrawId;
		DeferredWithdraw memory withdrawObject = DeferredWithdraw({
			id: currentId,
			amount: amount,
			user: msg.sender,
			to: to,
			timestamp: block.timestamp,
			status: DeferredWithdrawStatus.INITIATED
		});
		accountLayout.deferredWithdraws[currentId] = withdrawObject;
		accountLayout.deferredWithdrawIds[msg.sender].push(currentId);
	}

	function claimDeferredWithdraw(uint256 id) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		DeferredWithdraw storage withdrawObject = accountLayout.deferredWithdraws[id];
		require(id <= accountLayout.lastdeferredWithdrawId, "AccountFacet: Invalid Id");
		require(withdrawObject.status == DeferredWithdrawStatus.INITIATED, "AccountFacet: Already withdrawn");
		require(block.timestamp >= MAStorage.layout().deallocateCooldown + withdrawObject.timestamp, "AccountFacet: Cooldown hasn't reached");
		require(withdrawObject.user != address(0), "AccountFacet: Zero address");
		require(!AccountStorage.layout().suspendedAddresses[withdrawObject.to], "AccountFacet: Receiver address is Suspended");

		withdrawObject.status = DeferredWithdrawStatus.COMPLETED;
		uint256 amountInCollateralDecimals = (withdrawObject.amount * (10 ** IERC20Metadata(GlobalAppStorage.layout().collateral).decimals())) / 1e18;
		IERC20(GlobalAppStorage.layout().collateral).safeTransfer(withdrawObject.to, amountInCollateralDecimals);
	}

	function cancelDeferredWithdraw(uint256 id) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		DeferredWithdraw storage withdrawObject = accountLayout.deferredWithdraws[id];
		require(id <= accountLayout.lastdeferredWithdrawId, "AccountFacet: Invalid Id");
		require(withdrawObject.status == DeferredWithdrawStatus.INITIATED, "AccountFacet: Already withdrawn");
		require(withdrawObject.user != address(0), "AccountFacet: Zero address");
		require(!AccountStorage.layout().suspendedAddresses[withdrawObject.user], "AccountFacet: Receiver address is Suspended");
		withdrawObject.status = DeferredWithdrawStatus.CANCELED;
		accountLayout.balances[withdrawObject.user] += withdrawObject.amount;
	}

	function transferAllocation(uint256 amount, address origin, address recipient, SingleUpnlSig memory upnlSig) internal {
		MAStorage.Layout storage maLayout = MAStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(!maLayout.partyBLiquidationStatus[msg.sender][origin], "PartyBFacet: PartyB isn't solvent");
		require(!maLayout.partyBLiquidationStatus[msg.sender][recipient], "PartyBFacet: PartyB isn't solvent");
		require(!MAStorage.layout().liquidationStatus[origin], "PartyBFacet: Origin isn't solvent");
		require(!MAStorage.layout().liquidationStatus[recipient], "PartyBFacet: Recipient isn't solvent");
		// deallocate from origin
		require(accountLayout.partyBAllocatedBalances[msg.sender][origin] >= amount, "PartyBFacet: Insufficient locked balance");
		LibMuonAccount.verifyPartyBUpnl(upnlSig, msg.sender, origin);
		int256 availableBalance = LibAccount.partyBAvailableForQuote(upnlSig.upnl, msg.sender, origin);
		require(availableBalance >= 0, "PartyBFacet: Available balance is lower than zero");
		require(uint256(availableBalance) >= amount, "PartyBFacet: Will be liquidatable");

		accountLayout.partyBAllocatedBalances[msg.sender][origin] -= amount;
		// allocate for recipient
		accountLayout.partyBAllocatedBalances[msg.sender][recipient] += amount;
	}

	function internalTransfer(address user, uint256 amount) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		require(
			accountLayout.allocatedBalances[user] + amount <= GlobalAppStorage.layout().balanceLimitPerUser,
			"AccountFacet: Allocated balance limit reached"
		);
		require(accountLayout.balances[msg.sender] >= amount, "AccountFacet: Insufficient balance");
		accountLayout.balances[msg.sender] -= amount;
		accountLayout.allocatedBalances[user] += amount;
	}

	function allocateForPartyB(uint256 amount, address partyA) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		require(accountLayout.balances[msg.sender] >= amount, "AccountFacet: Insufficient balance");
		require(!MAStorage.layout().partyBLiquidationStatus[msg.sender][partyA], "AccountFacet: PartyB isn't solvent");
		accountLayout.balances[msg.sender] -= amount;
		accountLayout.partyBAllocatedBalances[msg.sender][partyA] += amount;
	}

	function deallocateForPartyB(uint256 amount, address partyA, SingleUpnlSig memory upnlSig) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(accountLayout.partyBAllocatedBalances[msg.sender][partyA] >= amount, "AccountFacet: Insufficient allocated balance");
		LibMuonAccount.verifyPartyBUpnl(upnlSig, msg.sender, partyA);
		int256 availableBalance = LibAccount.partyBAvailableForQuote(upnlSig.upnl, msg.sender, partyA);
		require(availableBalance >= 0, "AccountFacet: Available balance is lower than zero");
		require(uint256(availableBalance) >= amount, "AccountFacet: Will be liquidatable");

		accountLayout.partyBAllocatedBalances[msg.sender][partyA] -= amount;
		accountLayout.balances[msg.sender] += amount;
		accountLayout.withdrawCooldown[msg.sender] = block.timestamp;
	}

	function depositToReserveVault(uint256 amount, address partyB) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(amount <= accountLayout.balances[msg.sender], "AccountFacet: Insufficient balance");
		require(MAStorage.layout().partyBStatus[partyB], "AccountFacet: Should be partyB");
		accountLayout.balances[msg.sender] -= amount;
		accountLayout.reserveVault[partyB] += amount;
	}

	function withdrawFromReserveVault(uint256 amount) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(amount > 0 && amount <= accountLayout.reserveVault[msg.sender], "AccountFacet: Insufficient balance");
		accountLayout.reserveVault[msg.sender] -= amount;
		accountLayout.balances[msg.sender] += amount;
		accountLayout.withdrawCooldown[msg.sender] = block.timestamp;
	}

	function allocateFromReserveVault(address partyA, uint256 amount) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(amount > 0 && amount <= accountLayout.reserveVault[msg.sender], "AccountFacet: Insufficient balance");
		accountLayout.reserveVault[msg.sender] -= amount;
		accountLayout.partyBAllocatedBalances[msg.sender][partyA] += amount;
	}

	function deallocateToReserveVault(address partyA, uint256 amount, SingleUpnlSig memory upnlSig) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(accountLayout.partyBAllocatedBalances[msg.sender][partyA] >= amount, "AccountFacet: Insufficient allocated balance");
		LibMuonAccount.verifyPartyBUpnl(upnlSig, msg.sender, partyA);
		int256 availableBalance = LibAccount.partyBAvailableForQuote(upnlSig.upnl, msg.sender, partyA);
		require(availableBalance >= 0, "AccountFacet: Available balance is lower than zero");
		require(uint256(availableBalance) >= amount, "AccountFacet: Will be liquidatable");

		accountLayout.partyBAllocatedBalances[msg.sender][partyA] -= amount;
		accountLayout.reserveVault[msg.sender] += amount;
	}
}
