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
    function transferToBridge(address partyA, uint256 amount, address bridgeAddress) external whenNotPartyAActionsPaused {
        BridgeFacetImpl.transferToBridge(partyA,amount,bridgeAddress);
        emit TransferToBridge(partyA, amount, bridgeAddress);
    }

    function withdrawLockedTransaction(uint256 id) external {
        BridgeFacetImpl.withdrawLockedTransaction(id);
        emit WithdrawLockedTransaction(id);
    }
}
