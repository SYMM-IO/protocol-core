// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

interface ISymmioPartyA {
    function _approve(address token, uint256 amount) external;

    function _call(bytes calldata _callData) external returns (bool _success, bytes memory _resultData);

    function withdrawERC20(address token, uint256 amount) external;
}
