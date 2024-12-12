// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "../interfaces/IMultiAccount.sol";

interface ISymmio {
	function getNextQuoteId() external view returns (uint256);
}

/// @title SymmioPartyB Contract
/// @notice Manages Party B operations in the Symmio protocol with role-based access control
/// @dev Implements upgradeable contracts with reentrancy protection
contract SymmioPartyB is Initializable, PausableUpgradeable, AccessControlEnumerableUpgradeable {
	// Role definitions
	bytes32 public constant TRUSTED_ROLE = keccak256("TRUSTED_ROLE");
	bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
	bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
	bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

	// Contract state variables
	address public symmioAddress;
	mapping(bytes4 => bool) public restrictedSelectors;
	mapping(address => bool) public multicastWhitelist;
	mapping(bytes4 => uint256) public selectorsQuoteOffset;
	uint256 private _guardCounter;

	// Events
	event SetSymmioAddress(address oldSymmioAddress, address newSymmioAddress);
	event SetRestrictedSelector(bytes4 selector, bool state);
	event SetMulticastWhitelist(address addr, bool state);
	event SetSelectorQuoteOffset(bytes4 selector, uint256 offset);

	/// @notice Configuration for sequenced calls
	/// @param destAddress Target contract address
	/// @param callData Function call data
	/// @param needsQuoteId Indicates if the call requires quote ID injection
	/// @param createsQuote Indicates if the call generates a new quote
	struct SequencedCallConfig {
		address destAddress;
		bytes callData;
		bool needsQuoteId;
		bool createsQuote;
	}

	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		_disableInitializers();
	}

	/// @dev Prevents reentrancy attacks
	modifier nonReentrant() {
		require(_guardCounter == 0, "SymmioPartyB: reentrant call");
		_guardCounter = 1;
		_;
		_guardCounter = 0;
	}

	/// @notice Initializes the contract
	/// @param admin Address receiving admin privileges
	/// @param symmioAddress_ Address of the Symmio protocol contract
	function initialize(address admin, address symmioAddress_) public initializer {
		__Pausable_init();
		__AccessControl_init();

		_grantRole(DEFAULT_ADMIN_ROLE, admin);
		_grantRole(TRUSTED_ROLE, admin);
		_grantRole(MANAGER_ROLE, admin);
		symmioAddress = symmioAddress_;
	}

	/// @notice Batch sets function selector offsets
	/// @param selectors Array of function selectors
	/// @param offsets Array of corresponding offset values
	function setSelectorsQuoteOffsets(bytes4[] calldata selectors, uint256[] calldata offsets) external onlyRole(DEFAULT_ADMIN_ROLE) {
		require(selectors.length == offsets.length, "SymmioPartyB: Array length mismatch");
		for (uint256 i = 0; i < selectors.length; i++) {
			selectorsQuoteOffset[selectors[i]] = offsets[i];
			emit SetSelectorQuoteOffset(selectors[i], offsets[i]);
		}
	}

	/// @notice Updates the Symmio protocol address
	/// @param addr New protocol address
	function setSymmioAddress(address addr) external onlyRole(DEFAULT_ADMIN_ROLE) {
		emit SetSymmioAddress(symmioAddress, addr);
		symmioAddress = addr;
	}

	/// @notice Sets selector restrictions
	/// @param selector Function selector to modify
	/// @param state New restriction state
	function setRestrictedSelector(bytes4 selector, bool state) external onlyRole(DEFAULT_ADMIN_ROLE) {
		restrictedSelectors[selector] = state;
		emit SetRestrictedSelector(selector, state);
	}

	/// @notice Manages multicast whitelist
	/// @param addr Contract address to modify
	/// @param state New whitelist state
	function setMulticastWhitelist(address addr, bool state) external onlyRole(MANAGER_ROLE) {
		require(addr != address(this), "SymmioPartyB: Invalid address");
		multicastWhitelist[addr] = state;
		emit SetMulticastWhitelist(addr, state);
	}

	/// @notice Approves token spending by Symmio protocol
	/// @param token ERC20 token address
	/// @param amount Approval amount
	function _approve(address token, uint256 amount) external onlyRole(TRUSTED_ROLE) whenNotPaused {
		require(IERC20Upgradeable(token).approve(symmioAddress, amount), "SymmioPartyB: Not approved");
	}

	/// @dev Executes a single contract call with security checks
	/// @param destAddress Target contract address
	/// @param callData Function call data
	function _executeCall(address destAddress, bytes memory callData) internal nonReentrant {
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

		(bool _success, bytes memory _resultData) = destAddress.call{ value: 0 }(callData);
		if (!_success) {
			assembly {
				revert(add(_resultData, 32), mload(_resultData))
			}
		}
	}

	/// @notice Executes multiple calls to Symmio protocol
	/// @param _callDatas Array of function call data
	function _call(bytes[] calldata _callDatas) external whenNotPaused {
		for (uint8 i; i < _callDatas.length; i++) _executeCall(symmioAddress, _callDatas[i]);
	}

	/// @notice Executes multiple calls to different contracts
	/// @param destAddresses Array of target addresses
	/// @param _callDatas Array of function call data
	function _multicastCall(address[] calldata destAddresses, bytes[] calldata _callDatas) external whenNotPaused {
		require(destAddresses.length == _callDatas.length, "SymmioPartyB: Array length mismatch");
		for (uint8 i; i < _callDatas.length; i++) _executeCall(destAddresses[i], _callDatas[i]);
	}

	/// @dev Extracts selector and offset from call data
	/// @param callData Function call data to analyze
	/// @return selector Function selector
	/// @return offset Corresponding quote offset
	function _getCallSelectorAndOffset(bytes memory callData) internal view returns (bytes4 selector, uint256 offset) {
		require(callData.length >= 4, "SymmioPartyB: Invalid call data");

		assembly {
			selector := mload(add(callData, 0x20))
		}

		if (selector == IMultiAccount._call.selector) {
			require(callData.length >= 68, "SymmioPartyB: Invalid MultiAccount call data");

			bytes memory innerCallData;
			assembly {
				let bytesOffset := mload(add(callData, 36))
				innerCallData := add(callData, add(36, bytesOffset))
				selector := mload(add(innerCallData, 0x20))
			}
		}

		offset = selectorsQuoteOffset[selector];
		require(offset != 0, "SymmioPartyB: Offset not set for selector");
	}

	/// @notice Executes calls in sequence with quote ID management
	/// @param _configs Array of call configurations
	function sequencedCall(SequencedCallConfig[] calldata _configs) external whenNotPaused nonReentrant {
		require(_configs.length > 0, "SymmioPartyB: Empty calls");

		uint256 quoteId;
		bool hasQuoteId;

		for (uint256 i = 0; i < _configs.length; i++) {
			SequencedCallConfig memory config = _configs[i];

			if (config.needsQuoteId) {
				require(hasQuoteId, "SymmioPartyB: QuoteId not yet available");
				(, uint256 offset) = _getCallSelectorAndOffset(config.callData);
				bytes memory modifiedCallData = _injectQuoteId(config.callData, quoteId, offset);
				_executeCall(config.destAddress, modifiedCallData);
			} else {
				_executeCall(config.destAddress, config.callData);
				if (config.createsQuote) {
					quoteId = ISymmio(symmioAddress).getNextQuoteId() - 1;
					hasQuoteId = true;
				}
			}
		}
	}

	/// @dev Injects quote ID into call data
	/// @param originalCall Original function call data
	/// @param quoteId Quote ID to inject
	/// @param offset Injection position offset
	/// @return Modified call data with injected quote ID
	function _injectQuoteId(bytes memory originalCall, uint256 quoteId, uint256 offset) internal pure returns (bytes memory) {
		require(offset + 32 <= originalCall.length, "SymmioPartyB: Invalid offset");

		bytes memory modifiedCall = bytes(originalCall);
		bytes32 quoteIdBytes = bytes32(quoteId);

		assembly {
			let pos := add(add(modifiedCall, 32), offset)
			mstore(pos, quoteIdBytes)
		}

		return modifiedCall;
	}

	/// @notice Withdraws ERC20 tokens from the contract
	/// @param token ERC20 token address
	/// @param amount Amount to withdraw
	function withdrawERC20(address token, uint256 amount) external onlyRole(MANAGER_ROLE) {
		require(IERC20Upgradeable(token).transfer(msg.sender, amount), "SymmioPartyB: Not transferred");
	}

	/// @notice Pauses contract operations
	function pause() external onlyRole(PAUSER_ROLE) {
		_pause();
	}

	/// @notice Resumes contract operations
	function unpause() external onlyRole(UNPAUSER_ROLE) {
		_unpause();
	}
}
