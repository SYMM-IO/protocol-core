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
		AccountFacetImpl.allocate(amount);
		emit AllocatePartyA(msg.sender, amount, AccountStorage.layout().allocatedBalances[msg.sender]);
		emit AllocatePartyA(msg.sender, amount); // For backward compatibility, will be removed in future
		emit SharedEvents.BalanceChangePartyA(msg.sender, amount, SharedEvents.BalanceChangeType.ALLOCATE);
	}

	/// @notice Allows Party A to deposit a specified amount of collateral and immediately allocate it.
	/// @param amount The precise amount of collateral to be deposited and allocated, specified in collateral decimals.
	function depositAndAllocate(uint256 amount) external whenNotAccountingPaused notLiquidatedPartyA(msg.sender) notSuspended(msg.sender) {
		AccountFacetImpl.deposit(msg.sender, amount);
		uint256 amountWith18Decimals = (amount * 1e18) / (10 ** IERC20Metadata(GlobalAppStorage.layout().collateral).decimals());
		AccountFacetImpl.allocate(amountWith18Decimals);
		emit Deposit(msg.sender, msg.sender, amount);
		emit AllocatePartyA(msg.sender, amountWith18Decimals, AccountStorage.layout().allocatedBalances[msg.sender]);
		emit AllocatePartyA(msg.sender, amountWith18Decimals); // For backward compatibility, will be removed in future
		emit SharedEvents.BalanceChangePartyA(msg.sender, amountWith18Decimals, SharedEvents.BalanceChangeType.ALLOCATE);
	}

	/// @notice Allows Party A to deallocate a specified amount of collateral.
	/// @param amount The precise amount of collateral to be deallocated, specified in 18 decimals.
	/// @param upnlSig The Muon signature for SingleUpnlSig.
	function deallocate(uint256 amount, SingleUpnlSig memory upnlSig) external whenNotAccountingPaused notLiquidatedPartyA(msg.sender) {
		AccountFacetImpl.deallocate(amount, upnlSig);
		emit DeallocatePartyA(msg.sender, amount, AccountStorage.layout().allocatedBalances[msg.sender]);
		emit DeallocatePartyA(msg.sender, amount); // For backward compatibility, will be removed in future
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
		emit AllocatePartyA(user, amount); // For backward compatibility, will be removed in future
		emit SharedEvents.BalanceChangePartyA(user, amount, SharedEvents.BalanceChangeType.ALLOCATE);
	}

	/// @notice Allows Party B to allocate a specified amount of collateral for an specified partyA.
	/// @dev This function can only be called by Party B when Party B actions are not paused and Party B is not liquidated.
	/// @param amount The precise amount of collateral to be allocated, specified in 18 decimals.
	/// @param partyA The address of Party A
	function allocateForPartyB(uint256 amount, address partyA) public whenNotPartyBActionsPaused notLiquidatedPartyB(msg.sender, partyA) onlyPartyB {
		AccountFacetImpl.allocateForPartyB(amount, partyA);
		emit AllocateForPartyB(msg.sender, partyA, amount, AccountStorage.layout().partyBAllocatedBalances[msg.sender][partyA]);
		emit AllocateForPartyB(msg.sender, partyA, amount); // For backward compatibility, will be removed in future
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
		emit DeallocateForPartyB(msg.sender, partyA, amount); // For backward compatibility, will be removed in future
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
		emit TransferAllocation(amount, origin, recipient); // For backward compatibility, will be removed in future
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
}
