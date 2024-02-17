// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "./BridgeFacetImpl.sol";
import "./IBridgeFacet.sol";

contract BridgeFacet is Accessibility, Pausable, IBridgeFacet {
    function transferToBridge(uint256 amount, address bridgeAddress) external whenNotAccountingPaused notSuspended(msg.sender) {
        BridgeFacetImpl.transferToBridge(msg.sender, amount, bridgeAddress);
        emit TransferToBridge(msg.sender, amount, bridgeAddress);
    }

    function withdrawReceivedBridgeValue(uint256 transactionId) external whenNotAccountingPaused notSuspended(msg.sender) {
        BridgeFacetImpl.withdrawReceivedBridgeValue(transactionId);
        emit WithdrawReceivedBridgeValue(transactionId);
    }

    function withdrawReceivedBridgeValues(uint256[] memory transactionIds) external whenNotAccountingPaused notSuspended(msg.sender) {
        for (uint256 i = 0; i < transactionIds.length; i++)
            BridgeFacetImpl.withdrawReceivedBridgeValue(transactionIds[i]);
        emit WithdrawReceivedBridgeValues(transactionIds);
    }
}
