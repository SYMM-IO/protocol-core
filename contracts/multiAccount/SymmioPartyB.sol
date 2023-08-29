// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";

contract SymmioPartyB is
    Initializable,
    PausableUpgradeable,
    AccessControlUpgradeable
{
    bytes32 public constant TRUSTED_ROLE = keccak256("TRUSTED_ROLE");
    address public symmioAddress;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address symmioAddress_)
        public
        initializer
    {
        __Pausable_init();
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TRUSTED_ROLE, admin);
        symmioAddress = symmioAddress_;
    }

    event SetSymmioAddress(
        address oldSymmioAddress,
        address newSymmioAddress
    );

    function setSymmioAddress(address addr)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        emit SetSymmioAddress(symmioAddress, addr);
        symmioAddress = addr;
    }

    function _approve(address token, uint256 amount)
        external
        onlyRole(TRUSTED_ROLE)
        whenNotPaused
    {
        require(
            IERC20Upgradeable(token).approve(symmioAddress, amount),
            "SymmioPartyB: Not approved"
        );
    }

    function _call(bytes[] calldata _callDatas)
        external
        onlyRole(TRUSTED_ROLE)
        whenNotPaused
    {
        for (uint8 i; i < _callDatas.length; i++) {
            (bool _success, ) = symmioAddress.call{value: 0}(_callDatas[i]);
            require(_success, "SymmioPartyB: execution reverted");
        }
    }

    function withdrawERC20(address token, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            IERC20Upgradeable(token).transfer(msg.sender, amount),
            "SymmioPartyB: Not transferred"
        );
    }
}
