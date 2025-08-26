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

	function virtualDepositFor(address user, uint256 amount) external;

	function withdraw(uint256 amount) external;

	function withdrawTo(address user, uint256 amount) external;

	function allocate(uint256 amount) external;

	function depositAndAllocate(uint256 amount) external;

	function depositAndAllocateFor(address user, uint256 amount) external;

	function deallocate(uint256 amount, SingleUpnlSig memory upnlSig) external;

	function internalTransfer(address user, uint256 amount) external;

	function externalTransfer(address receiver, uint256 amount, address target) external;

	function bindToPartyB(address partyB) external;

	function requestToUnbindFromPartyB() external;

	function cancelUnbindRequest() external;

	function completeUnbindRequest(address partyA) external;

	// PartyB
	function allocateForPartyB(uint256 amount, address partyA) external;

	function deallocateForPartyB(uint256 amount, address partyA, SingleUpnlSig memory upnlSig) external;

	function activateMasterAccountMode() external;

	function transferAllocation(uint256 amount, address origin, address recipient, SingleUpnlSig memory upnlSig) external;

	function depositToReserveVault(uint256 amount, address partyB) external;

	function withdrawFromReserveVault(uint256 amount) external;
}
