// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

interface ISymmio {
    function withdraw(uint256 amount) external;

    function getCollateral() external view returns (address);
}

contract FeeCollector is Initializable, PausableUpgradeable, AccessControlEnumerableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct Stakeholder {
        address receiver;
        uint256 share; // decimals 18
    }

    // Defining roles for access control
    bytes32 public constant COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");
    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

    // State variables
    address public symmioAddress;
    address public symmioReceiver;
    uint256 public symmioShare;
    Stakeholder[] public stakeholders;
    uint256 public totalStakeholderShare;

    // Events
    event SymmioAddressUpdated(address indexed oldAddress, address indexed newAddress);
    event SymmioStakeholderUpdated(address indexed oldReceiver, address indexed newReceiver, uint256 oldShare, uint256 newShare);
    event StakeholdersUpdated(Stakeholder[] newStakeholders);
    event FeesClaimed(uint256 amount, address indexed collateralToken);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address symmioAddress_,
        address symmioReceiver_,
        uint256 symmioShare_
    ) public initializer {
        require(admin != address(0), "FeeCollector: Zero address");
        require(symmioAddress_ != address(0), "FeeCollector: Zero address");
        require(symmioReceiver_ != address(0), "FeeCollector: Zero address");
        require(symmioShare_ <= 1e18, "FeeCollector: Invalid share");

        __Pausable_init();
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        symmioAddress = symmioAddress_;
        symmioReceiver = symmioReceiver_;
        symmioShare = symmioShare_;
        stakeholders.push(Stakeholder(symmioReceiver_, symmioShare_));
    }

    function setSymmioAddress(address symmioAddress_) external onlyRole(SETTER_ROLE) {
        require(symmioAddress_ != address(0), "FeeCollector: Zero address");
        address oldAddress = symmioAddress;
        symmioAddress = symmioAddress_;
        emit SymmioAddressUpdated(oldAddress, symmioAddress_);
    }

    function setSymmioStakeholder(address symmioReceiver_, uint256 symmioShare_) external onlyRole(SETTER_ROLE) {
        require(symmioReceiver_ != address(0), "FeeCollector: Zero address");
        require(symmioShare_ <= 1e18, "FeeCollector: Invalid share");

        address oldReceiver = symmioReceiver;
        uint256 oldShare = symmioShare;

        symmioReceiver = symmioReceiver_;
        symmioShare = symmioShare_;
        stakeholders[0] = Stakeholder(symmioReceiver_, symmioShare_);

        emit SymmioStakeholderUpdated(oldReceiver, symmioReceiver_, oldShare, symmioShare_);
    }

    function setStakeholders(Stakeholder[] calldata newStakeholders) external onlyRole(MANAGER_ROLE) {
        // Clear the existing stakeholders list except the first one (Symmio)
        delete stakeholders;
        stakeholders.push(Stakeholder(symmioReceiver, symmioShare));

        uint256 newTotalStakeholderShare = 0;
        for (uint256 i = 0; i < newStakeholders.length; i++) {
            require(newStakeholders[i].receiver != address(0), "FeeCollector: Zero address");
            newTotalStakeholderShare += newStakeholders[i].share;
            stakeholders.push(newStakeholders[i]);
        }

        require(newTotalStakeholderShare + symmioShare == 1e18, "FeeCollector: Total shares must equal 1");

        totalStakeholderShare = newTotalStakeholderShare;
        emit StakeholdersUpdated(newStakeholders);
    }

    function claimFee(uint256 amount) external onlyRole(COLLECTOR_ROLE) whenNotPaused {
        require(totalStakeholderShare + symmioShare == 1e18, "FeeCollector: Total shares must equal 1");

        address collateral = ISymmio(symmioAddress).getCollateral();
        ISymmio(symmioAddress).withdraw(amount);
        for (uint256 i = 0; i < stakeholders.length; i++) {
            IERC20Upgradeable(collateral).safeTransfer(stakeholders[i].receiver, (stakeholders[i].share * amount) / 1e18);
        }
        emit FeesClaimed(amount, collateral);
    }

    function pause() external onlyRole(PAUSER_ROLE) whenNotPaused {
        _pause();
    }

    function unpause() external onlyRole(UNPAUSER_ROLE) {
        _unpause();
    }
}