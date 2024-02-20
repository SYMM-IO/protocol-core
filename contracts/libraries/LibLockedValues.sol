// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../storages/QuoteStorage.sol";

struct LockedValues {
	uint256 cva;
	uint256 lf;
	uint256 partyAmm;
	uint256 partyBmm;
}

library LockedValuesOps {
	using SafeMath for uint256;

	function add(LockedValues storage self, LockedValues memory a) internal returns (LockedValues storage) {
		self.cva = self.cva.add(a.cva);
		self.partyAmm = self.partyAmm.add(a.partyAmm);
		self.partyBmm = self.partyBmm.add(a.partyBmm);
		self.lf = self.lf.add(a.lf);
		return self;
	}

	function addQuote(LockedValues storage self, Quote storage quote) internal returns (LockedValues storage) {
		return add(self, quote.lockedValues);
	}

	function sub(LockedValues storage self, LockedValues memory a) internal returns (LockedValues storage) {
		self.cva = self.cva.sub(a.cva);
		self.partyAmm = self.partyAmm.sub(a.partyAmm);
		self.partyBmm = self.partyBmm.sub(a.partyBmm);
		self.lf = self.lf.sub(a.lf);
		return self;
	}

	function subQuote(LockedValues storage self, Quote storage quote) internal returns (LockedValues storage) {
		return sub(self, quote.lockedValues);
	}

	function makeZero(LockedValues storage self) internal returns (LockedValues storage) {
		self.cva = 0;
		self.partyAmm = 0;
		self.partyBmm = 0;
		self.lf = 0;
		return self;
	}

	function totalForPartyA(LockedValues memory self) internal pure returns (uint256) {
		return self.cva + self.partyAmm + self.lf;
	}

	function totalForPartyB(LockedValues memory self) internal pure returns (uint256) {
		return self.cva + self.partyBmm + self.lf;
	}

	function mul(LockedValues storage self, uint256 a) internal returns (LockedValues storage) {
		self.cva = self.cva.mul(a);
		self.partyAmm = self.partyAmm.mul(a);
		self.partyBmm = self.partyBmm.mul(a);
		self.lf = self.lf.mul(a);
		return self;
	}

	function mulMem(LockedValues memory self, uint256 a) internal pure returns (LockedValues memory) {
		LockedValues memory lockedValues = LockedValues(self.cva.mul(a), self.lf.mul(a), self.partyAmm.mul(a), self.partyBmm.mul(a));
		return lockedValues;
	}

	function div(LockedValues storage self, uint256 a) internal returns (LockedValues storage) {
		self.cva = self.cva.div(a);
		self.partyAmm = self.partyAmm.div(a);
		self.partyBmm = self.partyBmm.div(a);
		self.lf = self.lf.div(a);
		return self;
	}

	function divMem(LockedValues memory self, uint256 a) internal pure returns (LockedValues memory) {
		LockedValues memory lockedValues = LockedValues(self.cva.div(a), self.lf.div(a), self.partyAmm.div(a), self.partyBmm.div(a));
		return lockedValues;
	}
}
