// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

interface IAccountEvents {
	event Deposit(address sender, address user, uint256 amount);
	event Withdraw(address sender, address user, uint256 amount);
	event AllocatePartyA(address user, uint256 amount, uint256 newAllocatedBalance);
	event AllocatePartyA(address user, uint256 amount); // For backward compatibility, will be removed in future
	event DeallocatePartyA(address user, uint256 amount, uint256 newAllocatedBalance);
	event DeallocatePartyA(address user, uint256 amount); // For backward compatibility, will be removed in future
	event InternalTransfer(address sender, address user, uint256 userNewAllocatedBalance, uint256 amount);
	event AllocateForPartyB(address partyB, address partyA, uint256 amount, uint256 newAllocatedBalance);
	event AllocateForPartyB(address partyB, address partyA, uint256 amount); // For backward compatibility, will be removed in future
	event DeallocateForPartyB(address partyB, address partyA, uint256 amount, uint256 newAllocatedBalance);
	event DeallocateForPartyB(address partyB, address partyA, uint256 amount); // For backward compatibility, will be removed in future
	event TransferAllocation(
		uint256 amount,
		address origin,
		uint256 originNewAllocatedBalance,
		address recipient,
		uint256 recipientNewAllocatedBalance
	);
	event TransferAllocation(uint256 amount, address origin, address recipient); // For backward compatibility, will be removed in future
}
