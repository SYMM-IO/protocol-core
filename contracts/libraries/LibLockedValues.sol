// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../storages/QuoteStorage.sol";

struct LockedValues {
    uint256 cva;
    uint256 mm;
    uint256 lf;
}

library LockedValuesOps {
    using SafeMath for uint256;

    function add(LockedValues storage self, LockedValues memory a)
        internal
        returns (LockedValues storage)
    {
        self.cva = self.cva.add(a.cva);
        self.mm = self.mm.add(a.mm);
        self.lf = self.lf.add(a.lf);
        return self;
    }

    function addQuote(LockedValues storage self, Quote storage quote)
        internal
        returns (LockedValues storage)
    {
        return add(self, quote.lockedValues);
    }

    function sub(LockedValues storage self, LockedValues memory a)
        internal
        returns (LockedValues storage)
    {
        self.cva = self.cva.sub(a.cva);
        self.mm = self.mm.sub(a.mm);
        self.lf = self.lf.sub(a.lf);
        return self;
    }

    function subQuote(LockedValues storage self, Quote storage quote)
        internal
        returns (LockedValues storage)
    {
        return sub(self, quote.lockedValues);
    }

    function makeZero(LockedValues storage self) internal returns (LockedValues storage) {
        self.cva = 0;
        self.mm = 0;
        self.lf = 0;
        return self;
    }

    function total(LockedValues memory self) internal pure returns (uint256) {
        return self.cva + self.mm + self.lf;
    }

    function mul(LockedValues storage self, uint256 a) internal returns (LockedValues storage) {
        self.cva = self.cva.mul(a);
        self.mm = self.mm.mul(a);
        self.lf = self.lf.mul(a);
        return self;
    }

    function mulMem(LockedValues memory self, uint256 a)
        internal
        pure
        returns (LockedValues memory)
    {
        LockedValues memory lockedValues = LockedValues(
            self.cva.mul(a),
            self.mm.mul(a),
            self.lf.mul(a)
        );
        return lockedValues;
    }

    function div(LockedValues storage self, uint256 a) internal returns (LockedValues storage) {
        self.cva = self.cva.div(a);
        self.mm = self.mm.div(a);
        self.lf = self.lf.div(a);
        return self;
    }

    function divMem(LockedValues memory self, uint256 a)
        internal
        pure
        returns (LockedValues memory)
    {
        LockedValues memory lockedValues = LockedValues(
            self.cva.div(a),
            self.mm.div(a),
            self.lf.div(a)
        );
        return lockedValues;
    }
}
