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
	mapping(bytes4 => bool) public restrictedSelectors; // selector -> isRestricted
	mapping(address => bool) public multicastWhitelist; // contractAddress -> isAllowedForMulticast

	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		_disableInitializers();
	}

	/**
	 * @dev Initializes the contract with the provided admin and Symmio address.
	 * @param admin The address of the default admin role.
	 * @param symmioAddress_ The address of the Symmio contract.
	 */
	function initialize(address admin, address symmioAddress_) public initializer {
		__Pausable_init();
		__AccessControl_init();

		_grantRole(DEFAULT_ADMIN_ROLE, admin);
		_grantRole(TRUSTED_ROLE, admin);
		_grantRole(MANAGER_ROLE, admin);
		symmioAddress = symmioAddress_;
	}

	/**
	 * @dev Emitted when the Symmio address is updated.
	 * @param oldSymmioAddress The address of the old Symmio contract.
	 * @param newSymmioAddress The address of the new Symmio contract.
	 */
	event SetSymmioAddress(address oldSymmioAddress, address newSymmioAddress);

	/**
	 * @dev Emitted when a restricted selector is set.
	 * @param selector The function selector.
	 * @param state The state of the selector.
	 */
	event SetRestrictedSelector(bytes4 selector, bool state);

	/**
	 * @dev Emitted when a multicast whitelist address is set.
	 * @param addr The address added to the whitelist.
	 * @param state The state of the whitelist address.
	 */
	event SetMulticastWhitelist(address addr, bool state);

	/**
	 * @dev Updates the address of the Symmio contract.
	 * @param addr The new address of the Symmio contract.
	 */
	function setSymmioAddress(address addr) external onlyRole(DEFAULT_ADMIN_ROLE) {
		emit SetSymmioAddress(symmioAddress, addr);
		symmioAddress = addr;
	}

	/**
	 * @dev Restricts or lifts restrictions on a selector for Party B..
	 * @param selector The function selector to set the state for.
	 * @param state The state to set for the selector.
	 */
	function setRestrictedSelector(bytes4 selector, bool state) external onlyRole(DEFAULT_ADMIN_ROLE) {
		restrictedSelectors[selector] = state;
		emit SetRestrictedSelector(selector, state);
	}

	/**
	 * @dev Allows or disallows Party B to call a method from a specific contract.
	 * @param addr The address to set the state for.
	 * @param state The state to set for the address.
	 */
	function setMulticastWhitelist(address addr, bool state) external onlyRole(MANAGER_ROLE) {
		require(addr != address(this), "SymmioPartyB: Invalid address");
		multicastWhitelist[addr] = state;
		emit SetMulticastWhitelist(addr, state);
	}

	/**
	 * @dev Approves an ERC20 token for spending by Symmio.
	 * @param token The address of the ERC20 token.
	 * @param amount The amount of tokens to approve.
	 */
	function _approve(address token, uint256 amount) external onlyRole(TRUSTED_ROLE) whenNotPaused {
		require(IERC20Upgradeable(token).approve(symmioAddress, amount), "SymmioPartyB: Not approved");
	}

	/**
	 * @dev Executes a call to a destination address with the provided call data.
	 * @param destAddress The destination address to call.
	 * @param callData The call data to be used for the call.
	 */
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

		(bool success, ) = destAddress.call{ value: 0 }(callData);
		require(success, "SymmioPartyB: Execution reverted");
	}

	/**
	 * @dev Executes multiple calls to the Symmio contract.
	 * @param _callDatas An array of call data to be used for the calls.
	 */
	function _call(bytes[] calldata _callDatas) external whenNotPaused {
		for (uint8 i; i < _callDatas.length; i++) _executeCall(symmioAddress, _callDatas[i]);
	}

	/**
	 * @dev Executes multiple calls to specified destination addresses.
	 * @param destAddresses An array of destination addresses to call.
	 * @param _callDatas An array of call data to be used for the calls.
	 */
	function _multicastCall(address[] calldata destAddresses, bytes[] calldata _callDatas) external whenNotPaused {
		require(destAddresses.length == _callDatas.length, "SymmioPartyB: Array length mismatch");

		for (uint8 i; i < _callDatas.length; i++) _executeCall(destAddresses[i], _callDatas[i]);
	}

	/**
	 * @dev Withdraws ERC20 tokens from the contract to the caller.
	 * @param token The address of the ERC20 token.
	 * @param amount The amount of tokens to withdraw.
	 */
	function withdrawERC20(address token, uint256 amount) external onlyRole(MANAGER_ROLE) {
		require(IERC20Upgradeable(token).transfer(msg.sender, amount), "SymmioPartyB: Not transferred");
	}

	/**
	 * @dev Pauses the contract.
	 */
	function pause() external onlyRole(PAUSER_ROLE) {
		_pause();
	}

	/**
	 * @dev Unpauses the contract.
	 */
	function unpause() external onlyRole(UNPAUSER_ROLE) {
		_unpause();
	}
}
