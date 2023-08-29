// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract SymmioPartyA is AccessControl {
    bytes32 public constant MULTIACCOUNT_ROLE = keccak256("MULTIACCOUNT_ROLE");
    address public symmioAddress;

    constructor(
        address admin,
        address multiAccountAddress,
        address symmioAddress_
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MULTIACCOUNT_ROLE, multiAccountAddress);
        symmioAddress = symmioAddress_;
    }

    event SetSymmioAddress(
        address oldV3ContractAddress,
        address newV3ContractAddress
    );

    function setSymmioAddress(
        address symmioAddress_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit SetSymmioAddress(symmioAddress, symmioAddress_);
        symmioAddress = symmioAddress_;
    }

    function _call(
        bytes memory _callData
    )
        external
        onlyRole(MULTIACCOUNT_ROLE)
        returns (bool _success, bytes memory _resultData)
    {
        return symmioAddress.call{value: 0}(_callData);
    }
}
