// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISymmio {
	function getCollateral() external view returns (address);

	function coolDownsOfMA() external view returns (uint256, uint256, uint256, uint256);

	function setDeallocateCooldown(uint256 deallocateCooldown) external;

	function depositFor(address user, uint256 amount) external;
}

interface IMultiAccount {
	function _call(address account, bytes[] memory _callDatas) external;

	function owners(address account) external view returns (address);
}

contract SymmioGlobalRelayer is AccessControlEnumerableUpgradeable, PausableUpgradeable {
	using SafeERC20 for IERC20;

	bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
	bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
	bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

	event SetWhitelistedTargets(address[] targets, bool[] states);
	event TransferExecuted(
		address collateral,
		address sender,
		address receiver,
		uint256 amount,
		address source,
		address sourceMultiAccount,
		address target
	);

	error InvalidAddress();
	error TargetNotWhitelisted();
	error Unauthorized();
	error MismatchedCollateral();

	mapping(address => bool) public whitelistedTargets;

	constructor() {
		_disableInitializers();
	}

	function initialize(address admin) external initializer {
		if (admin == address(0)) revert InvalidAddress();
		_grantRole(DEFAULT_ADMIN_ROLE, admin);
		_grantRole(SETTER_ROLE, admin);
		_grantRole(UNPAUSER_ROLE, admin);
	}

	function setWhitelistedTargets(address[] calldata targets, bool[] calldata states) external onlyRole(SETTER_ROLE) {
		for (uint256 i = 0; i < targets.length; i++) whitelistedTargets[targets[i]] = states[i];
		emit SetWhitelistedTargets(targets, states);
	}

	function pause() external onlyRole(PAUSER_ROLE) {
		_pause();
	}

	function unpause() external onlyRole(UNPAUSER_ROLE) {
		_unpause();
	}

	function transfer(
		address sender,
		address receiver,
		uint256 amount,
		address source,
		address sourceMultiAccount,
		address target
	) external whenNotPaused {
		if (receiver == address(0) || source == address(0) || target == address(0) || sourceMultiAccount == address(0)) revert InvalidAddress();
		if (!whitelistedTargets[target]) revert TargetNotWhitelisted();

		if (msg.sender != IMultiAccount(sourceMultiAccount).owners(sender)) revert Unauthorized();

		address collateral = ISymmio(source).getCollateral();

		if (collateral != ISymmio(target).getCollateral()) revert MismatchedCollateral();

		// Get the current deallocateCooldown from symmio
		(uint256 originalCooldown, , , ) = ISymmio(source).coolDownsOfMA();

		// Set deallocateCooldown to 0
		ISymmio(source).setDeallocateCooldown(0);

		// Withdraw funds from the user's account to this contract via MultiAccount
		bytes[] memory withdrawCallData = new bytes[](1);
		withdrawCallData[0] = abi.encodeWithSignature("withdrawTo(address,uint256)", address(this), amount);
		IMultiAccount(sourceMultiAccount)._call(sender, withdrawCallData);

		// Restore the original deallocateCooldown
		ISymmio(source).setDeallocateCooldown(originalCooldown);

		IERC20(collateral).approve(target, amount);
		ISymmio(target).depositFor(receiver, amount);
		emit TransferExecuted(collateral, sender, receiver, amount, source, sourceMultiAccount, target);
	}
}
