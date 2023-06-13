// SPDX-License-Identifier: GPL-3.0-or-later
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
