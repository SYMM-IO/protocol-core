// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockSymmio {
    address public collateral;
    mapping(address => uint256) public balances;

    function setCollateral(address _collateral) external {
        collateral = _collateral;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        IERC20(collateral).transfer(msg.sender, amount);
    }

    function getCollateral() external view returns (address) {
        return collateral;
    }

    // Function to simulate depositing collateral
    function depositFor(uint256 amount, address user) external {
        IERC20(collateral).transferFrom(msg.sender, address(this), amount);
        balances[user] += amount;
    }
}