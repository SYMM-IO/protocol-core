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

interface ISymmio {
    function withdraw(uint256 amount) external;

    function getCollateral() external view returns (address);
}

contract FeeCollector is Initializable, PausableUpgradeable, AccessControlUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct Stakeholder {
        address receiver;
        uint256 share; // decimals 18
    }

    // Defining roles for access control
    bytes32 public constant COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");
    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

    // State variables
    address public symmioAddress;
    address public symmioReceiver;
    uint256 public symmioShare;
    Stakeholder[] public stakeholders;
    uint256 public totalStakeholderShare;

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
        symmioAddress = symmioAddress_;
    }

    function setSymmioReceiver(address symmioReceiver_) external onlyRole(SETTER_ROLE) {
        require(symmioReceiver_ != address(0), "FeeCollector: Zero address");
        symmioReceiver = symmioReceiver_;
        stakeholders[0].receiver = symmioReceiver_;
    }

    function setSymmioShare(uint256 symmioShare_) external onlyRole(SETTER_ROLE) {
        require(symmioShare_ <= 1e18, "FeeCollector: Invalid share");

        symmioShare = symmioShare_;
        stakeholders[0].share = symmioShare_;
    }

    function setStakeholders(Stakeholder[] calldata newStakeholders) external onlyRole(SETTER_ROLE) {
        // Clear the existing stakeholders list except the first one (Symmio)
        delete stakeholders;
        stakeholders.push(Stakeholder(symmioReceiver, symmioShare));
        totalStakeholderShare = 0;

        uint256 newTotalStakeholderShare = 0;
        for (uint256 i = 0; i < newStakeholders.length; i++) {
            require(newStakeholders[i].receiver != address(0), "FeeCollector: Zero address");
            newTotalStakeholderShare += newStakeholders[i].share;
            stakeholders.push(newStakeholders[i]);
        }

        require(newTotalStakeholderShare + symmioShare == 1e18, "FeeCollector: Total shares must equal 1");

        totalStakeholderShare = newTotalStakeholderShare;
    }

    function claimFee(uint256 amount) external onlyRole(COLLECTOR_ROLE) whenNotPaused {
        require(totalStakeholderShare + symmioShare == 1e18, "FeeCollector: Total shares must equal 1");

        address collateral = ISymmio(symmioAddress).getCollateral();
        ISymmio(symmioAddress).withdraw(amount);
        for (uint256 i = 0; i < stakeholders.length; i++) {
            IERC20Upgradeable(collateral).safeTransfer(stakeholders[i].receiver, (stakeholders[i].share * amount) / 1e18);
        }
    }

    function pause() external onlyRole(PAUSER_ROLE) whenNotPaused {
        _pause();
    }

    function unpause() external onlyRole(UNPAUSER_ROLE) {
        _unpause();
    }
}
