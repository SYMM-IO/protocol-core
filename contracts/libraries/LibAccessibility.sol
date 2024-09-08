// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/GlobalAppStorage.sol";

library LibAccessibility {
	bytes32 public constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");
	bytes32 public constant MUON_SETTER_ROLE = keccak256("MUON_SETTER_ROLE");
	bytes32 public constant SYMBOL_MANAGER_ROLE = keccak256("SYMBOL_MANAGER_ROLE");
	bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
	bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
	bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");
	bytes32 public constant PARTY_B_MANAGER_ROLE = keccak256("PARTY_B_MANAGER_ROLE");
	bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");
	bytes32 public constant SUSPENDER_ROLE = keccak256("SUSPENDER_ROLE");
	bytes32 public constant DISPUTE_ROLE = keccak256("DISPUTE_ROLE");
	bytes32 public constant AFFILIATE_MANAGER_ROLE = keccak256("AFFILIATE_MANAGER_ROLE");

	/**
	 * @notice Checks if a user has a specific role.
	 * @param user The address of the user.
	 * @param role The role to check.
	 * @return Whether the user has the specified role.
	 */
	function hasRole(address user, bytes32 role) internal view returns (bool) {
		GlobalAppStorage.Layout storage layout = GlobalAppStorage.layout();
		return layout.hasRole[user][role];
	}
}
