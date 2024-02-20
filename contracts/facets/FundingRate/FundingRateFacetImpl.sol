// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/LibMuon.sol";
import "../../libraries/LibAccount.sol";
import "../../libraries/LibQuote.sol";
import "../../storages/QuoteStorage.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/SymbolStorage.sol";

library FundingRateFacetImpl {
	function chargeFundingRate(address partyA, uint256[] memory quoteIds, int256[] memory rates, PairUpnlSig memory upnlSig) internal {
		LibMuon.verifyPairUpnl(upnlSig, msg.sender, partyA);
		require(quoteIds.length == rates.length && quoteIds.length > 0, "PartyBFacet: Length not match");
		int256 partyBAvailableBalance = LibAccount.partyBAvailableBalanceForLiquidation(upnlSig.upnlPartyB, msg.sender, partyA);
		int256 partyAAvailableBalance = LibAccount.partyAAvailableBalanceForLiquidation(upnlSig.upnlPartyA, partyA);
		uint256 epochDuration;
		uint256 windowTime;
		for (uint256 i = 0; i < quoteIds.length; i++) {
			Quote storage quote = QuoteStorage.layout().quotes[quoteIds[i]];
			require(quote.partyA == partyA, "PartyBFacet: Invalid quote");
			require(quote.partyB == msg.sender, "PartyBFacet: Sender isn't partyB of quote");
			require(
				quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
				"PartyBFacet: Invalid state"
			);
			epochDuration = SymbolStorage.layout().symbols[quote.symbolId].fundingRateEpochDuration;
			require(epochDuration > 0, "PartyBFacet: Zero funding epoch duration");
			windowTime = SymbolStorage.layout().symbols[quote.symbolId].fundingRateWindowTime;
			uint256 latestEpochTimestamp = (block.timestamp / epochDuration) * epochDuration;
			uint256 paidTimestamp;
			if (block.timestamp <= latestEpochTimestamp + windowTime) {
				require(latestEpochTimestamp > quote.lastFundingPaymentTimestamp, "PartyBFacet: Funding already paid for this window");
				paidTimestamp = latestEpochTimestamp;
			} else {
				uint256 nextEpochTimestamp = latestEpochTimestamp + epochDuration;
				require(block.timestamp >= nextEpochTimestamp - windowTime, "PartyBFacet: Current timestamp is out of window");
				require(nextEpochTimestamp > quote.lastFundingPaymentTimestamp, "PartyBFacet: Funding already paid for this window");
				paidTimestamp = nextEpochTimestamp;
			}
			if (rates[i] >= 0) {
				require(uint256(rates[i]) <= quote.maxFundingRate, "PartyBFacet: High funding rate");
				uint256 priceDiff = (quote.openedPrice * uint256(rates[i])) / 1e18;
				if (quote.positionType == PositionType.LONG) {
					quote.openedPrice += priceDiff;
				} else {
					quote.openedPrice -= priceDiff;
				}
				partyAAvailableBalance -= int256((LibQuote.quoteOpenAmount(quote) * priceDiff) / 1e18);
				partyBAvailableBalance += int256((LibQuote.quoteOpenAmount(quote) * priceDiff) / 1e18);
			} else {
				require(uint256(-rates[i]) <= quote.maxFundingRate, "PartyBFacet: High funding rate");
				uint256 priceDiff = (quote.openedPrice * uint256(-rates[i])) / 1e18;
				if (quote.positionType == PositionType.LONG) {
					quote.openedPrice -= priceDiff;
				} else {
					quote.openedPrice += priceDiff;
				}
				partyAAvailableBalance += int256((LibQuote.quoteOpenAmount(quote) * priceDiff) / 1e18);
				partyBAvailableBalance -= int256((LibQuote.quoteOpenAmount(quote) * priceDiff) / 1e18);
			}
			quote.lastFundingPaymentTimestamp = paidTimestamp;
		}
		require(partyAAvailableBalance >= 0, "PartyBFacet: PartyA will be insolvent");
		require(partyBAvailableBalance >= 0, "PartyBFacet: PartyB will be insolvent");
		AccountStorage.layout().partyBNonces[msg.sender][partyA] += 1;
		AccountStorage.layout().partyANonces[partyA] += 1;
	}
}
