// SPDX-License-Identifier: MIT
pragma solidity >=0.8.18;

import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/interfaces/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

interface SymmCore {
  function withdrawTo(address _to, uint256 _amount) external;
}

interface Rebalancer {
  function rebalance(address targetAddress, uint256 amount) external;
  function deregisterPartyB() external;
}

struct PartyBStorageV1 {
  bool initialized; // Whether this store was already initialised
  address owner; // Cold wallet key should be used rarely to set bots, rebalancers, restrictedSelectors
  address pendingOwner; // The proposed owner
  address symmioAddress; // Symmio diamond contract address
  mapping(address => bool) bots; // _call can only be called by bots
  mapping(bytes4 => bool) restrictedSelectors; // Bots cannot call these selectors via _call
  mapping(address => bool) rebalancers; // withdrawTo can only be called by rebalancers
}

contract HedgerPartyBV1 {
  using Address for address;
  using Address for address payable;
  using SafeERC20 for IERC20;

  event ProposeNewOwner(address indexed currentOwner, address indexed proposedOwner);
  event TransferOwnership(address indexed oldOwner, address indexed newOwner);

  event AddBot(address indexed bot);
  event RemoveBot(address indexed bot);

  event AddRestrictedSelector(bytes4 indexed selector, string signature);
  event RemoveRestrictedSelector(bytes4 indexed selector, string signature);

  event AddRebalancer(address indexed rebalancer);
  event RemoveRebalancer(address indexed rebalancer);

  function storeV1() private pure returns (PartyBStorageV1 storage store) {
    bytes32 STORE_V1_SLOT = keccak256('perps.hedger.partyB.store.v1');
    assembly {
      store.slot := STORE_V1_SLOT
    }
  }

  modifier onlyOwner() {
    require(storeV1().owner == msg.sender, 'PartyB: Only owner allowed!');
    _;
  }

  modifier onlyPendingOwner() {
    require(storeV1().pendingOwner == msg.sender, 'PartyB: Only pending owner allowed!');
    _;
  }

  modifier onlyBot() {
    require(storeV1().bots[msg.sender], 'PartyB: Only bot allowed!');
    _;
  }

  modifier onlyRebalancer() {
    require(storeV1().rebalancers[msg.sender], 'PartyB: Only rebalancer allowed!');
    _;
  }

  function initStoreV1(
    address owner,
    address symmioAddress,
    address[] calldata bots,
    string[] calldata selectors,
    address[] calldata rebalancers
  ) external {
    PartyBStorageV1 storage sv1 = storeV1();
    require(!sv1.initialized, 'PartyB: Store already initialized');

    _changeOwner(owner);
    sv1.symmioAddress = symmioAddress;

    _addBots(bots);
    _addRestrictedSelectors(selectors);
    _addRebalancers(rebalancers);

    sv1.initialized = true;
  }

  // Only bots
  function _call(bytes[] calldata _callDatas) external virtual onlyBot {
    PartyBStorageV1 storage sv1 = storeV1();

    for (uint8 i; i < _callDatas.length; i++) {
      bytes memory _callData = _callDatas[i];
      require(_callData.length >= 4, 'PartyB: Invalid call data');

      bytes4 functionSelector;
      assembly {
        functionSelector := mload(add(_callData, 0x20))
      }
      require(!sv1.restrictedSelectors[functionSelector], 'PartyB: Restricted selector for bot!');

      sv1.symmioAddress.functionCall(_callData);
    }
  }

  // Only rebalancer
  function withdrawTo(address _to, uint256 _amount) external onlyRebalancer {
    SymmCore(storeV1().symmioAddress).withdrawTo(_to, _amount);
  }

  function rebalance(address rebalancer, address targetAddress, uint256 amount) external onlyRebalancer {
    Rebalancer(rebalancer).rebalance(targetAddress, amount);
  }

  // Only owner functions
  function proposeNewOwner(address newOwner) external onlyOwner {
    PartyBStorageV1 storage sv1 = storeV1();
    sv1.pendingOwner = newOwner;
    emit ProposeNewOwner(sv1.owner, newOwner);
  }

  function acceptOwnership() external onlyPendingOwner {
    _changeOwner(msg.sender);
  }

  function addBots(address[] calldata bots) external onlyOwner {
    _addBots(bots);
  }

  function removeBots(address[] calldata bots) external onlyOwner {
    _removeBots(bots);
  }

  function addRestrictedSelectors(string[] calldata selectors) external onlyOwner {
    _addRestrictedSelectors(selectors);
  }

  function removeRestrictedSelectors(string[] calldata selectors) external onlyOwner {
    _removeRestrictedSelectors(selectors);
  }

  function addRebalancers(address[] calldata rebalancers) external onlyOwner {
    _addRebalancers(rebalancers);
  }

  function removeRebalancers(address[] calldata rebalancers) external onlyOwner {
    _removeRebalancers(rebalancers);
  }

  function deregisterFromRebalancer(address rebalancer) external onlyOwner {
    Rebalancer(rebalancer).deregisterPartyB();
  }

  function withdrawNative() external onlyOwner {
    payable(msg.sender).sendValue(address(this).balance);
  }

  function withdrawERC20(address token, uint256 amount) external onlyOwner {
    IERC20(token).safeTransfer(msg.sender, amount);
  }

  // View functions
  function isInitialized() public view returns (bool) {
    return storeV1().initialized;
  }

  function getOwner() public view returns (address) {
    return storeV1().owner;
  }

  function getPendingOwner() public view returns (address) {
    return storeV1().pendingOwner;
  }

  function getSymmioAddress() public view returns (address) {
    return storeV1().symmioAddress;
  }

  function isBotWhitelisted(address _bot) public view returns (bool) {
    return storeV1().bots[_bot];
  }

  function isSelectorSignatureRestricted(string calldata _func) public view returns (bool) {
    return isSelectorRestricted(getSelector(_func));
  }

  function isSelectorRestricted(bytes4 _selector) public view returns (bool) {
    return storeV1().restrictedSelectors[_selector];
  }

  function getSelector(string calldata _func) public pure returns (bytes4) {
    return bytes4(keccak256(bytes(_func)));
  }

  function isRebalancer(address _rebalancer) public view returns (bool) {
    return storeV1().rebalancers[_rebalancer];
  }

  // Private functions
  function _addBots(address[] calldata bots) private {
    PartyBStorageV1 storage sv1 = storeV1();
    for (uint256 i; i < bots.length; i++) {
      sv1.bots[bots[i]] = true;
      emit AddBot(bots[i]);
    }
  }

  function _changeOwner(address newOwner) private {
    PartyBStorageV1 storage sv1 = storeV1();
    emit TransferOwnership(sv1.owner, newOwner);
    sv1.owner = newOwner;
  }

  function _removeBots(address[] calldata bots) private {
    PartyBStorageV1 storage sv1 = storeV1();
    for (uint256 i; i < bots.length; i++) {
      sv1.bots[bots[i]] = false;
      emit RemoveBot(bots[i]);
    }
  }

  function _addRestrictedSelectors(string[] calldata selectors) private {
    PartyBStorageV1 storage sv1 = storeV1();
    for (uint256 i; i < selectors.length; i++) {
      bytes4 selector = getSelector(selectors[i]);
      sv1.restrictedSelectors[selector] = true;
      emit AddRestrictedSelector(selector, selectors[i]);
    }
  }

  function _removeRestrictedSelectors(string[] calldata selectors) private {
    PartyBStorageV1 storage sv1 = storeV1();
    for (uint256 i; i < selectors.length; i++) {
      bytes4 selector = getSelector(selectors[i]);
      sv1.restrictedSelectors[selector] = false;
      emit RemoveRestrictedSelector(selector, selectors[i]);
    }
  }

  function _addRebalancers(address[] calldata rebalancers) private {
    PartyBStorageV1 storage sv1 = storeV1();
    for (uint256 i; i < rebalancers.length; i++) {
      sv1.rebalancers[rebalancers[i]] = true;
      emit AddRebalancer(rebalancers[i]);
    }
  }

  function _removeRebalancers(address[] calldata rebalancers) private {
    PartyBStorageV1 storage sv1 = storeV1();
    for (uint256 i; i < rebalancers.length; i++) {
      sv1.rebalancers[rebalancers[i]] = false;
      emit RemoveRebalancer(rebalancers[i]);
    }
  }
}
