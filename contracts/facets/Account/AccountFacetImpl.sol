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
import "../../interfaces/IExternalTransferRelayer.sol";

library AccountFacetImpl {
	using SafeERC20 for IERC20;

	function deposit(address user, uint256 amount) internal {
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
		IERC20(appLayout.collateral).safeTransferFrom(msg.sender, address(this), amount);
		uint256 amountWith18Decimals = (amount * 1e18) / (10 ** IERC20Metadata(appLayout.collateral).decimals());
		AccountStorage.layout().balances[user] += amountWith18Decimals;
	}

	function virtualDepositFor(address user, uint256 amount) internal {
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

	function allocate(address user, uint256 amount) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(
			accountLayout.allocatedBalances[user] + amount <= GlobalAppStorage.layout().balanceLimitPerUser,
			"AccountFacet: Allocated balance limit reached"
		);
		require(accountLayout.balances[user] >= amount, "AccountFacet: Insufficient balance");
		accountLayout.balances[user] -= amount;
		accountLayout.allocatedBalances[user] += amount;
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

	function transferAllocation(uint256 amount, address origin, address recipient, SingleUpnlSig memory upnlSig) internal {
		MAStorage.Layout storage maLayout = MAStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(!maLayout.partyBLiquidationStatus[msg.sender][origin], "PartyBFacet: PartyB isn't solvent");
		require(!maLayout.partyBLiquidationStatus[msg.sender][recipient], "PartyBFacet: PartyB isn't solvent");
		require(!maLayout.liquidationStatus[origin], "PartyBFacet: Origin isn't solvent");
		require(!maLayout.liquidationStatus[recipient], "PartyBFacet: Recipient isn't solvent");
		require(!accountLayout.crossLiquidationDetails[msg.sender].inProgress, "PartyBFacet: PartyB isn't solvent");

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
		require(!accountLayout.crossLiquidationDetails[msg.sender].inProgress, "AccountFacet: PartyB isn't solvent");

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

	function activateMasterAccountMode() internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(!accountLayout.masterAccountMode[msg.sender], "AccountFacet: Master account mode is active");
		accountLayout.masterAccountMode[msg.sender] = true;
	}

	function externalTransfer(address sender, address receiver, uint256 amount, address target) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();

		require(amount > 0, "AccountFacet: Amount is zero");
		require(receiver != address(0) && target != address(0), "AccountFacet: Zero receiver or target");
		address relayer = accountLayout.externalTransferTargetsRelayers[target];
		require(relayer != address(0), "AccountFacet: Target not whitelisted");

		uint256 amountWith18Decimals = (amount * 1e18) / (10 ** IERC20Metadata(appLayout.collateral).decimals());
		accountLayout.balances[sender] -= amountWith18Decimals;
		IERC20(appLayout.collateral).safeTransfer(relayer, amount);

		IExternalTransferRelayer(relayer).onTransfer(appLayout.collateral, sender, receiver, amount, target);
	}

	function bindToPartyB(address partyB) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		require(partyB != address(0), "AccountFacet: Zero address");

		BindState storage bindState = accountLayout.bindState[msg.sender];
		require(bindState.status == BindStatus.NOT_BOUND, "AccountFacet: Invalid state");

		bindState.partyB = partyB;
		bindState.status = BindStatus.BOUND;
		bindState.modifyTimestamp = block.timestamp;
	}

	function requestToUnbindFromPartyB() internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		BindState storage bindState = accountLayout.bindState[msg.sender];
		require(bindState.status == BindStatus.BOUND, "AccountFacet: Invalid state");

		bindState.status = BindStatus.PENDING_UNBIND;
		bindState.modifyTimestamp = block.timestamp;
	}

	function cancelUnbindRequest() internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		BindState storage bindState = accountLayout.bindState[msg.sender];
		require(bindState.status == BindStatus.PENDING_UNBIND, "AccountFacet: Invalid state");

		bindState.status = BindStatus.BOUND;
		bindState.modifyTimestamp = block.timestamp;
	}

	function completeUnbindRequest(address partyA) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		BindState storage bindState = accountLayout.bindState[partyA];

		require(bindState.status == BindStatus.PENDING_UNBIND, "AccountFacet: Invalid state");

		if (msg.sender != bindState.partyB)
			require(block.timestamp >= bindState.modifyTimestamp + MAStorage.layout().unbindCooldown, "AccountFacet: Cooldown not reached");

		bindState.partyB = address(0);
		bindState.status = BindStatus.NOT_BOUND;
		bindState.modifyTimestamp = block.timestamp;
	}
}
