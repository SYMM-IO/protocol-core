// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

// import "../interfaces/ISymmio.sol";

interface ISymmio {
	function withdraw(uint256 amount) external;

	function getCollateral() external view returns (address);
}

contract FeeCollector is Initializable, PausableUpgradeable, AccessControlUpgradeable {
	using SafeERC20Upgradeable for IERC20Upgradeable;

	struct SymmioFrontendShare {
		address receiver;
		uint256 share; // decimals 6
	}

	// Defining roles for access control
	bytes32 public constant COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");
	bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
	bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
	bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

	// State variables
	address public symmioAddress;
	SymmioFrontendShare[] public frontends;
	uint256 public totalShare;

	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		_disableInitializers();
	}

	function initialize(address admin, address symmioAddress_, address symmioReceiver, uint256 symmioShare) public initializer {
		require(admin != address(0), "FeeCollector: Zero address");
		require(symmioAddress != address(0), "FeeCollector: Zero address");
		require(symmioReceiver != address(0), "FeeCollector: Zero address");

		__Pausable_init();
		__AccessControl_init();

		_grantRole(DEFAULT_ADMIN_ROLE, admin);
		symmioAddress = symmioAddress_;
		SymmioFrontendShare memory fe = SymmioFrontendShare(symmioReceiver, symmioShare);
		frontends.push(fe);
		totalShare = symmioShare;
	}

	function setSymmioAddress(address symmioAddress_) external onlyRole(SETTER_ROLE) {
		require(symmioAddress_ != address(0), "FeeCollector: Zero address");
		symmioAddress = symmioAddress_;
	}

	function addFrontend(address receiver, uint256 share) external onlyRole(SETTER_ROLE) {
		require(receiver != address(0), "FeeCollector: Zero address");
		SymmioFrontendShare memory fe = SymmioFrontendShare(receiver, share);
		frontends.push(fe);
		totalShare += share;
	}

	function removeFrontend(uint256 id, address receiver) external onlyRole(SETTER_ROLE) {
		require(frontends[id].receiver == receiver, "FeeCollector: Invalid address");
		totalShare -= frontends[id].share;
		frontends[id] = frontends[frontends.length - 1];
		frontends.pop();
	}

	function claimFee(uint256 amount) external onlyRole(COLLECTOR_ROLE) whenNotPaused {
		address collateral = ISymmio(symmioAddress).getCollateral();
		ISymmio(symmioAddress).withdraw(amount);
		for (uint256 i = 0; i < frontends.length; i++) {
			IERC20Upgradeable(collateral).safeTransfer(frontends[i].receiver, (frontends[i].share * amount) / totalShare);
		}
	}

	function pause() external onlyRole(PAUSER_ROLE) whenNotPaused {
		_pause();
	}

	function unpause() external onlyRole(UNPAUSER_ROLE) {
		_unpause();
	}
}
