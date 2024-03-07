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

/// @title Manage Deposits and Allocated Amounts
contract AccountFacet is Accessibility, Pausable, IAccountFacet {
	//Party A

	/// @notice Allows either PartyA or PartyB to deposit collateral.
	/// @dev This function can be utilized by both parties to deposit collateral into the system.
	/// @param amount The collateral amount of collateral to be deposited, specified in decimal units.
	function deposit(uint256 amount) external whenNotAccountingPaused {
		AccountFacetImpl.deposit(msg.sender, amount);
		emit Deposit(msg.sender, msg.sender, amount);
	}

	/// @notice Allows either Party A or Party B to deposit collateral on behalf of another user.
	/// @param user The recipient address for the deposit.
	/// @param amount The precise amount of collateral to be deposited, specified in decimal units.
	function depositFor(address user, uint256 amount) external whenNotAccountingPaused {
		AccountFacetImpl.deposit(user, amount);
		emit Deposit(msg.sender, user, amount);
	}

	/// @notice Allows a user to withdraw a specified amount of collateral, provided that the withdrawal cooldown period has elapsed.
	/// @dev This function can only be called when accounting operations are not paused, the sender is not suspende
	/// @dev The withdrawal cooldown period has elapsed.
	/// @param amount The precise amount of collateral to be withdrawn, specified in decimal units.
	function withdraw(uint256 amount) external whenNotAccountingPaused notSuspended(msg.sender) {
		AccountFacetImpl.withdraw(msg.sender, amount);
		emit Withdraw(msg.sender, msg.sender, amount);
	}

	/// @notice Allows a user to withdraw a specified amount of collateral and transfer it to another user.
	/// @dev This function can only be called when accounting operations are not paused, and the sender is not suspended.
	/// @dev The withdrawal cooldown period has elapsed.
	/// @param user The recipient address for the withdrawal.
	/// @param amount The precise amount of collateral to be withdrawn, specified in decimal units.
	function withdrawTo(address user, uint256 amount) external whenNotAccountingPaused notSuspended(msg.sender) {
		AccountFacetImpl.withdraw(user, amount);
		emit Withdraw(msg.sender, user, amount);
	}

	/// @notice Allows Party A to allocate a specified amount of collateral.
	/// @dev This function can only be called when accounting operations are not paused and Party A is not liquidated.
	/// @param amount The precise amount of collateral to be allocated, specified in decimal units.
	function allocate(uint256 amount) external whenNotAccountingPaused notLiquidatedPartyA(msg.sender) {
		AccountFacetImpl.allocate(amount);
		emit AllocatePartyA(msg.sender, amount, AccountStorage.layout().allocatedBalances[msg.sender]);
	}

	/// @notice Allows Party A to deposit a specified amount of collateral and immediately allocate it.
	/// @dev This function can only be called when accounting operations are not paused and Party A is not liquidated.
	/// @param amount The precise amount of collateral to be deposited and allocated, specified in decimal units.
	function depositAndAllocate(uint256 amount) external whenNotAccountingPaused notLiquidatedPartyA(msg.sender) {
		AccountFacetImpl.deposit(msg.sender, amount);
		uint256 amountWith18Decimals = (amount * 1e18) / (10 ** IERC20Metadata(GlobalAppStorage.layout().collateral).decimals());
		AccountFacetImpl.allocate(amountWith18Decimals);
		emit Deposit(msg.sender, msg.sender, amount);
		emit AllocatePartyA(msg.sender, amountWith18Decimals, AccountStorage.layout().allocatedBalances[msg.sender]);
	}

	/// @notice Allows Party A to deallocate a specified amount of collateral.
	/// @dev This function can only be called when accounting operations are not paused and Party A is not liquidated.
	/// @param amount The precise amount of collateral to be deallocated, specified in decimal units.
	/// @param upnlSig The signature for SingleUpnlSig.
	function deallocate(uint256 amount, SingleUpnlSig memory upnlSig) external whenNotAccountingPaused notLiquidatedPartyA(msg.sender) {
		AccountFacetImpl.deallocate(amount, upnlSig);
		emit DeallocatePartyA(msg.sender, amount, AccountStorage.layout().allocatedBalances[msg.sender]);
	}

	/// @notice Transfers the sender's deposited balance to the user allocated balance.
	/// @dev The sender and the recipient user cannot be partyB.
	/// @dev PartyA should not be in the liquidation process.
	/// @param user The address of the user to whom the amount will be allocated.
	/// @param amount The amount to transfer and allocate.
	function internalTransfer(address user, uint256 amount) external whenNotInternalTransferPaused notPartyB userNotPartyB(user) notSuspended(msg.sender) notLiquidatedPartyA(user){
		AccountFacetImpl.internalTransfer(user, amount);
		emit InternalTransfer(msg.sender, user, amount);
		emit Withdraw(msg.sender, user, amount);
		emit AllocatePartyA(user, amount, AccountStorage.layout().allocatedBalances[user]);
	}

	// PartyB

	/// @notice Allows Party B to allocate a specified amount of collateral
	/// @dev This function can only be called by Party B when Party B actions are not paused and Party B is not liquidated.
	/// @param amount The precise amount of collateral to be allocated, specified in decimal units.
	/// @param partyA The address of Party A 

	function allocateForPartyB(uint256 amount, address partyA) public whenNotPartyBActionsPaused notLiquidatedPartyB(msg.sender, partyA) onlyPartyB {
		AccountFacetImpl.allocateForPartyB(amount, partyA);
		emit AllocateForPartyB(msg.sender, partyA, amount, AccountStorage.layout().partyBAllocatedBalances[msg.sender][partyA]);
	}

	/// @notice Allows Party B to deallocate a specified amount of collateral
	/// @dev This function can only be called by Party B when Party B actions are not paused and neither Party A nor Party B is liquidated.
	/// @param amount The precise amount of collateral to be deallocated, specified in decimal units.
	/// @param partyA The address of Party A 
	/// @param upnlSig The signature for SingleUpnlSig.
	function deallocateForPartyB(
		uint256 amount,
		address partyA,
		SingleUpnlSig memory upnlSig
	) external whenNotPartyBActionsPaused notLiquidatedPartyB(msg.sender, partyA) notLiquidatedPartyA(partyA) onlyPartyB {
		AccountFacetImpl.deallocateForPartyB(amount, partyA, upnlSig);
		emit DeallocateForPartyB(msg.sender, partyA, amount, AccountStorage.layout().partyBAllocatedBalances[msg.sender][partyA]);
	}

	/// @notice Allows transferring the allocation of collateral from one party B to another.
	/// @dev This function can only be called when Party B actions are not paused.
	/// @param amount The precise amount of collateral to be transferred, specified in decimal units.
	/// @param origin The address of the party B whose allocation is being transferred.
	/// @param recipient The address of the party B who will receive the transferred allocation.
	/// @param upnlSig The signature for SingleUpnlSig.
	function transferAllocation(uint256 amount, address origin, address recipient, SingleUpnlSig memory upnlSig) external whenNotPartyBActionsPaused {
		AccountFacetImpl.transferAllocation(amount, origin, recipient, upnlSig);
		emit TransferAllocation(amount, origin, recipient);
	}
}
