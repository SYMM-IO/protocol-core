// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../storages/QuoteStorage.sol";

library LockedValuesOps {
	using SafeMath for uint256;

	/**
	 * @notice Adds the values of two LockedValues structs.
	 * @param self The LockedValues struct to which values will be added.
	 * @param a The LockedValues struct containing values to be added.
	 * @return The updated LockedValues struct.
	 */
	function add(LockedValues storage self, LockedValues memory a) internal returns (LockedValues storage) {
		self.cva = self.cva.add(a.cva);
		self.partyAmm = self.partyAmm.add(a.partyAmm);
		self.partyBmm = self.partyBmm.add(a.partyBmm);
		self.lf = self.lf.add(a.lf);
		return self;
	}

	/**
	 * @notice Adds the locked values of a quote to a LockedValues struct.
	 * @param self The LockedValues struct to which values will be added.
	 * @param quote The Quote struct containing locked values to be added.
	 * @return The updated LockedValues struct.
	 */
	function addQuote(LockedValues storage self, Quote storage quote) internal returns (LockedValues storage) {
		return add(self, quote.lockedValues);
	}

	/**
	 * @notice Subtracts the values of two LockedValues structs.
	 * @param self The LockedValues struct from which values will be subtracted.
	 * @param a The LockedValues struct containing values to be subtracted.
	 * @return The updated LockedValues struct.
	 */
	function sub(LockedValues storage self, LockedValues memory a) internal returns (LockedValues storage) {
		self.cva = self.cva.sub(a.cva);
		self.partyAmm = self.partyAmm.sub(a.partyAmm);
		self.partyBmm = self.partyBmm.sub(a.partyBmm);
		self.lf = self.lf.sub(a.lf);
		return self;
	}

	/**
	 * @notice Subtracts the locked values of a quote from a LockedValues struct.
	 * @param self The LockedValues struct from which values will be subtracted.
	 * @param quote The Quote struct containing locked values to be subtracted.
	 * @return The updated LockedValues struct.
	 */
	function subQuote(LockedValues storage self, Quote storage quote) internal returns (LockedValues storage) {
		return sub(self, quote.lockedValues);
	}

	/**
	 * @notice Sets all values of a LockedValues struct to zero.
	 * @param self The LockedValues struct to be zeroed.
	 * @return The updated LockedValues struct.
	 */
	function makeZero(LockedValues storage self) internal returns (LockedValues storage) {
		self.cva = 0;
		self.partyAmm = 0;
		self.partyBmm = 0;
		self.lf = 0;
		return self;
	}

	/**
	 * @notice Calculates the total locked balance for Party A.
	 * @param self The LockedValues struct containing locked values.
	 * @return The total locked balance for Party A.
	 */
	function totalForPartyA(LockedValues memory self) internal pure returns (uint256) {
		return self.cva + self.partyAmm + self.lf;
	}

	/**
	 * @notice Calculates the total locked balance for Party B.
	 * @param self The LockedValues struct containing locked values.
	 * @return The total locked balance for Party B.
	 */
	function totalForPartyB(LockedValues memory self) internal pure returns (uint256) {
		return self.cva + self.partyBmm + self.lf;
	}

	/**
	 * @notice Multiplies all values of a LockedValues struct by a scalar value.
	 * @param self The LockedValues struct to be multiplied.
	 * @param a The scalar value to multiply by.
	 * @return The updated LockedValues struct.
	 */
	function mul(LockedValues storage self, uint256 a) internal returns (LockedValues storage) {
		self.cva = self.cva.mul(a);
		self.partyAmm = self.partyAmm.mul(a);
		self.partyBmm = self.partyBmm.mul(a);
		self.lf = self.lf.mul(a);
		return self;
	}

	/**
	 * @notice Multiplies all values of a LockedValues struct by a scalar value (memory version).
	 * @param self The LockedValues struct to be multiplied.
	 * @param a The scalar value to multiply by.
	 * @return The updated LockedValues struct.
	 */
	function mulMem(LockedValues memory self, uint256 a) internal pure returns (LockedValues memory) {
		LockedValues memory lockedValues = LockedValues(self.cva.mul(a), self.lf.mul(a), self.partyAmm.mul(a), self.partyBmm.mul(a));
		return lockedValues;
	}

	/**
	 * @notice Divides all values of a LockedValues struct by a scalar value.
	 * @param self The LockedValues struct to be divided.
	 * @param a The scalar value to divide by.
	 * @return The updated LockedValues struct.
	 */
	function div(LockedValues storage self, uint256 a) internal returns (LockedValues storage) {
		self.cva = self.cva.div(a);
		self.partyAmm = self.partyAmm.div(a);
		self.partyBmm = self.partyBmm.div(a);
		self.lf = self.lf.div(a);
		return self;
	}

	/**
	 * @notice Divides all values of a LockedValues struct by a scalar value (memory version).
	 * @param self The LockedValues struct to be divided.
	 * @param a The scalar value to divide by.
	 * @return The updated LockedValues struct.
	 */
	function divMem(LockedValues memory self, uint256 a) internal pure returns (LockedValues memory) {
		LockedValues memory lockedValues = LockedValues(self.cva.div(a), self.lf.div(a), self.partyAmm.div(a), self.partyBmm.div(a));
		return lockedValues;
	}
}
