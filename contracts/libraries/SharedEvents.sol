// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

library SharedEvents {

    enum BalanceChangeType {
        ALLOCATE,
        DEALLOCATE,
        PLATFORM_FEE_IN,
        PLATFORM_FEE_OUT,
        REALIZED_PNL_IN,
        REALIZED_PNL_OUT,
        CVA_IN,
        CVA_OUT,
        LF_IN,
        LF_OUT,
        FUNDING_FEE_IN,
        FUNDING_FEE_OUT
    }

    event BalanceChangePartyA(address indexed partyA, uint256 amount, BalanceChangeType _type);

    event BalanceChangePartyB(address indexed partyB, address indexed partyA, uint256 amount, BalanceChangeType _type);
}
