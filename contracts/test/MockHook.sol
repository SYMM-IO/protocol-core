// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import { ISymmioHook } from "../interfaces/ISymmioHook.sol";

contract MockHook is ISymmioHook {
    struct CallData {
        uint256 quoteId;
        uint256 amount;
        uint256 price;
        address partyA;
        address partyB;
    }

    // Last captured inputs
    CallData private _lastOpenCall;
    CallData private _lastCloseCall;

    // Call counters
    uint256 public openCallCount;
    uint256 public closeCallCount;

    // Configurable behavior
    bool public shouldRevertOnOpen;
    bool public shouldRevertOnClose;
    string public revertMessageOnOpen;
    string public revertMessageOnClose;

    event OnOpenPosition(uint256 quoteId, uint256 amount, uint256 price, address partyA, address partyB);
    event OnClosePosition(uint256 quoteId, uint256 amount, uint256 price, address partyA, address partyB);

    function setRevertOnOpen(bool shouldRevert, string memory message) external {
        shouldRevertOnOpen = shouldRevert;
        revertMessageOnOpen = message;
    }

    function setRevertOnClose(bool shouldRevert, string memory message) external {
        shouldRevertOnClose = shouldRevert;
        revertMessageOnClose = message;
    }

    function onOpenPosition(
        uint256 quoteId,
        uint256 filledAmount,
        uint256 openedPrice,
        address partyA,
        address partyB
    ) external override {
        if (shouldRevertOnOpen) {
            string memory msg_ = bytes(revertMessageOnOpen).length > 0 ? revertMessageOnOpen : "MockHook: revert on open";
            revert(msg_);
        }
        openCallCount += 1;
        _lastOpenCall = CallData({
            quoteId: quoteId,
            amount: filledAmount,
            price: openedPrice,
            partyA: partyA,
            partyB: partyB
        });
        emit OnOpenPosition(quoteId, filledAmount, openedPrice, partyA, partyB);
    }

    function onClosePosition(
        uint256 quoteId,
        uint256 filledAmount,
        uint256 closedPrice,
        address partyA,
        address partyB
    ) external override {
        if (shouldRevertOnClose) {
            string memory msg_ = bytes(revertMessageOnClose).length > 0 ? revertMessageOnClose : "MockHook: revert on close";
            revert(msg_);
        }
        closeCallCount += 1;
        _lastCloseCall = CallData({
            quoteId: quoteId,
            amount: filledAmount,
            price: closedPrice,
            partyA: partyA,
            partyB: partyB
        });
        emit OnClosePosition(quoteId, filledAmount, closedPrice, partyA, partyB);
    }

    // Getters for test assertions
    function getLastOpenCall() external view returns (
        uint256 quoteId,
        uint256 amount,
        uint256 price,
        address partyA,
        address partyB,
        uint256 callCount
    ) {
        CallData memory c = _lastOpenCall;
        return (c.quoteId, c.amount, c.price, c.partyA, c.partyB, openCallCount);
    }

    function getLastCloseCall() external view returns (
        uint256 quoteId,
        uint256 amount,
        uint256 price,
        address partyA,
        address partyB,
        uint256 callCount
    ) {
        CallData memory c = _lastCloseCall;
        return (c.quoteId, c.amount, c.price, c.partyA, c.partyB, closeCallCount);
    }
}

