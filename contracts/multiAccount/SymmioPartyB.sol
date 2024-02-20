// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";

contract SymmioPartyB is Initializable, PausableUpgradeable, AccessControlEnumerableUpgradeable {
    bytes32 public constant TRUSTED_ROLE = keccak256("TRUSTED_ROLE");
    address public symmioAddress;
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");
    mapping(bytes4 => bool) public restrictedSelectors;
    mapping(address => bool) public multicastWhitelist;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address symmioAddress_) public initializer {
        __Pausable_init();
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TRUSTED_ROLE, admin);
        _grantRole(MANAGER_ROLE, admin);
        symmioAddress = symmioAddress_;
    }

    event SetSymmioAddress(address oldSymmioAddress, address newSymmioAddress);

    event SetRestrictedSelector(bytes4 selector, bool state);

    event SetMulticastWhitelist(address addr, bool state);

    function setSymmioAddress(address addr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit SetSymmioAddress(symmioAddress, addr);
        symmioAddress = addr;
    }

    function setRestrictedSelector(
        bytes4 selector,
        bool state
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        restrictedSelectors[selector] = state;
        emit SetRestrictedSelector(selector, state);
    }

    function setMulticastWhitelist(
        address addr,
        bool state
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        multicastWhitelist[addr] = state;
        emit SetMulticastWhitelist(addr, state);
    }

    function _approve(address token, uint256 amount) external onlyRole(TRUSTED_ROLE) whenNotPaused {
        require(
            IERC20Upgradeable(token).approve(symmioAddress, amount),
            "SymmioPartyB: Not approved"
        );
    }

    function _executeCall(address destAddress, bytes memory callData) internal {
        require(destAddress != address(0), "SymmioPartyB: Invalid address");
        require(callData.length >= 4, "SymmioPartyB: Invalid call data");

        if (destAddress == symmioAddress) {
            bytes4 functionSelector;
            assembly {
                functionSelector := mload(add(callData, 0x20))
            }
            if (restrictedSelectors[functionSelector]) {
                _checkRole(MANAGER_ROLE, msg.sender);
            } else {
                require(hasRole(MANAGER_ROLE, msg.sender) || hasRole(TRUSTED_ROLE, msg.sender), "SymmioPartyB: Invalid access");
            }
        } else {
            require(multicastWhitelist[destAddress], "SymmioPartyB: Destination address is not whitelisted");
            _checkRole(TRUSTED_ROLE, msg.sender);
        }

        (bool success,) = destAddress.call{value: 0}(callData);
        require(success, "SymmioPartyB: Execution reverted");
    }

    function _call(bytes[] calldata _callDatas) external whenNotPaused {
        for (uint8 i; i < _callDatas.length; i++)
            _executeCall(symmioAddress, _callDatas[i]);
    }

    function _multicastCall(address[] calldata destAddresses, bytes[] calldata _callDatas) external whenNotPaused {
        require(destAddresses.length == _callDatas.length, "SymmioPartyB: Array length mismatch");

        for (uint8 i; i < _callDatas.length; i++)
            _executeCall(destAddresses[i], _callDatas[i]);
    }

    function withdrawERC20(address token, uint256 amount) external onlyRole(MANAGER_ROLE) {
        require(
            IERC20Upgradeable(token).transfer(msg.sender, amount),
            "SymmioPartyB: Not transferred"
        );
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(UNPAUSER_ROLE) {
        _unpause();
    }
}
