// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

struct BridgeLockedTransaction {
    uint256 Id;
    uint256 amount;
    address partyA;
    address bridge;
    uint256 timeStamp;
    BridgeLockedTransactionStatus status;
}

enum BridgeLockedTransactionStatus{
    LOCKED,
    WITHDRAW
}

library BridgeStorage {
    bytes32 internal constant BRIDGE_STORAGE_SLOT = keccak256("diamond.standard.storage.bridge");

    struct Layout {
        mapping(address =>  bool) whiteListedBridge;
        mapping(uint256 =>  BridgeLockedTransaction) transactions;
        uint256 lastId;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = BRIDGE_STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
