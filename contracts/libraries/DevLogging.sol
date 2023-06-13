// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

library DevLogging {
    event LogUint(uint256 value);
    event LogInt(int256 value);
    event LogAddress(address value);
    event LogString(string value);
}

interface DevLoggingInterface {
    event LogUint(uint256 value);
    event LogInt(int256 value);
    event LogAddress(address value);
    event LogString(string value);
}
