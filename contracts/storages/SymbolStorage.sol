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

/**
 * @notice Tracks funding rates and their weighted averages over time
 * @dev Funding rates are stored as price-adjusted values (rate * marketPrice)
 *      to avoid repeated multiplication during fee calculations
 */
struct FundingFee {
	// Current epoch's funding rates (price-adjusted: rate * marketPrice / 1e18)
	int256 currentLongRate; // Current rate for long positions
	int256 currentShortRate; // Current rate for short positions
	// Weighted average rates over all tracked epochs
	int256 accumulatedLongRate; // Historical weighted average for longs
	int256 accumulatedShortRate; // Historical weighted average for shorts
	// Epoch tracking
	uint256 lastUpdatedEpoch; // Epoch number when rates were last updated
	uint256 startEpoch; // Epoch when funding tracking started
	uint256 epochDuration; // Duration of each funding period in seconds
}

library SymbolStorage {
	bytes32 internal constant SYMBOL_STORAGE_SLOT = keccak256("diamond.standard.storage.symbol");

	struct Layout {
		mapping(uint256 => Symbol) symbols;
		uint256 lastId;
		mapping(uint256 => uint256) forceCloseGapRatio; // symbolId -> forceCloseGapRatio
		mapping(uint256 => mapping(address => FundingFee)) fundingFees; // SymbolId -> PartyB Address -> Funding Fee
		mapping(uint256 => uint256) symbolTypes;
	}

	function layout() internal pure returns (Layout storage l) {
		bytes32 slot = SYMBOL_STORAGE_SLOT;
		assembly {
			l.slot := slot
		}
	}
}
