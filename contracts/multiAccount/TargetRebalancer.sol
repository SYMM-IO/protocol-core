// SPDX-License-Identifier: MIT
pragma solidity >=0.8.18;

import '@openzeppelin/contracts/access/Ownable2Step.sol';

interface SymmCore {
  function setDeallocateCooldown(uint256 deallocateCooldown) external;
  function coolDownsOfMA() external view returns (uint256 deallocateCooldown, uint256, uint256, uint256);
}

interface PartyB {
  function withdrawTo(address _to, uint256 _amount) external;
}

contract TargetRebalancer is Ownable2Step {
  SymmCore immutable symmio;

  event RegisterPartyB(address indexed partyB, address indexed withdrawalAddress);
  event DeregisterPartyB(address indexed partyB, address indexed withdrawalAddress);

  mapping(address => address) public partyBToWithdrawalAddress;
  address[] public partyBs;

  constructor(address symmioAddress) Ownable2Step() {
    symmio = SymmCore(symmioAddress);
  }

  function registerPartyB(address partyB, address withdrawalAddress) external onlyOwner {
    require(partyBToWithdrawalAddress[partyB] == address(0), 'PartyB already registered!');
    partyBToWithdrawalAddress[partyB] = withdrawalAddress;
    emit RegisterPartyB(partyB, withdrawalAddress);
  }

  function rebalance(address targetAddress, uint256 amount) external {
    require(
      targetAddress == partyBToWithdrawalAddress[msg.sender],
      'TargetRebalancer: PartyB not registered with this withdrawal address!'
    );
    (uint256 currentCooldown, , , ) = symmio.coolDownsOfMA();
    symmio.setDeallocateCooldown(0);
    PartyB(msg.sender).withdrawTo(targetAddress, amount);
    symmio.setDeallocateCooldown(currentCooldown);
  }

  function deregisterPartyB() external {
    require(partyBToWithdrawalAddress[msg.sender] != address(0), 'PartyB not registered!');
    emit DeregisterPartyB(msg.sender, partyBToWithdrawalAddress[msg.sender]);
    delete partyBToWithdrawalAddress[msg.sender];
  }
}
