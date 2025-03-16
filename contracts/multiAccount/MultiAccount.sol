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
import "../interfaces/ISymmio.sol";
import "../interfaces/ISymmioPartyA.sol";
import "../interfaces/IMultiAccount.sol";

contract MultiAccount is IMultiAccount, Initializable, PausableUpgradeable, AccessControlUpgradeable {
	using SafeERC20Upgradeable for IERC20Upgradeable;

	bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
	bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
	bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

	mapping(address => Account[]) public accounts; // User to their accounts mapping
	mapping(address => uint256) public indexOfAccount; // Account to its index mapping
	mapping(address => address) public owners; // Account to its owner mapping

	address public accountsAdmin; // Admin address for the accounts
	address public symmioAddress; // Address of the Symmio platform
	uint256 public saltCounter; // Counter for generating unique addresses with create2
	bytes public accountImplementation;
	address public externalAccountWithdrawManagerAddress; // Address of ExternalAccountWithdrawManager contract

	mapping(address => mapping(address => mapping(bytes4 => bool))) public delegatedAccesses; // account -> target -> selector -> state

	uint256 public revokeCooldown;
	mapping(address => mapping(address => mapping(bytes4 => uint256))) public revokeProposalTimestamp; // account -> target -> selector -> timestamp

	// Modifier to check if the sender is the owner of the account
	modifier onlyOwner(address account, address sender) {
		require(owners[account] == sender, "MultiAccount: Sender isn't owner of account");
		_;
	}
	
    // Modifier to allow access only to the contract owner or the ExternalAccountWithdrawManager contract.
	modifier onlyWithdrawAuthorized() {
        require(msg.sender == externalAccountWithdrawManagerAddress, "MultiAccount: Not authorized");
        _;
    }

	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		_disableInitializers();
	}

	/**
	 * @dev Initializes the contract with necessary parameters.
	 * @param admin The admin address for the accounts contracts.
	 * @param symmioAddress_ The address of the Symmio platform.
	 * @param accountImplementation_ The bytecode of the account implementation contract.
	 */
	function initialize(address admin, address symmioAddress_, bytes memory accountImplementation_) public initializer {
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

	/**
	 * @dev Allows the owner of an account to delegate access to a specific function selector of a target contract.
	 * @param account The address of the account.
	 * @param target The address of the target contract.
	 * @param selector The function selector.
	 * @param state The state indicating whether access is granted or revoked.
	 */
	function delegateAccess(address account, address target, bytes4 selector, bool state) external onlyOwner(account, msg.sender) {
		require(target != msg.sender && target != account, "MultiAccount: Invalid target");
		require(state, "MultiAccount: Invalid state");
		emit DelegateAccess(account, target, selector, state);
		delegatedAccesses[account][target][selector] = state;
	}

	/**
	 * @dev Allows the owner of an account to delegate access to a single target contract and multiple function selectors.
	 * @param account The address of the account.
	 * @param target The address of the target contract.
	 * @param selector An array of function selectors.
	 * @param state The state indicating whether access is granted or revoked.
	 */
	function delegateAccesses(address account, address target, bytes4[] memory selector, bool state) external onlyOwner(account, msg.sender) {
		require(target != msg.sender && target != account, "MultiAccount: Invalid target");
		require(state, "MultiAccount: Invalid state");
		for (uint256 i = selector.length; i != 0; i--) {
			delegatedAccesses[account][target][selector[i - 1]] = state;
		}
		emit DelegateAccesses(account, target, selector, state);
	}

	/**
	 * @dev Allows the owner of an account to propose revoke access from a single target contract and multiple function selectors.
	 * @param account The address of the account.
	 * @param target The address of the target contract.
	 * @param selector An array of function selectors.
	 */
	function proposeToRevokeAccesses(address account, address target, bytes4[] memory selector) external onlyOwner(account, msg.sender) {
		require(target != msg.sender && target != account, "MultiAccount: Invalid target");
		for (uint256 i = selector.length; i != 0; i--) {
			revokeProposalTimestamp[account][target][selector[i - 1]] = block.timestamp;
		}
		emit ProposeToRevokeAccesses(account, target, selector);
	}

	/**
	 * @dev Allows the owner of an account to revoke access from a single target contract and multiple function selectors.
	 * @param account The address of the account.
	 * @param target The address of the target contract.
	 * @param selector An array of function selectors.
	 */
	function revokeAccesses(address account, address target, bytes4[] memory selector) external onlyOwner(account, msg.sender) {
		require(target != msg.sender && target != account, "MultiAccount: Invalid target");
		for (uint256 i = selector.length; i != 0; i--) {
			require(revokeProposalTimestamp[account][target][selector[i - 1]] != 0, "MultiAccount: Revoke access not proposed");
			require(
				revokeProposalTimestamp[account][target][selector[i - 1]] + revokeCooldown <= block.timestamp,
				"MultiAccount: Cooldown not reached"
			);
			delegatedAccesses[account][target][selector[i - 1]] = false;
			revokeProposalTimestamp[account][target][selector[i - 1]] = 0;
		}
		emit DelegateAccesses(account, target, selector, false);
	}

	/**
	 * @dev Sets the implementation contract for the account.
	 * @param accountImplementation_ The bytecodes of the new implementation contract.
	 */
	function setAccountImplementation(bytes memory accountImplementation_) external onlyRole(SETTER_ROLE) {
		emit SetAccountImplementation(accountImplementation, accountImplementation_);
		accountImplementation = accountImplementation_;
	}

	/**
	 * @dev Sets the Admin for the accounts.
	 * @param admin The Address of the new accounts admin.
	 */
	function setAccountsAdmin(address admin) external onlyRole(SETTER_ROLE) {
		emit SetAccountsAdmin(accountsAdmin, admin);
		accountsAdmin = admin;
	}

	/**
	 * @dev Sets the revoke cooldown.
	 * @param cooldown the new revoke cooldown.
	 */
	function setRevokeCooldown(uint256 cooldown) external onlyRole(SETTER_ROLE) {
		emit SetRevokeCooldown(revokeCooldown, cooldown);
		revokeCooldown = cooldown;
	}

	/**
	 * @dev Sets the address of the Symmio platform.
	 * @param addr The address of the Symmio platform.
	 */
	function setSymmioAddress(address addr) external onlyRole(SETTER_ROLE) {
		emit SetSymmioAddress(symmioAddress, addr);
		symmioAddress = addr;
	}

	/**
	 * @dev Internal function to deploy a new party A account contract.
	 * @return account The address of the newly deployed account contract.
	 */
	function _deployPartyA() internal returns (address account) {
		bytes32 salt = keccak256(abi.encodePacked("MultiAccount_", saltCounter));
		saltCounter += 1;

		bytes memory bytecode = abi.encodePacked(accountImplementation, abi.encode(accountsAdmin, address(this), symmioAddress));
		account = _deployContract(bytecode, salt);
		return account;
	}

	/**
	 * @dev Internal function to deploy a contract with create2.
	 * @param bytecode The bytecode of the contract to be deployed.
	 * @param salt The salt used for contract deployment.
	 * @return contractAddress The address of the deployed contract.
	 */
	function _deployContract(bytes memory bytecode, bytes32 salt) internal returns (address contractAddress) {
		assembly {
			contractAddress := create2(0, add(bytecode, 32), mload(bytecode), salt)
		}
		require(contractAddress != address(0), "MultiAccount: create2 failed");
		emit DeployContract(msg.sender, contractAddress);
		return contractAddress;
	}

	/**
	 * @dev Pauses the contract, preventing execution of transactions.
	 */
	function pause() external onlyRole(PAUSER_ROLE) {
		_pause();
	}

	/**
	 * @dev Unpauses the contract, allowing execution of transactions.
	 */
	function unpause() external onlyRole(UNPAUSER_ROLE) {
		_unpause();
	}

	//////////////////////////////// Account Management ////////////////////////////////////

	/**
	 * @dev Adds a new account for the caller with the specified name.
	 * @param name The name of the new account.
	 */
	function addAccount(string memory name) external whenNotPaused {
		address account = _deployPartyA();
		indexOfAccount[account] = accounts[msg.sender].length;
		accounts[msg.sender].push(Account(account, name));
		owners[account] = msg.sender;
		emit AddAccount(msg.sender, account, name);
	}

	/**
	 * @dev Edits the name of the specified account.
	 * @param accountAddress The address of the account to edit.
	 * @param name The new name for the account.
	 */
	function editAccountName(address accountAddress, string memory name) external whenNotPaused {
		uint256 index = indexOfAccount[accountAddress];
		accounts[msg.sender][index].name = name;
		emit EditAccountName(msg.sender, accountAddress, name);
	}

	/**
	 * @dev Deposits funds into the specified account.
	 * @param account The address of the account to deposit funds into.
	 * @param amount The amount of funds to deposit.
	 */
	function depositForAccount(address account, uint256 amount) external onlyOwner(account, msg.sender) whenNotPaused {
		address collateral = ISymmio(symmioAddress).getCollateral();
		IERC20Upgradeable(collateral).safeTransferFrom(msg.sender, address(this), amount);
		IERC20Upgradeable(collateral).safeApprove(symmioAddress, amount);
		ISymmio(symmioAddress).depositFor(account, amount);
		emit DepositForAccount(msg.sender, account, amount);
	}

	/**
	 * @dev Deposits funds into the specified account and allocates them.
	 * @param account The address of the account to deposit and allocate funds.
	 * @param amount The amount of funds to deposit and allocate.
	 */
	function depositAndAllocateForAccount(address account, uint256 amount) external onlyOwner(account, msg.sender) whenNotPaused {
		address collateral = ISymmio(symmioAddress).getCollateral();
		IERC20Upgradeable(collateral).safeTransferFrom(msg.sender, address(this), amount);
		IERC20Upgradeable(collateral).safeApprove(symmioAddress, amount);
		ISymmio(symmioAddress).depositFor(account, amount);
		uint256 amountWith18Decimals = (amount * 1e18) / (10 ** IERC20Metadata(collateral).decimals());
		bytes memory _callData = abi.encodeWithSignature("allocate(uint256)", amountWith18Decimals);
		innerCall(account, _callData);
		emit DepositForAccount(msg.sender, account, amount);
		emit AllocateForAccount(msg.sender, account, amountWith18Decimals);
	}

	/**
	 * @dev Withdraws funds from the specified account.
	 * @param account The address of the account to withdraw funds from.
	 * @param amount The amount of funds to withdraw.
	 */
	function withdrawFromAccount(address account, uint256 amount) external onlyOwner(account, msg.sender) whenNotPaused {
		bytes memory _callData = abi.encodeWithSignature("withdrawTo(address,uint256)", owners[account], amount);
		emit WithdrawFromAccount(msg.sender, account, amount);
		innerCall(account, _callData);
	}

	function innerCall(address account, bytes memory _callData) internal {
		(bool _success, bytes memory _resultData) = ISymmioPartyA(account)._call(_callData);
		emit Call(msg.sender, account, _callData, _success, _resultData);
		if (!_success) {
			assembly {
				revert(add(_resultData, 32), mload(_resultData))
			}
		}
	}

	/**
	 * @dev Executes a series of calls on behalf of the specified account.
	 * @param account The address of the account to execute the calls on behalf of.
	 * @param _callDatas An array of call data to execute.
	 */
	function _call(address account, bytes[] memory _callDatas) public whenNotPaused {
		bool isOwner = owners[account] == msg.sender;
		for (uint8 i; i < _callDatas.length; i++) {
			bytes memory _callData = _callDatas[i];
			if (!isOwner) {
				require(_callData.length >= 4, "MultiAccount: Invalid call data");
				bytes4 functionSelector;
				assembly {
					functionSelector := mload(add(_callData, 0x20))
				}
				require(delegatedAccesses[account][msg.sender][functionSelector], "MultiAccount: Unauthorized access");
			}
			innerCall(account, _callData);
		}
	}

	//////////////////////////////// VIEWS ////////////////////////////////////

	/**
	 * @dev Returns the number of accounts belonging to the specified user.
	 * @param user The address of the user.
	 * @return The number of accounts.
	 */
	function getAccountsLength(address user) external view returns (uint256) {
		return accounts[user].length;
	}

	/**
	 * @dev Returns an array of accounts belonging to the specified user.
	 * @param user The address of the user.
	 * @param start The index to start retrieving accounts from.
	 * @param size The maximum number of accounts to retrieve.
	 * @return An array of Account structures.
	 */
	function getAccounts(address user, uint256 start, uint256 size) external view returns (Account[] memory) {
		uint256 len = size > accounts[user].length - start ? accounts[user].length - start : size;
		Account[] memory userAccounts = new Account[](len);
		for (uint256 i = start; i < start + len; i++) {
			userAccounts[i - start] = accounts[user][i];
		}
		return userAccounts;
	}

	/**
     * @notice Sets the ExternalAccountWithdrawManager contract address that can invoke function calls.
     * @param _contractAddress The address of the contract to be allowed.
     */
    function setExternalAccountWithdrawManagerAddress(address _contractAddress) external onlyRole(SETTER_ROLE) {
		emit SetExternalAccountWithdrawManagerAddress(externalAccountWithdrawManagerAddress, _contractAddress);
        externalAccountWithdrawManagerAddress = _contractAddress;
    }

	/**
     * @notice external wrapper for `_call` with withdraw authorization checks.
     * @dev Only the contract owner or the ExternalAccountWithdrawManager can execute this function.
     * @param account The address of the account to execute the calls on behalf of.
	 * @param _callDatas An array of call data to execute.
     */
    function _withdrawCall(address account, bytes[] memory _callDatas) public onlyWithdrawAuthorized {
        _call(account, _callDatas);
    }
}
