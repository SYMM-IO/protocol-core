// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

struct BridgeTransaction {
    uint256 id;
    uint256 amount;
    address partyA;
    address bridge;
    uint256 timestamp;
    BridgeTransactionStatus status;
}

enum BridgeTransactionStatus{
    LOCKED,
    WITHDRAWN
}

enum BridgeStatus{
    NOT_WHITELIST,
    WHITELIST,
    SUSPEND,
    REMOVE
}

library BridgeStorage {
    bytes32 internal constant BRIDGE_STORAGE_SLOT = keccak256("diamond.standard.storage.bridge");

    struct Layout {
        mapping(address =>  BridgeStatus) bridges;
        mapping(uint256 =>  BridgeTransaction) BridgeTransactions;
        uint256 lastId;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = BRIDGE_STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
