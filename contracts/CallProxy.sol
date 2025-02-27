// SPDX-License-Identifier: MIT
pragma solidity >=0.8.18;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";

/// @title CallProxy Contract
/// @dev Implements upgradeable pattern with Pausable, Access Control, and ReentrancyGuard
contract CallProxy is Initializable, PausableUpgradeable, AccessControlEnumerableUpgradeable, ReentrancyGuardUpgradeable {
	//--------------------------------------------------------------------------
	// Roles
	//--------------------------------------------------------------------------

	bytes32 public constant TRUSTED_ROLE = keccak256("TRUSTED_ROLE");
	bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
	bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");
	bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

	//--------------------------------------------------------------------------
	// State Variables
	//--------------------------------------------------------------------------

	/// @notice Stores addresses that are allowed for contract calls
	mapping(address => bool) public callWhitelist;

	//--------------------------------------------------------------------------
	// Events
	//--------------------------------------------------------------------------

	/// @dev Emitted when the whitelist status of an address changes
	event SetCallWhitelist(address indexed addr, bool state);

	//--------------------------------------------------------------------------
	// Constructor
	//--------------------------------------------------------------------------

	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		// Disable the initializer to prevent misuse
		_disableInitializers();
	}

	//--------------------------------------------------------------------------
	// Initialization
	//--------------------------------------------------------------------------
	/// @notice Initializes the contract
	/// @param admin Address that receives all admin privileges

	function initialize(address admin) external initializer {
		__Pausable_init();
		__AccessControlEnumerable_init();
		__ReentrancyGuard_init();

		// Grant roles to the admin
		_grantRole(DEFAULT_ADMIN_ROLE, admin);
		_grantRole(MANAGER_ROLE, admin);
	}

	//--------------------------------------------------------------------------
	// Whitelist Management
	//--------------------------------------------------------------------------

	/// @notice Sets or unsets the whitelist status of a contract address
	/// @param addr Contract address to modify
	/// @param state Whitelist state: true to enable, false to disable
	function setCallWhitelist(address addr, bool state) external onlyRole(MANAGER_ROLE) {
		require(addr != address(this), "CallProxy: Cannot whitelist self");
		callWhitelist[addr] = state;
		emit SetCallWhitelist(addr, state);
	}

	//--------------------------------------------------------------------------
	// Internal Call Logic
	//--------------------------------------------------------------------------

	/// @dev Executes a call on a destination address, ensuring it's whitelisted
	///      and the caller has the TRUSTED_ROLE.
	/// @param destAddress The contract address to call
	/// @param callData The calldata to send to the destination
	function _executeCall(address destAddress, bytes memory callData) internal {
		require(destAddress != address(0), "CallProxy: Invalid address");
		require(callData.length >= 4, "CallProxy: Invalid call data");
		require(callWhitelist[destAddress], "CallProxy: Destination address not whitelisted");

		_checkRole(TRUSTED_ROLE, msg.sender);

		(bool success, bytes memory resultData) = destAddress.call{ value: 0 }(callData);
		if (!success) {
			// Bubble up the revert reason
			assembly {
				revert(add(resultData, 32), mload(resultData))
			}
		}
	}

	//--------------------------------------------------------------------------
	// Public Multicall
	//--------------------------------------------------------------------------

	/// @notice Executes multiple calls in a single transaction
	/// @param destAddresses An array of destination addresses
	/// @param callDatas An array of calldata corresponding to each address
	function call(address[] calldata destAddresses, bytes[] calldata callDatas) external whenNotPaused nonReentrant {
		require(destAddresses.length == callDatas.length, "CallProxy: Mismatched array lengths");

		for (uint256 i; i < callDatas.length; i++) {
			_executeCall(destAddresses[i], callDatas[i]);
		}
	}

	//--------------------------------------------------------------------------
	// Emergency Functions
	//--------------------------------------------------------------------------

	/// @notice Withdraws ERC20 tokens from the contract
	/// @param token The ERC20 token address
	/// @param amount The token amount to withdraw
	function withdrawERC20(address token, uint256 amount) external onlyRole(MANAGER_ROLE) {
		require(IERC20Upgradeable(token).transfer(msg.sender, amount), "CallProxy: Transfer failed");
	}

	//--------------------------------------------------------------------------
	// Pausing / Unpausing
	//--------------------------------------------------------------------------
	/// @notice Pauses the contract (only callable by PAUSER_ROLE)
	function pause() external onlyRole(PAUSER_ROLE) {
		_pause();
	}

	/// @notice Unpauses the contract (only callable by UNPAUSER_ROLE)
	function unpause() external onlyRole(UNPAUSER_ROLE) {
		_unpause();
	}
}
