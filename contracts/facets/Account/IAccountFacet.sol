// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./IAccountEvents.sol";
import "../../storages/MuonStorage.sol";

interface IAccountFacet is IAccountEvents {
	//Party A
	function deposit(uint256 amount) external;

	function depositFor(address user, uint256 amount) external;

	function withdraw(uint256 amount) external;

	function withdrawTo(address user, uint256 amount) external;

	function allocate(uint256 amount) external;

	function depositAndAllocate(uint256 amount) external;

	function deallocate(uint256 amount, SingleUpnlSig memory upnlSig) external;

	function deferredWithdraw(uint256 amount, address to) external;

	function claimDeferredWithdraw(uint256 id) external;

	function cancelDeferredWithdraw(uint256 id) external;

	function internalTransfer(address user, uint256 amount) external;

	// PartyB
	function allocateForPartyB(uint256 amount, address partyA) external;

	function deallocateForPartyB(uint256 amount, address partyA, SingleUpnlSig memory upnlSig) external;

	function transferAllocation(uint256 amount, address origin, address recipient, SingleUpnlSig memory upnlSig) external;

	function depositToEmergencyReserveVault(uint256 amount) external;

	function withdrawFromEmergencyReserveVault(uint256 amount) external;
}
