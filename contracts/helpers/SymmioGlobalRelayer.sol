// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SymmioGlobalRelayer
 * @notice A cross-protocol bridge for transferring collateral between whitelisted Symmio instances
 * @dev This contract enables secure transfers of collateral tokens between different Symmio protocol
 *      deployments while maintaining proper access controls and cooldown mechanisms. It acts as an
 *      intermediary that temporarily holds funds during cross-protocol transfers.
 */

/**
 * @notice Interface for Symmio protocol core contract
 * @dev Provides access to collateral management and cooldown functionality
 */
interface ISymmio {
	function getCollateral() external view returns (address);

	function coolDownsOfMA() external view returns (uint256, uint256, uint256, uint256);

	function setDeallocateCooldown(uint256 deallocateCooldown) external;

	function depositFor(address user, uint256 amount) external;

	function withdrawCooldownOf(address user) external view returns (uint256);
}

/**
 * @notice Interface for multi-account management contract
 * @dev Enables batch operations and ownership validation for user accounts
 */
interface IMultiAccount {
	function _call(address account, bytes[] memory _callDatas) external;

	function owners(address account) external view returns (address);
}

contract SymmioGlobalRelayer is AccessControlEnumerableUpgradeable, PausableUpgradeable {
	using SafeERC20 for IERC20;

	/* ─────────────────────────────── Roles ─────────────────────────────── */

	/// @notice Role for setting configuration parameters and whitelisted targets
	bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");

	/// @notice Role for pausing contract operations in emergency situations
	bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

	/// @notice Role for unpausing contract operations after emergency resolution
	bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

	/* ─────────────────────────────── Storage Variables ─────────────────────────────── */

	/// @notice Mapping of target protocol addresses to their whitelist status
	mapping(address => bool) public whitelistedTargets;

	/// @notice Mapping of target protocol addresses to their required withdraw cooldown periods
	mapping(address => uint256) public targetWithdrawCooldowns;

	/* ─────────────────────────────── Events ─────────────────────────────── */

	/**
	 * @notice Emitted when target protocol whitelist status is updated
	 * @param targets Array of target protocol addresses
	 * @param states Array of corresponding whitelist states (true = whitelisted)
	 */
	event SetWhitelistedTargets(address[] targets, bool[] states);

	/**
	 * @notice Emitted when target protocol withdraw cooldowns are updated
	 * @param targets Array of target protocol addresses
	 * @param cooldowns Array of corresponding cooldown periods in seconds
	 */
	event SetTargetWithdrawCooldowns(address[] targets, uint256[] cooldowns);

	/**
	 * @notice Emitted when a cross-protocol transfer is successfully executed
	 * @param collateral Address of the collateral token transferred
	 * @param sender Address of the user initiating the transfer
	 * @param receiver Address of the user receiving the funds on target protocol
	 * @param amount Amount of collateral transferred
	 * @param source Address of the source Symmio protocol instance
	 * @param sourceMultiAccount Address of the source multi-account contract
	 * @param target Address of the target Symmio protocol instance
	 */
	event TransferExecuted(
		address collateral,
		address sender,
		address receiver,
		uint256 amount,
		address source,
		address sourceMultiAccount,
		address target
	);

	/* ─────────────────────────────── Errors ─────────────────────────────── */

	/// @notice Thrown when a zero address is provided where a valid address is required
	error InvalidAddress();

	/// @notice Thrown when attempting to transfer to a non-whitelisted target protocol
	error TargetNotWhitelisted();

	/// @notice Thrown when caller is not authorized to perform the requested action
	error Unauthorized();

	/// @notice Thrown when source and target protocols have different collateral tokens
	error MismatchedCollateral();

	/// @notice Thrown when the required withdraw cooldown period has not elapsed
	error WithdrawCooldownNotReached();

	/* ─────────────────────────────── Initialization ─────────────────────────────── */

	/**
	 * @notice Initializes the contract with admin role assignments
	 * @param admin Address to receive all initial administrative roles
	 * @dev This function can only be called once due to the initializer modifier
	 *      Grants DEFAULT_ADMIN_ROLE, SETTER_ROLE, and UNPAUSER_ROLE to the admin
	 */
	function initialize(address admin) external initializer {
		__Pausable_init();
		__AccessControl_init();

		if (admin == address(0)) revert InvalidAddress();

		_grantRole(DEFAULT_ADMIN_ROLE, admin);
		_grantRole(SETTER_ROLE, admin);
		_grantRole(UNPAUSER_ROLE, admin);
	}

	/* ─────────────────────────────── Transfer Management ─────────────────────────────── */

	/**
	 * @notice Executes a cross-protocol collateral transfer between Symmio instances
	 * @param sender Address of the user whose funds are being transferred
	 * @param receiver Address of the user who will receive funds on the target protocol
	 * @param amount Amount of collateral to transfer
	 * @param source Address of the source Symmio protocol instance
	 * @param sourceMultiAccount Address of the multi-account contract for the source
	 * @param target Address of the target Symmio protocol instance
	 */
	function transfer(
		address sender,
		address receiver,
		uint256 amount,
		address source,
		address sourceMultiAccount,
		address target
	) external whenNotPaused {
		// Input validation
		if (receiver == address(0) || source == address(0) || target == address(0) || sourceMultiAccount == address(0)) {
			revert InvalidAddress();
		}

		if (!whitelistedTargets[target]) revert TargetNotWhitelisted();

		// Authorization check
		if (msg.sender != IMultiAccount(sourceMultiAccount).owners(sender)) revert Unauthorized();

		// Collateral compatibility check
		address collateral = ISymmio(source).getCollateral();
		if (collateral != ISymmio(target).getCollateral()) revert MismatchedCollateral();

		// Cooldown validation
		(uint256 originalCooldown, , , ) = ISymmio(source).coolDownsOfMA();
		uint256 deallocateTimestamp = ISymmio(source).withdrawCooldownOf(sender);

		if (deallocateTimestamp + targetWithdrawCooldowns[target] > block.timestamp) {
			revert WithdrawCooldownNotReached();
		}

		// Temporarily disable cooldown for withdrawal
		ISymmio(source).setDeallocateCooldown(0);

		// Execute withdrawal via multi-account
		bytes[] memory withdrawCallData = new bytes[](1);
		withdrawCallData[0] = abi.encodeWithSignature("withdrawTo(address,uint256)", address(this), amount);
		IMultiAccount(sourceMultiAccount)._call(sender, withdrawCallData);

		// Restore original cooldown
		ISymmio(source).setDeallocateCooldown(originalCooldown);

		// Deposit to target protocol
		IERC20(collateral).approve(target, amount);
		ISymmio(target).depositFor(receiver, amount);

		emit TransferExecuted(collateral, sender, receiver, amount, source, sourceMultiAccount, target);
	}

	/* ─────────────────────────────── Admin Functions ─────────────────────────────── */

	/**
	 * @notice Updates the whitelist status for multiple target protocols
	 * @param targets Array of target protocol addresses to update
	 * @param states Array of whitelist states corresponding to each target
	 * @dev Only addresses with SETTER_ROLE can call this function
	 *      Arrays must be the same length for proper pairing
	 */
	function setWhitelistedTargets(address[] calldata targets, bool[] calldata states) external onlyRole(SETTER_ROLE) {
		for (uint256 i = 0; i < targets.length; i++) {
			whitelistedTargets[targets[i]] = states[i];
		}
		emit SetWhitelistedTargets(targets, states);
	}

	/**
	 * @notice Updates withdraw cooldown requirements for multiple target protocols
	 * @param targets Array of target protocol addresses to update
	 * @param cooldowns Array of cooldown periods in seconds corresponding to each target
	 * @dev Only addresses with SETTER_ROLE can call this function
	 *      Arrays must be the same length for proper pairing
	 */
	function setTargetWithdrawCooldowns(address[] calldata targets, uint256[] calldata cooldowns) external onlyRole(SETTER_ROLE) {
		for (uint256 i = 0; i < targets.length; i++) {
			targetWithdrawCooldowns[targets[i]] = cooldowns[i];
		}
		emit SetTargetWithdrawCooldowns(targets, cooldowns);
	}

	/**
	 * @notice Pauses all transfer operations in emergency situations
	 * @dev Only addresses with PAUSER_ROLE can call this function
	 *      When paused, the transfer function will revert
	 */
	function pause() external onlyRole(PAUSER_ROLE) {
		_pause();
	}

	/**
	 * @notice Unpauses transfer operations after emergency resolution
	 * @dev Only addresses with UNPAUSER_ROLE can call this function
	 *      Restores normal transfer functionality
	 */
	function unpause() external onlyRole(UNPAUSER_ROLE) {
		_unpause();
	}
}
