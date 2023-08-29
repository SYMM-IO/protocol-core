// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../libraries/LibLockedValues.sol";

library MAStorage {
    bytes32 internal constant MA_STORAGE_SLOT =
        keccak256("diamond.standard.storage.masteragreement");

    struct Layout {
        uint256 deallocateCooldown;
        uint256 forceCancelCooldown;
        uint256 forceCancelCloseCooldown;
        uint256 forceCloseCooldown;
        uint256 liquidationTimeout;
        uint256 liquidatorShare; // in 18 decimals
        uint256 pendingQuotesValidLength;
        uint256 forceCloseGapRatio;
        mapping(address => bool) partyBStatus;
        mapping(address => bool) liquidationStatus;
        mapping(address => mapping(address => bool)) partyBLiquidationStatus;
        mapping(address => mapping(address => uint256)) partyBLiquidationTimestamp;
        mapping(address => mapping(address => uint256)) partyBPositionLiquidatorsShare;
        address[] partyBList;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = MA_STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
