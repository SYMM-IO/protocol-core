// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.8.18;

struct Symbol {
    uint256 symbolId;
    string name;
    bool isValid;
    uint256 minAcceptableQuoteValue;
    uint256 minAcceptablePortionLF;
    uint256 tradingFee;
}

library SymbolStorage {
    bytes32 internal constant SYMBOL_STORAGE_SLOT = keccak256("diamond.standard.storage.symbol");

    struct Layout {
        mapping(uint256 => Symbol) symbols;
        uint256 lastId;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = SYMBOL_STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
