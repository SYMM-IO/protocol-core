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

interface ISymmioCore {
    function withdraw(uint256 amount) external;

    function getCollateral() external view returns (address);

    function balanceOf(address user) external view returns (uint256);
}

/// @title SymmioFeeDistributor
/// @notice This contract manages the distribution of fees from the Symmio protocol to various stakeholders
/// @dev This contract is upgradeable, pausable, and uses role-based access control
contract SymmioFeeDistributor is Initializable, PausableUpgradeable, AccessControlEnumerableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct Stakeholder {
        address receiver; // The address of the stakeholder
        uint256 share;    // The share of fees allocated to the stakeholder (in 18 decimal format)
    }

    // Defining roles for access control
    bytes32 public constant COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");
    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

    // State variables
    /// @notice Address of the Symmio contract
    address public symmioAddress;

    /// @notice Address of the Symmio fee receiver
    address public symmioReceiver;

    /// @notice Share of fees allocated to Symmio (in 18 decimal format)
    uint256 public symmioShare;

    /// @notice Array of stakeholders and their respective shares, including Symmio as the first stakeholder
    Stakeholder[] public stakeholders;

    /// @notice Total share allocated to stakeholders excluding Symmio (in 18 decimal format)
    uint256 private totalStakeholderShare;

    // Events
    event SymmioAddressUpdated(address indexed oldAddress, address indexed newAddress);
    event SymmioStakeholderUpdated(address indexed oldReceiver, address indexed newReceiver, uint256 oldShare, uint256 newShare);
    event StakeholdersUpdated(Stakeholder[] newStakeholders);
    event FeeDistributed(address indexed receiver, uint256 amount);
    event FeesClaimed(uint256 totalAmount);

    // Errors
    error ZeroAddress();
    error InvalidShare();
    error TotalSharesMustEqualOne();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract with initial parameters
    /// @param admin Address of the admin who will have the DEFAULT_ADMIN_ROLE
    /// @param symmioAddress_ Address of the Symmio contract
    /// @param symmioReceiver_ Address of the Symmio fee receiver
    /// @param symmioShare_ Share of fees allocated to Symmio (in 18 decimal format)
    function initialize(
        address admin,
        address symmioAddress_,
        address symmioReceiver_,
        uint256 symmioShare_
    ) public initializer {
        if (admin == address(0) || symmioAddress_ == address(0) || symmioReceiver_ == address(0)) revert ZeroAddress();
        if (symmioShare_ > 1e18) revert InvalidShare();

        __Pausable_init();
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        symmioAddress = symmioAddress_;
        symmioReceiver = symmioReceiver_;
        symmioShare = symmioShare_;

        stakeholders.push(Stakeholder(symmioReceiver_, symmioShare_));
    }

    /// @notice Sets the address of the Symmio contract
    /// @param symmioAddress_ New address of the Symmio contract
    function setSymmioAddress(address symmioAddress_) external onlyRole(SETTER_ROLE) {
        if (symmioAddress_ == address(0)) revert ZeroAddress();
        address oldAddress = symmioAddress;
        symmioAddress = symmioAddress_;
        emit SymmioAddressUpdated(oldAddress, symmioAddress_);
    }

    /// @notice Updates the Symmio stakeholder details
    /// @param symmioReceiver_ New address of the Symmio fee receiver
    /// @param symmioShare_ New share of fees allocated to Symmio (in 18 decimal format)
    function setSymmioStakeholder(address symmioReceiver_, uint256 symmioShare_) external onlyRole(SETTER_ROLE) {
        if (symmioReceiver_ == address(0)) revert ZeroAddress();
        if (symmioShare_ > 1e18) revert InvalidShare();

        address oldReceiver = symmioReceiver;
        uint256 oldShare = symmioShare;

        symmioReceiver = symmioReceiver_;
        symmioShare = symmioShare_;

        // Update Symmio's stakeholder entry (always at index 0)
        stakeholders[0] = Stakeholder(symmioReceiver_, symmioShare_);

        emit SymmioStakeholderUpdated(oldReceiver, symmioReceiver_, oldShare, symmioShare_);
    }

    /// @notice Sets the list of stakeholders and their shares (excluding Symmio)
    /// @param newStakeholders Array of new stakeholders and their shares
    function setStakeholders(Stakeholder[] calldata newStakeholders) external onlyRole(MANAGER_ROLE) {
        // Clear the existing stakeholders list except the first one (Symmio)
        delete stakeholders;
        // Re-add Symmio as the first stakeholder
        stakeholders.push(Stakeholder(symmioReceiver, symmioShare));

        uint256 newTotalStakeholderShare = 0;
        uint256 len = newStakeholders.length;

        for (uint256 i = 0; i < len; i++) {
            if (newStakeholders[i].receiver == address(0)) revert ZeroAddress();

            newTotalStakeholderShare += newStakeholders[i].share;
            stakeholders.push(newStakeholders[i]);
        }

        // Ensure that the total shares (Symmio's share + other stakeholders) sum up to 1e18 (100%)
        if (newTotalStakeholderShare + symmioShare != 1e18) revert TotalSharesMustEqualOne();

        totalStakeholderShare = newTotalStakeholderShare;
        emit StakeholdersUpdated(newStakeholders);
    }

    /// @notice Calculates the total claimable fee amount from the Symmio contract, adjusted for token decimals
    /// @return The total claimable fee amount
    function getClaimable() internal view returns (uint256) {
        address collateral = ISymmioCore(symmioAddress).getCollateral();
        uint8 decimals = IERC20Metadata(collateral).decimals();
        uint256 balance = ISymmioCore(symmioAddress).balanceOf(address(this));
        return balance / (10 ** (18 - decimals));
    }

    /// @notice Claims all available fees and distributes them to stakeholders
    function claimAllFee() external onlyRole(COLLECTOR_ROLE) whenNotPaused {
        claimFee(getClaimable());
    }

    /// @notice Claims a specific amount of fees and distributes them to stakeholders
    /// @param amount Amount of fees to claim and distribute
    function claimFee(uint256 amount) public onlyRole(COLLECTOR_ROLE) whenNotPaused {
        // Ensure that the total shares sum up to 100%
        if (totalStakeholderShare + symmioShare != 1e18) revert TotalSharesMustEqualOne();

        address collateral = ISymmioCore(symmioAddress).getCollateral();
        ISymmioCore(symmioAddress).withdraw(amount);

        uint256 len = stakeholders.length;
        for (uint256 i = 0; i < len; i++) {
            uint256 share = (stakeholders[i].share * amount) / 1e18;
            IERC20Upgradeable(collateral).safeTransfer(stakeholders[i].receiver, share);
            emit FeeDistributed(stakeholders[i].receiver, share);
        }
        emit FeesClaimed(amount);
    }

    /// @notice Pauses the contract, disabling certain functions
    function pause() external onlyRole(PAUSER_ROLE) whenNotPaused {
        _pause();
    }

    /// @notice Unpauses the contract, enabling functions that were disabled during pause
    function unpause() external onlyRole(UNPAUSER_ROLE) {
        _unpause();
    }

    /// @notice Simulates claiming all fees without actually transferring tokens
    /// @return holders Array of stakeholder addresses
    /// @return shares Array of fee shares corresponding to each stakeholder
    function dryClaimAllFee() public view returns (address[] memory holders, uint256[] memory shares) {
        uint256 totalClaimable = getClaimable();
        uint256 len = stakeholders.length;

        holders = new address[](len);
        shares = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            holders[i] = stakeholders[i].receiver;
            shares[i] = (stakeholders[i].share * totalClaimable) / 1e18;
        }

        return (holders, shares);
    }

    /// @notice Returns the number of stakeholders, including Symmio
    /// @return The count of stakeholders
    function getStakeholderCount() external view returns (uint256) {
        return stakeholders.length;
    }
}