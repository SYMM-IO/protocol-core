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
import "../interfaces/ISymmio.sol";
import "../interfaces/ISymmioPartyA.sol";
import "../interfaces/IMultiAccount.sol";

contract MultiAccount is
    IMultiAccount,
    Initializable,
    PausableUpgradeable,
    AccessControlUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Defining roles for access control
    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

    // State variables
    mapping(address => Account[]) public accounts; // User to their accounts mapping
    mapping(address => uint256) public indexOfAccount; // Account to its index mapping
    mapping(address => address) public owners; // Account to its owner mapping

    address public accountsAdmin; // Admin address for the contract
    address public symmioAddress; // Address of the Symmio platform
    uint256 public saltCounter; // Counter for generating unique addresses with create2
    bytes public accountImplementation;

    modifier onlyOwner(address account, address sender) {
        require(
            owners[account] == sender,
            "MultiAccount: Sender isn't owner of account"
        );
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address symmioAddress_,
        bytes memory accountImplementation_
    ) public initializer {
        __Pausable_init();
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UNPAUSER_ROLE, admin);
        _grantRole(SETTER_ROLE, admin);
        accountsAdmin = admin;
        symmioAddress = symmioAddress_;
        accountImplementation = accountImplementation_;
    }

    function setAccountImplementation(
        bytes memory accountImplementation_
    ) external onlyRole(SETTER_ROLE) {
        emit SetAccountImplementation(
            accountImplementation,
            accountImplementation_
        );
        accountImplementation = accountImplementation_;
    }

    function setSymmioAddress(address addr) external onlyRole(SETTER_ROLE) {
        emit SetSymmioAddress(symmioAddress, addr);
        symmioAddress = addr;
    }

    function _deployPartyA() internal returns (address account) {
        bytes32 salt = keccak256(
            abi.encodePacked("MultiAccount_", saltCounter)
        );
        saltCounter += 1;

        bytes memory bytecode = abi.encodePacked(
            accountImplementation,
            abi.encode(accountsAdmin, address(this), symmioAddress)
        );
        account = _deployContract(bytecode, salt);
        return account;
    }

    function _deployContract(
        bytes memory bytecode,
        bytes32 salt
    ) internal returns (address contractAddress) {
        assembly {
            contractAddress := create2(
                0,
                add(bytecode, 32),
                mload(bytecode),
                salt
            )
        }
        require(symmioAddress != address(0), "MultiAccount: create2 failed");
        emit DeployContract(msg.sender, contractAddress);
        return contractAddress;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(UNPAUSER_ROLE) {
        _unpause();
    }

    //////////////////////////////// Account Management ////////////////////////////////////

    function addAccount(string memory name) external whenNotPaused {
        address account = _deployPartyA();
        indexOfAccount[account] = accounts[msg.sender].length;
        accounts[msg.sender].push(Account(account, name));
        owners[account] = msg.sender;
        emit AddAccount(msg.sender, account, name);
    }

    function editAccountName(
        address accountAddress,
        string memory name
    ) external whenNotPaused {
        uint256 index = indexOfAccount[accountAddress];
        accounts[msg.sender][index].name = name;
        emit EditAccountName(msg.sender, accountAddress, name);
    }

    function depositForAccount(
        address account,
        uint256 amount
    ) external onlyOwner(account, msg.sender) whenNotPaused {
        address collateral = ISymmio(symmioAddress).getCollateral();
        IERC20Upgradeable(collateral).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        IERC20Upgradeable(collateral).safeApprove(symmioAddress, amount);
        ISymmio(symmioAddress).depositFor(account, amount);
        emit DepositForAccount(msg.sender, account, amount);
    }

    function depositAndAllocateForAccount(
        address account,
        uint256 amount
    ) external onlyOwner(account, msg.sender) whenNotPaused {
        address collateral = ISymmio(symmioAddress).getCollateral();
        IERC20Upgradeable(collateral).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        IERC20Upgradeable(collateral).safeApprove(symmioAddress, amount);
        ISymmio(symmioAddress).depositFor(account, amount);
        bytes memory _callData = abi.encodeWithSignature(
            "allocate(uint256)",
            amount
        );
        innerCall(account, _callData);
        emit AllocateForAccount(msg.sender, account, amount);
        emit DepositForAccount(msg.sender, account, amount);
    }

    function withdrawFromAccount(
        address account,
        uint256 amount
    ) external onlyOwner(account, msg.sender) whenNotPaused {
        bytes memory _callData = abi.encodeWithSignature(
            "withdrawTo(address,uint256)",
            owners[account],
            amount
        );
        emit WithdrawFromAccount(msg.sender, account, amount);
        innerCall(account, _callData);
    }

    function innerCall(address account, bytes memory _callData) internal {
        (bool _success, bytes memory _resultData) = ISymmioPartyA(account)
            ._call(_callData);
        emit Call(msg.sender, account, _callData, _success, _resultData);
        require(_success, "MultiAccount: Error occurred");
    }

    function _call(
        address account,
        bytes[] memory _callDatas
    ) public onlyOwner(account, msg.sender) whenNotPaused {
        for (uint8 i; i < _callDatas.length; i++) {
            innerCall(account, _callDatas[i]);
        }
    }

    //////////////////////////////// VIEWS ////////////////////////////////////

    function getAccountsLength(address user) external view returns (uint256) {
        return accounts[user].length;
    }

    function getAccounts(
        address user,
        uint256 start,
        uint256 size
    ) external view returns (Account[] memory) {
        uint256 len = size > accounts[user].length - start
            ? accounts[user].length - start
            : size;
        Account[] memory userAccounts = new Account[](len);
        for (uint256 i = start; i < start + len; i++) {
            userAccounts[i - start] = accounts[user][i];
        }
        return userAccounts;
    }
}
