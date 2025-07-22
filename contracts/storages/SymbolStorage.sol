// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

struct Symbol {
	uint256 symbolId;
	string name;
	bool isValid;
	uint256 minAcceptableQuoteValue;
	uint256 minAcceptablePortionLF;
	uint256 tradingFee;
	uint256 maxLeverage;
	uint256 fundingRateEpochDuration;
	uint256 fundingRateWindowTime;
}

struct FundingFee {
	int256 currentLongFee; // Current epoch's fee for long positions (price-adjusted)
	int256 currentShortFee; // Current epoch's fee for short positions (price-adjusted)
	int256 accumulatedLongFee; // Weighted average fee for longs over all epochs
	int256 accumulatedShortFee; // Weighted average fee for shorts over all epochs
	uint256 epochs; // Total number of epochs tracked
	uint256 epochDuration; // Duration of each epoch in seconds
}

library SymbolStorage {
	bytes32 internal constant SYMBOL_STORAGE_SLOT = keccak256("diamond.standard.storage.symbol");

	struct Layout {
		mapping(uint256 => Symbol) symbols;
		uint256 lastId;
		mapping(uint256 => uint256) forceCloseGapRatio; // symbolId -> forceCloseGapRatio
		mapping(uint256 => mapping(address => FundingFee)) fundingFees; // SymbolId -> PartyB -> Funding Fee
	}

	function layout() internal pure returns (Layout storage l) {
		bytes32 slot = SYMBOL_STORAGE_SLOT;
		assembly {
			l.slot := slot
		}
	}
}
