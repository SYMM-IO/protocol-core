// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../libraries/LibLockedValues.sol";

enum LiquidationType {
	NONE,
	NORMAL,
	LATE,
	OVERDUE
}

struct SettlementState {
	int256 actualAmount;
	int256 expectedAmount;
	uint256 cva;
	bool pending;
}

struct LiquidationDetail {
	bytes liquidationId;
	LiquidationType liquidationType;
	int256 upnl;
	int256 totalUnrealizedLoss;
	uint256 deficit;
	uint256 liquidationFee;
	uint256 timestamp;
	uint256 involvedPartyBCounts;
	int256 partyAAccumulatedUpnl;
	bool disputed;
	uint256 liquidationTimestamp;
}

struct DeferredWithdraw {
	uint256 id;
	uint256 amount;
	address user;
	address to;
	uint256 timestamp;
	DeferredWithdrawStatus status;
}

enum DeferredWithdrawStatus {
	INITIATED,
	CANCELED,
	COMPLETED
}

struct BindState {
	BindStatus status;
	address partyB;
	uint256 modifyTimestamp;
}

enum BindStatus {
	UNBINDED,
	BINDED,
	UNBIND_PENDING
}

struct Price {
	uint256 price;
	uint256 timestamp;
}

library AccountStorage {
	bytes32 internal constant ACCOUNT_STORAGE_SLOT = keccak256("diamond.standard.storage.account");

	struct Layout {
		// Users deposited amounts
		mapping(address => uint256) balances;
		mapping(address => uint256) allocatedBalances;
		// position value will become pending locked before openPosition and will be locked after that
		mapping(address => LockedValues) pendingLockedBalances;
		mapping(address => LockedValues) lockedBalances;
		mapping(address => mapping(address => uint256)) partyBAllocatedBalances;
		mapping(address => mapping(address => LockedValues)) partyBPendingLockedBalances;
		mapping(address => mapping(address => LockedValues)) partyBLockedBalances;
		mapping(address => uint256) withdrawCooldown; // is better to call lastDeallocateTime
		mapping(address => uint256) partyANonces;
		mapping(address => mapping(address => uint256)) partyBNonces;
		mapping(address => bool) suspendedAddresses;
		mapping(address => LiquidationDetail) liquidationDetails;
		mapping(address => mapping(uint256 => Price)) symbolsPrices;
		mapping(address => address[]) liquidators;
		mapping(address => uint256) partyAReimbursement;
		// partyA => partyB => SettlementState
		mapping(address => mapping(address => SettlementState)) settlementStates;
		mapping(address => uint256) reserveVault;
		mapping(address => uint8) connectedPartyBCount; // partyA => Number of partyBs connected to this partyA
		mapping(address => BindState) bindState;
		mapping(uint256 => DeferredWithdraw) deferredWithdraws;
		mapping(address => uint256[]) deferredWithdrawIds;
		uint256 lastdeferredWithdrawId;
	}

	function layout() internal pure returns (Layout storage l) {
		bytes32 slot = ACCOUNT_STORAGE_SLOT;
		assembly {
			l.slot := slot
		}
	}
}
