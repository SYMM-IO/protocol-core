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

    function withdrawLockedTransaction(uint256 id) external whenNotAccountingPaused notSuspended(msg.sender) {
        BridgeFacetImpl.withdrawLockedTransaction(id);
        emit WithdrawLockedTransaction(id);
    }

    function withdrawLockedTransactions(uint256[] memory ids) external whenNotAccountingPaused notSuspended(msg.sender) {
        uint256 len = ids.length;
        for (uint256 i = len; i > 0; i--) {  
            BridgeFacetImpl.withdrawLockedTransaction(ids[i - 1]);
        }
            emit WithdrawLockedTransactions(ids);
    }
}
