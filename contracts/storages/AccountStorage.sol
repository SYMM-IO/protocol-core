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

struct LiquidationDetail {
    bytes liquidationId;
    LiquidationType liquidationType;
    int256 upnl;
    int256 totalUnrealizedLoss;
    uint256 deficit;
    uint256 liquidationFee;
    uint256 timestamp;
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
        mapping(address => uint256) withdrawCooldown;
        mapping(address => uint256) partyANonces;
        mapping(address => mapping(address => uint256)) partyBNonces;
        mapping(address => bool) suspendedAddresses;
        mapping(address => LiquidationDetail) liquidationDetails;
        mapping(address => mapping(uint256 => Price)) symbolsPrices;
        mapping(address => int256) totalUnplForLiquidation;
        mapping(address => address[]) liquidators;
        mapping(address => uint256) partyAReimbursement;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = ACCOUNT_STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
