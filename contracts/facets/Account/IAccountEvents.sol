// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.8.18;

interface IAccountEvents {
    event Deposit(address sender, address user, uint256 amount);
    event Withdraw(address sender, address user, uint256 amount);
    event AllocatePartyA(address user, uint256 amount);
    event DeallocatePartyA(address user, uint256 amount);

    event AllocateForPartyB(address partyB, address partyA, uint256 amount);
    event DepositForPartyB(address partyB, uint256 amount);
    event DeallocateForPartyB(address partyB, address partyA, uint256 amount);
    event TransferAllocation(uint256 amount, address origin, address recipient);
}
