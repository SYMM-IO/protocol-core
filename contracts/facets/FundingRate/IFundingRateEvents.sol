// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

interface IFundingRateEvents {
	event ChargeFundingRate(address partyB, address partyA, uint256[] quoteIds, int256[] rates);
	event SetLongFundingFee(uint256[] symbolIds, int256[] fees, int256[] marketPrices, address partyB);
	event SetShortFundingFee(uint256[] symbolIds, int256[] fees, int256[] marketPrices, address partyB);
	event SetEpochDuration(uint256[] symbolIds, uint256[] durations, address partyB);
	event ChargeAccumulatedFundingFee(address partyA, address partyB, uint256[] quoteIds, address sender);
}
