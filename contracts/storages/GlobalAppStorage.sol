// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../libraries/LibLockedValues.sol";

library GlobalAppStorage {
    bytes32 internal constant GLOBAL_APP_STORAGE_SLOT =
        keccak256("diamond.standard.storage.global");

    struct Layout {
        address collateral;
        address feeCollector;
        bool globalPaused;
        bool liquidationPaused;
        bool accountingPaused;
        bool partyBActionsPaused;
        bool partyAActionsPaused;
        bool emergencyMode;
        uint256 balanceLimitPerUser;
        mapping(address => bool) partyBEmergencyStatus;
        mapping(address => mapping(bytes32 => bool)) hasRole;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = GLOBAL_APP_STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
