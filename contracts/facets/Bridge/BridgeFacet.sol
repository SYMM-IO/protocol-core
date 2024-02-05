// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "./BridgeFacetImpl.sol";
import "./IBridgeEvents.sol";

contract BridgeFacet is Accessibility, Pausable, IBridgeEvents{
    function transferToBridge(address user, uint256 amount, address bridgeAddress) external whenNotPartyAActionsPaused {
        BridgeFacetImpl.transferToBridge(user,amount,bridgeAddress);
        emit TransferToBridge(user, amount, bridgeAddress);
    }

    function withdrawLockedTransaction(uint256 id) external {
        BridgeFacetImpl.withdrawLockedTransaction(id);
        emit WithdrawLockedTransaction(id);
    }
}
