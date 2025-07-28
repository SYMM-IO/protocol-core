// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../interfaces/IExternalTransferTarget.sol";

/**
 * @title MockExternalTransferTarget
 * @notice Mock contract for testing external transfer functionality
 */
contract MockExternalTransferTarget is IExternalTransferTarget {
    struct TransferData {
        address collateral;
        address sender;
        address receiver;
        uint256 amount;
    }

    TransferData public lastTransfer;
    TransferData[] public allTransfers;
    bool public shouldRevert;
    string public revertMessage;

    event TransferReceived(address collateral, address sender, address receiver, uint256 amount);

    /**
     * @notice Called when an external transfer is initiated from symmio to target
     * @param collateral The collateral token being transferred
     * @param sender The address initiating the transfer
     * @param receiver The address receiving the transfer
     * @param amount The amount of collateral being transferred
     */
    function onTransfer(address collateral, address sender, address receiver, uint256 amount) external override {
        if (shouldRevert) {
            revert(revertMessage);
        }

        lastTransfer = TransferData({
            collateral: collateral,
            sender: sender,
            receiver: receiver,
            amount: amount
        });

        allTransfers.push(lastTransfer);

        emit TransferReceived(collateral, sender, receiver, amount);
    }

    /**
     * @notice Get the total number of transfers received
     */
    function getTransferCount() external view returns (uint256) {
        return allTransfers.length;
    }

    /**
     * @notice Get transfer data by index
     */
    function getTransfer(uint256 index) external view returns (TransferData memory) {
        require(index < allTransfers.length, "MockExternalTransferTarget: Index out of bounds");
        return allTransfers[index];
    }

    /**
     * @notice Set whether the contract should revert on transfers
     */
    function setShouldRevert(bool _shouldRevert, string memory _revertMessage) external {
        shouldRevert = _shouldRevert;
        revertMessage = _revertMessage;
    }

    /**
     * @notice Reset the contract state
     */
    function reset() external {
        delete lastTransfer;
        delete allTransfers;
        shouldRevert = false;
        revertMessage = "";
    }
}
