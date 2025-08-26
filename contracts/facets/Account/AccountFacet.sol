// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "./IAccountFacet.sol";
import "./AccountFacetImpl.sol";
import "../../storages/GlobalAppStorage.sol";
import "../../libraries/SharedEvents.sol";

contract AccountFacet is Accessibility, Pausable, IAccountFacet {
	/// @notice Allows either PartyA or PartyB to deposit collateral.
	/// @param amount The amount of collateral to be deposited, specified in collateral decimals.
	function deposit(uint256 amount) external whenNotAccountingPaused {
		AccountFacetImpl.deposit(msg.sender, amount);
		emit Deposit(msg.sender, msg.sender, amount);
	}

	/// @notice Allows either Party A or Party B to deposit collateral on behalf of another user.
	/// @param user The recipient address for the deposit.
	/// @param amount The amount of collateral to be deposited, specified in collateral decimals.
	function depositFor(address user, uint256 amount) external whenNotAccountingPaused {
		AccountFacetImpl.deposit(user, amount);
		emit Deposit(msg.sender, user, amount);
	}

	/// @notice Allows the virtual depositor role to deposit collateral on behalf of another user without actual fund transfer.
	/// @param user The recipient address for the deposit.
	/// @param amount The amount of collateral to be deposited, specified in collateral decimals.
	function virtualDepositFor(address user, uint256 amount) external whenNotAccountingPaused onlyRole(LibAccessibility.VIRTUAL_DEPOSITOR_ROLE) {
		AccountFacetImpl.virtualDepositFor(user, amount);
		emit Deposit(msg.sender, user, amount);
	}

	/// @notice Allows either PartyA or PartyB to withdraw a specified amount of collateral, provided that the withdrawal cooldown period has elapsed.
	/// @param amount The precise amount of collateral to be withdrawn, specified in collateral decimals.
	function withdraw(uint256 amount) external whenNotAccountingPaused notSuspended(msg.sender) {
		AccountFacetImpl.withdraw(msg.sender, amount);
		emit Withdraw(msg.sender, msg.sender, amount);
	}

	/// @notice Allows either Party A or Party B to withdraw a specified amount of collateral and transfer it to another user, provided that the withdrawal cooldown period has elapsed.
	/// @param user The recipient address for the withdrawal.
	/// @param amount The precise amount of collateral to be withdrawn, specified in collateral decimals.
	function withdrawTo(address user, uint256 amount) external whenNotAccountingPaused notSuspended(msg.sender) {
		AccountFacetImpl.withdraw(user, amount);
		emit Withdraw(msg.sender, user, amount);
	}

	/// @notice Allows Party A to allocate a specified amount of collateral. Allocated amounts are which user can actually trade on.
	/// @param amount The precise amount of collateral to be allocated, specified in 18 decimals.
	function allocate(uint256 amount) external whenNotAccountingPaused notSuspended(msg.sender) notLiquidatedPartyA(msg.sender) {
		AccountFacetImpl.allocate(msg.sender, amount);
		emit AllocatePartyA(msg.sender, amount, AccountStorage.layout().allocatedBalances[msg.sender]);
		emit SharedEvents.BalanceChangePartyA(msg.sender, amount, SharedEvents.BalanceChangeType.ALLOCATE);
	}

	/// @notice Allows Party A to deposit a specified amount of collateral and immediately allocate it.
	/// @param amount The precise amount of collateral to be deposited and allocated, specified in collateral decimals.
	function depositAndAllocate(uint256 amount) external whenNotAccountingPaused notLiquidatedPartyA(msg.sender) notSuspended(msg.sender) {
		AccountFacetImpl.deposit(msg.sender, amount);
		uint256 amountWith18Decimals = (amount * 1e18) / (10 ** IERC20Metadata(GlobalAppStorage.layout().collateral).decimals());
		AccountFacetImpl.allocate(msg.sender, amountWith18Decimals);
		emit Deposit(msg.sender, msg.sender, amount);
		emit AllocatePartyA(msg.sender, amountWith18Decimals, AccountStorage.layout().allocatedBalances[msg.sender]);
		emit SharedEvents.BalanceChangePartyA(msg.sender, amountWith18Decimals, SharedEvents.BalanceChangeType.ALLOCATE);
	}

	function depositAndAllocateFor(
		address user,
		uint256 amount
	) external whenNotAccountingPaused notLiquidatedPartyA(msg.sender) notSuspended(msg.sender) {
		AccountFacetImpl.deposit(user, amount);
		uint256 amountWith18Decimals = (amount * 1e18) / (10 ** IERC20Metadata(GlobalAppStorage.layout().collateral).decimals());
		AccountFacetImpl.allocate(user, amountWith18Decimals);
		emit Deposit(msg.sender, user, amount);
		emit AllocatePartyA(user, amountWith18Decimals, AccountStorage.layout().allocatedBalances[msg.sender]);
		emit SharedEvents.BalanceChangePartyA(user, amountWith18Decimals, SharedEvents.BalanceChangeType.ALLOCATE);
	}

	/// @notice Allows Party A to deallocate a specified amount of collateral.
	/// @param amount The precise amount of collateral to be deallocated, specified in 18 decimals.
	/// @param upnlSig The Muon signature for SingleUpnlSig.
	function deallocate(uint256 amount, SingleUpnlSig memory upnlSig) external whenNotAccountingPaused notLiquidatedPartyA(msg.sender) {
		AccountFacetImpl.deallocate(amount, upnlSig);
		emit DeallocatePartyA(msg.sender, amount, AccountStorage.layout().allocatedBalances[msg.sender]);
		emit SharedEvents.BalanceChangePartyA(msg.sender, amount, SharedEvents.BalanceChangeType.DEALLOCATE);
	}

	/// @notice Transfers the sender's deposited balance to the user allocated balance.
	/// @dev The sender and the recipient user cannot be partyB.
	/// @dev PartyA should not be in the liquidation process.
	/// @param user The address of the user to whom the amount will be allocated.
	/// @param amount The amount to transfer and allocate in 18 decimals.
	function internalTransfer(
		address user,
		uint256 amount
	) external whenNotInternalTransferPaused userNotPartyB(user) notSuspended(msg.sender) notSuspended(user) notLiquidatedPartyA(user) {
		AccountFacetImpl.internalTransfer(user, amount);
		emit InternalTransfer(msg.sender, user, AccountStorage.layout().allocatedBalances[user], amount);
		emit Withdraw(msg.sender, user, ((amount * (10 ** IERC20Metadata(GlobalAppStorage.layout().collateral).decimals())) / (10 ** 18)));
		emit AllocatePartyA(user, amount, AccountStorage.layout().allocatedBalances[user]);
		emit SharedEvents.BalanceChangePartyA(user, amount, SharedEvents.BalanceChangeType.ALLOCATE);
	}

	/// @notice Allows Party B to allocate a specified amount of collateral for an specified partyA.
	/// @dev This function can only be called by Party B when Party B actions are not paused and Party B is not liquidated.
	/// @param amount The precise amount of collateral to be allocated, specified in 18 decimals.
	/// @param partyA The address of Party A
	function allocateForPartyB(uint256 amount, address partyA) public whenNotPartyBActionsPaused notLiquidatedPartyB(msg.sender, partyA) onlyPartyB {
		AccountFacetImpl.allocateForPartyB(amount, partyA);
		emit AllocateForPartyB(msg.sender, partyA, amount, AccountStorage.layout().partyBAllocatedBalances[msg.sender][partyA]);
		emit SharedEvents.BalanceChangePartyB(msg.sender, partyA, amount, SharedEvents.BalanceChangeType.ALLOCATE);
	}

	/// @notice Allows Party B to deallocate a specified amount of collateral
	/// @dev This function can only be called by Party B when Party B actions are not paused and neither Party A nor Party B is liquidated.
	/// @param amount The precise amount of collateral to be deallocated, specified in decimals.
	/// @param partyA The address of Party A
	/// @param upnlSig The Muon signature for SingleUpnlSig.
	function deallocateForPartyB(
		uint256 amount,
		address partyA,
		SingleUpnlSig memory upnlSig
	) external whenNotPartyBActionsPaused notLiquidatedPartyB(msg.sender, partyA) notSuspended(msg.sender) notLiquidatedPartyA(partyA) onlyPartyB {
		AccountFacetImpl.deallocateForPartyB(amount, partyA, upnlSig);
		emit DeallocateForPartyB(msg.sender, partyA, amount, AccountStorage.layout().partyBAllocatedBalances[msg.sender][partyA]);
		emit SharedEvents.BalanceChangePartyB(msg.sender, partyA, amount, SharedEvents.BalanceChangeType.DEALLOCATE);
	}

	/// @notice Allows transferring the allocation of partyB from one party A to another.
	/// @param amount The precise amount of collateral to be transferred, specified in decimals.
	/// @param origin The address of the party A whose allocation is being transferred.
	/// @param recipient The address of the party A who will receive the transferred allocation.
	/// @param upnlSig The Muon signature for SingleUpnlSig.
	function transferAllocation(uint256 amount, address origin, address recipient, SingleUpnlSig memory upnlSig) external whenNotPartyBActionsPaused {
		AccountFacetImpl.transferAllocation(amount, origin, recipient, upnlSig);
		emit TransferAllocation(
			amount,
			origin,
			AccountStorage.layout().partyBAllocatedBalances[msg.sender][origin],
			recipient,
			AccountStorage.layout().partyBAllocatedBalances[msg.sender][recipient]
		);
		emit SharedEvents.BalanceChangePartyB(msg.sender, origin, amount, SharedEvents.BalanceChangeType.DEALLOCATE);
		emit SharedEvents.BalanceChangePartyB(msg.sender, recipient, amount, SharedEvents.BalanceChangeType.ALLOCATE);
	}

	/// @notice Allows transferring the balance of partyB to emergency reserve vault.
	/// @param amount The precise amount of collateral to be transferred to emergency reserve vault, specified in 18 decimals.
	function depositToReserveVault(uint256 amount, address partyB) external whenNotPartyBActionsPaused notSuspended(msg.sender) notSuspended(partyB) {
		AccountFacetImpl.depositToReserveVault(amount, partyB);
		emit DepositToReserveVault(msg.sender, partyB, amount);
	}

	/// @notice Allows transferring the balance of partyB in emergency reserve vault to balance.
	/// @param amount The precise amount of collateral to be transferred from emergency reserve vault, specified in 18 decimals.
	function withdrawFromReserveVault(uint256 amount) external whenNotPartyBActionsPaused notSuspended(msg.sender) {
		AccountFacetImpl.withdrawFromReserveVault(amount);
		emit WithdrawFromReserveVault(msg.sender, amount);
	}

	/// @notice Activates master account mode for Party B
	/// @dev Can only be called by Party B when not paused and not suspended
	function activateMasterAccountMode() external whenNotPartyBActionsPaused notSuspended(msg.sender) onlyPartyB {
		AccountFacetImpl.activateMasterAccountMode();
		emit ActivateMasterAccountMode(msg.sender);
	}

	/**
	 * @notice Transfers collateral from sender's available balance to whitelisted target without any cooldown
	 * @dev sender must not be suspended/liquidated for the operation to succeed
	 * @param receiver The address of the recipient user in the target contract
	 * @param amount The amount to transfer, specified in collateral decimals
	 * @param target The address of the target contract that will receive the collateral
	 */
	function externalTransfer(
		address receiver,
		uint256 amount,
		address target
	) external whenNotExternalTransferPaused notSuspended(msg.sender) notLiquidatedPartyA(msg.sender) {
		AccountFacetImpl.externalTransfer(msg.sender, receiver, amount, target);
		emit ExternalTransfer(msg.sender, receiver, amount, target);
	}

	/// @notice Allows Party A to bind to Party B
	/// @dev Can only be called by Party A when not suspended
	/// @param partyB The address of Party B
	function bindToPartyB(address partyB) external notSuspended(msg.sender) userNotPartyB(msg.sender) {
		AccountFacetImpl.bindToPartyB(partyB);
		emit BindToPartyB(partyB, msg.sender);
	}

	/// @notice Allows Party A to request to unbind from Party B
	/// @dev Can only be called by Party A when not suspended
	function requestToUnbindFromPartyB() external notSuspended(msg.sender) userNotPartyB(msg.sender) {
		AccountFacetImpl.requestToUnbindFromPartyB();
		emit RequestToUnbindFromPartyB(msg.sender);
	}

	/// @notice Allows Party A to cancel the unbind request from Party B
	/// @dev Can only be called by Party A when not suspended
	function cancelUnbindRequest() external notSuspended(msg.sender) userNotPartyB(msg.sender) {
		AccountFacetImpl.cancelUnbindRequest();
		emit CancelUnbindRequest(msg.sender);
	}

	/// @notice Allows Party B to complete the unbind request from Party A
	/// @dev Can be called by PartyA after cooldown or partyB right away
	/// @param partyA The address of Party A
	function completeUnbindRequest(address partyA) external notSuspended(msg.sender) {
		AccountFacetImpl.completeUnbindRequest(partyA);
		emit CompleteUnbindRequest(partyA, msg.sender);
	}
}
