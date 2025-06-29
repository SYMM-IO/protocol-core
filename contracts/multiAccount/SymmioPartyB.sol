// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

/**
 * @title  SymmioPartyB
 * @notice Manages Party B operations in the Symmio protocol.
 *         Enables secure execution of protocol functions, multicast operations, and sequenced
 *         calls with automatic quote ID management and injection.
 *
 * @dev    Key features include:
 *         • Role-based access control for different operation types
 *         • Function selector restrictions for sensitive operations
 *         • Multicast whitelist for external contract interactions
 *         • Sequenced call execution with quote ID injection
 *         • Reentrancy protection and pause functionality
 *         • Token approval and withdrawal management
 *
 *         Supports both direct Symmio protocol calls and external contract calls
 *         through a configurable whitelist system with granular permission controls.
 */

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "../interfaces/IMultiAccount.sol";

interface ISymmio {
	function getNextQuoteId() external view returns (uint256);
}

contract SymmioPartyB is Initializable, PausableUpgradeable, AccessControlEnumerableUpgradeable {
	/* ─────────────────────────────── Roles ─────────────────────────────── */

	/// @notice Role for trusted operations and token approvals.
	bytes32 public constant TRUSTED_ROLE = keccak256("TRUSTED_ROLE");

	/// @notice Role for managing restricted functions and multicast whitelist.
	bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

	/// @notice Role that can pause contract operations.
	bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

	/// @notice Role that can unpause contract operations.
	bytes32 public constant UNPAUSER_ROLE = keccak256("UNPAUSER_ROLE");

	/* ──────────────────────── Storage Variables ──────────────────────── */

	/// @notice Address of the main Symmio protocol contract.
	address public symmioAddress;

	/// @notice Mapping of function selectors to their restriction status.
	mapping(bytes4 => bool) public restrictedSelectors;

	/// @notice Whitelist of external contracts allowed for multicast calls.
	mapping(address => bool) public multicastWhitelist;

	/// @notice Mapping of function selectors to their quote ID injection offsets.
	mapping(bytes4 => uint256) public selectorsQuoteOffset;

	/// @notice Counter for reentrancy protection.
	uint256 private _guardCounter;

	/* ─────────────────────────────── Events ─────────────────────────────── */

	/// @notice Emitted when the Symmio protocol address is updated.
	event SetSymmioAddress(address oldSymmioAddress, address newSymmioAddress);

	/// @notice Emitted when a function selector's restriction status is changed.
	event SetRestrictedSelector(bytes4 selector, bool state);

	/// @notice Emitted when an address is added/removed from multicast whitelist.
	event SetMulticastWhitelist(address addr, bool state);

	/// @notice Emitted when a selector's quote ID offset is configured.
	event SetSelectorQuoteOffset(bytes4 selector, uint256 offset);

	/* ─────────────────────────────── Structs ─────────────────────────────── */

	/**
	 * @notice Configuration for sequenced calls with quote ID management.
	 * @param destAddress    Target contract address for the call.
	 * @param callData       Encoded function call data.
	 * @param needsQuoteId   Whether this call requires quote ID injection.
	 * @param createsQuote   Whether this call generates a new quote ID.
	 */
	struct SequencedCallConfig {
		address destAddress;
		bytes callData;
		bool needsQuoteId;
		bool createsQuote;
	}

	/* ─────────────────────────── Initialization ─────────────────────────── */

	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		_disableInitializers();
	}

	/**
	 * @notice Initialize the upgradeable proxy.
	 * @param admin           Address receiving all admin roles.
	 * @param symmioAddress_  Address of the Symmio protocol contract.
	 */
	function initialize(address admin, address symmioAddress_) public initializer {
		__Pausable_init();
		__AccessControl_init();

		_grantRole(DEFAULT_ADMIN_ROLE, admin);
		_grantRole(TRUSTED_ROLE, admin);
		_grantRole(MANAGER_ROLE, admin);
		symmioAddress = symmioAddress_;
	}

	/* ───────────────────────── Configuration Functions ───────────────────────── */

	/**
	 * @notice Batch configure quote ID injection offsets for function selectors.
	 * @param selectors Array of function selectors to configure.
	 * @param offsets   Array of corresponding byte offsets for quote ID injection.
	 */
	function setSelectorsQuoteOffsets(bytes4[] calldata selectors, uint256[] calldata offsets) external onlyRole(DEFAULT_ADMIN_ROLE) {
		require(selectors.length == offsets.length, "SymmioPartyB: Array length mismatch");
		for (uint256 i = 0; i < selectors.length; i++) {
			selectorsQuoteOffset[selectors[i]] = offsets[i];
			emit SetSelectorQuoteOffset(selectors[i], offsets[i]);
		}
	}

	/**
	 * @notice Update the Symmio protocol contract address.
	 * @param addr New Symmio protocol address.
	 */
	function setSymmioAddress(address addr) external onlyRole(DEFAULT_ADMIN_ROLE) {
		emit SetSymmioAddress(symmioAddress, addr);
		symmioAddress = addr;
	}

	/**
	 * @notice Configure function selector access restrictions.
	 * @param selector Function selector to modify.
	 * @param state    True to restrict to MANAGER_ROLE only, false for normal access.
	 */
	function setRestrictedSelector(bytes4 selector, bool state) external onlyRole(DEFAULT_ADMIN_ROLE) {
		restrictedSelectors[selector] = state;
		emit SetRestrictedSelector(selector, state);
	}

	/**
	 * @notice Manage the multicast whitelist for external contract calls.
	 * @param addr  Contract address to modify.
	 * @param state True to whitelist, false to remove from whitelist.
	 */
	function setMulticastWhitelist(address addr, bool state) external onlyRole(MANAGER_ROLE) {
		require(addr != address(this), "SymmioPartyB: Invalid address");
		multicastWhitelist[addr] = state;
		emit SetMulticastWhitelist(addr, state);
	}

	/**
	 * @notice Approve token spending by the Symmio protocol.
	 * @param token  ERC20 token address to approve.
	 * @param amount Approval amount.
	 */
	function _approve(address token, uint256 amount) external onlyRole(TRUSTED_ROLE) whenNotPaused {
		require(IERC20Upgradeable(token).approve(symmioAddress, amount), "SymmioPartyB: Not approved");
	}

	/* ────────────────────── Core Call Execution ────────────────────── */

	/**
	 * @notice Execute multiple calls to the Symmio protocol.
	 * @param _callDatas Array of encoded function call data.
	 */
	function _call(bytes[] calldata _callDatas) external whenNotPaused nonReentrant {
		for (uint8 i; i < _callDatas.length; i++) _executeCall(symmioAddress, _callDatas[i]);
	}

	/**
	 * @notice Execute multiple calls to different whitelisted contracts.
	 * @param destAddresses Array of target contract addresses.
	 * @param _callDatas    Array of encoded function call data.
	 */
	function _multicastCall(address[] calldata destAddresses, bytes[] calldata _callDatas) external whenNotPaused nonReentrant {
		require(destAddresses.length == _callDatas.length, "SymmioPartyB: Array length mismatch");
		for (uint8 i; i < _callDatas.length; i++) _executeCall(destAddresses[i], _callDatas[i]);
	}

	/**
	 * @notice Execute calls in sequence with automatic quote ID injection.
	 * @param _configs Array of call configurations specifying execution order and quote handling.
	 *
	 * @dev Calls marked with `createsQuote` will generate a new quote ID that can be
	 *      injected into subsequent calls marked with `needsQuoteId`.
	 */
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
					quoteId = ISymmio(symmioAddress).getNextQuoteId();
					hasQuoteId = true;
				}
			}
		}
	}

	/* ───────────────────────── Internal Helpers ───────────────────────── */

	/**
	 * @dev Execute a single contract call with comprehensive security checks.
	 * @param destAddress Target contract address.
	 * @param callData    Encoded function call data.
	 */
	function _executeCall(address destAddress, bytes memory callData) internal {
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

	/**
	 * @dev Extract function selector and quote ID offset from call data.
	 * @param callData Function call data to analyze.
	 * @return selector Function selector.
	 * @return offset   Byte offset for quote ID injection.
	 */
	function _getCallSelectorAndOffset(bytes memory callData) internal view returns (bytes4 selector, uint256 offset) {
		require(callData.length >= 4, "SymmioPartyB: Invalid call data");

		assembly {
			selector := mload(add(callData, 32))
		}
		if (selector == IMultiAccount._call.selector) {
			require(callData.length >= 68, "SymmioPartyB: Invalid MultiAccount call data");
			uint256 multiAccountCallsLength;
			uint256 callsOffset;
			assembly {
				// Read the pointer to the dynamic array:
				callsOffset := mload(add(callData, 68)) // 4 for selector and 32 for the address parameter of _call and again 32 to go end of cell
				// Read the length of the bytes[] array:
				multiAccountCallsLength := mload(add(callData, add(36, callsOffset))) // 4 for the selector and 32 for going to end of offset
			}
			require(multiAccountCallsLength == 1, "SymmioPartyB: Must contain exactly one sub-call");

			bytes memory innerCallData;
			uint256 firstElemOffset;
			assembly {
				firstElemOffset := mload(add(callData, add(68, callsOffset)))
				innerCallData := add(callData, add(132, firstElemOffset))
				selector := mload(add(innerCallData, 32))
			}
		}
		offset = selectorsQuoteOffset[selector];
		require(offset != 0, "SymmioPartyB: Offset not set for selector");
	}

	/**
	 * @dev Inject quote ID into call data at the specified offset.
	 * @param originalCall Original function call data.
	 * @param quoteId      Quote ID to inject.
	 * @param offset       Byte offset for injection.
	 * @return Modified call data with injected quote ID.
	 */
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

	/* ────────────────────────── Admin Functions ────────────────────────── */

	/**
	 * @notice Withdraw ERC20 tokens from the contract.
	 * @param token  ERC20 token address to withdraw.
	 * @param amount Amount of tokens to withdraw.
	 */
	function withdrawERC20(address token, uint256 amount) external onlyRole(MANAGER_ROLE) {
		require(IERC20Upgradeable(token).transfer(msg.sender, amount), "SymmioPartyB: Not transferred");
	}

	/// @notice Pause all contract operations except view functions.
	function pause() external onlyRole(PAUSER_ROLE) {
		_pause();
	}

	/// @notice Resume all contract operations.
	function unpause() external onlyRole(UNPAUSER_ROLE) {
		_unpause();
	}

	/* ─────────────────────────────── Modifiers ─────────────────────────────── */

	/// @notice Prevents reentrancy attacks using a simple counter-based guard.
	modifier nonReentrant() {
		require(_guardCounter == 0, "SymmioPartyB: reentrant call");
		_guardCounter = 1;
		_;
		_guardCounter = 0;
	}
}
