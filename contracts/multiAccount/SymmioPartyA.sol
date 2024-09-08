// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract SymmioPartyA is AccessControl {
	bytes32 public constant MULTIACCOUNT_ROLE = keccak256("MULTIACCOUNT_ROLE");
	address public symmioAddress;

	/**
	 * @dev Constructor to initialize the contract with roles and Symmio address.
	 * @param admin The address of the default admin role.
	 * @param multiAccountAddress The address assigned the MULTIACCOUNT_ROLE.
	 * @param symmioAddress_ The address of the Symmio contract.
	 */
	constructor(address admin, address multiAccountAddress, address symmioAddress_) {
		_grantRole(DEFAULT_ADMIN_ROLE, admin);
		_grantRole(MULTIACCOUNT_ROLE, multiAccountAddress);
		symmioAddress = symmioAddress_;
	}

	/**
	 * @dev Emitted when the Symmio address is updated.
	 * @param oldSymmioContractAddress The address of the old Symmio contract.
	 * @param newSymmioContractAddress The address of the new Symmio contract.
	 */
	event SetSymmioAddress(address oldSymmioContractAddress, address newSymmioContractAddress);

	/**
	 * @dev Updates the address of the Symmio contract.
	 * @param symmioAddress_ The new address of the Symmio contract.
	 */
	function setSymmioAddress(address symmioAddress_) external onlyRole(DEFAULT_ADMIN_ROLE) {
		emit SetSymmioAddress(symmioAddress, symmioAddress_);
		symmioAddress = symmioAddress_;
	}

	/**
	 * @dev Executes a function call on the Symmio contract.
	 * @param _callData The data to be used for the function call.
	 * @return _success A boolean indicating whether the call was successful.
	 * @return _resultData The result data returned by the function call.
	 */
	function _call(bytes memory _callData) external onlyRole(MULTIACCOUNT_ROLE) returns (bool _success, bytes memory _resultData) {
		return symmioAddress.call{ value: 0 }(_callData);
	}
}
