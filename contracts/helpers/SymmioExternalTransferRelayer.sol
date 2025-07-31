// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../interfaces/IExternalTransferRelayer.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ExternalTransferRelayer is IExternalTransferRelayer, AccessControlEnumerable {
    using SafeERC20 for IERC20;

    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");

    mapping(address => bool) public allowedCallers;

    event CallerPermissionUpdated(address caller, bool isAllowed);
    event TransferExecuted(address collateral, address sender, address receiver, uint256 amount);

    error CallerNotAllowed();
    error InvalidAddress();

    modifier onlyAllowedCaller() {
        if (!allowedCallers[msg.sender]) revert CallerNotAllowed();
        _;
    }

    constructor(address admin) {
        if (admin == address(0)) revert InvalidAddress();
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(SETTER_ROLE, admin);
    }

    function setCallerPermission(address caller, bool isAllowed) external onlyRole(SETTER_ROLE) {
        if (caller == address(0)) revert InvalidAddress();
        allowedCallers[caller] = isAllowed;
        emit CallerPermissionUpdated(caller, isAllowed);
    }

    function onTransfer(
        address collateral,
        address sender,
        address receiver,
        uint256 amount
    ) external onlyAllowedCaller {
        if (receiver == address(0)) revert InvalidAddress();
        IERC20(collateral).safeTransfer(receiver, amount);
        emit TransferExecuted(collateral, sender, receiver, amount);
    }
}
