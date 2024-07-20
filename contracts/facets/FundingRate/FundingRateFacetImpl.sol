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
		require(quoteIds.length == rates.length && quoteIds.length > 0, "ChargeFundingFacet: Length not match");
		int256 partyBAvailableBalance = LibAccount.partyBAvailableBalanceForLiquidation(upnlSig.upnlPartyB, msg.sender, partyA);
		int256 partyAAvailableBalance = LibAccount.partyAAvailableBalanceForLiquidation(
			upnlSig.upnlPartyA,
			AccountStorage.layout().allocatedBalances[partyA],
			partyA
		);
		uint256 epochDuration;
		uint256 windowTime;
		for (uint256 i = 0; i < quoteIds.length; i++) {
			Quote storage quote = QuoteStorage.layout().quotes[quoteIds[i]];
			require(quote.partyA == partyA, "ChargeFundingFacet: Invalid quote");
			require(quote.partyB == msg.sender, "ChargeFundingFacet: Sender isn't partyB of quote");
			require(
				quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
				"ChargeFundingFacet: Invalid state"
			);
			require(quote.lastFundingPaymentTimestamp == 0, "ChargeFundingFacet: Use accumulated funding fee");
			epochDuration = SymbolStorage.layout().symbols[quote.symbolId].fundingRateEpochDuration;
			require(epochDuration > 0, "ChargeFundingFacet: Zero funding epoch duration");
			windowTime = SymbolStorage.layout().symbols[quote.symbolId].fundingRateWindowTime;
			uint256 latestEpochTimestamp = (block.timestamp / epochDuration) * epochDuration;
			uint256 paidTimestamp;
			if (block.timestamp <= latestEpochTimestamp + windowTime) {
				require(latestEpochTimestamp > quote.lastFundingPaymentTimestamp, "ChargeFundingFacet: Funding already paid for this window");
				paidTimestamp = latestEpochTimestamp;
			} else {
				uint256 nextEpochTimestamp = latestEpochTimestamp + epochDuration;
				require(block.timestamp >= nextEpochTimestamp - windowTime, "ChargeFundingFacet: Current timestamp is out of window");
				require(nextEpochTimestamp > quote.lastFundingPaymentTimestamp, "ChargeFundingFacet: Funding already paid for this window");
				paidTimestamp = nextEpochTimestamp;
			}
			if (rates[i] >= 0) {
				require(uint256(rates[i]) <= quote.maxFundingRate, "ChargeFundingFacet: High funding rate");
				uint256 priceDiff = (quote.openedPrice * uint256(rates[i])) / 1e18;
				if (quote.positionType == PositionType.LONG) {
					quote.openedPrice += priceDiff;
				} else {
					quote.openedPrice -= priceDiff;
				}
				partyAAvailableBalance -= int256((LibQuote.quoteOpenAmount(quote) * priceDiff) / 1e18);
				partyBAvailableBalance += int256((LibQuote.quoteOpenAmount(quote) * priceDiff) / 1e18);
			} else {
				require(uint256(-rates[i]) <= quote.maxFundingRate, "ChargeFundingFacet: High funding rate");
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
		require(partyAAvailableBalance >= 0, "ChargeFundingFacet: PartyA will be insolvent");
		require(partyBAvailableBalance >= 0, "ChargeFundingFacet: PartyB will be insolvent");
		AccountStorage.layout().partyBNonces[msg.sender][partyA] += 1;
		AccountStorage.layout().partyANonces[partyA] += 1;
	}

	function setEpochDuration(uint256[] memory symbolIds, uint256[] memory durations, address partyB) internal {
		require(symbolIds.length == durations.length, "ChargeFundingFacet: Invalid length");
		for (uint8 i = 0; i < symbolIds.length; i++) {
			require(durations[i] > 0, "ChargeFundingFacet: Zero epoch duration");
			FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[symbolIds[i]][partyB];
			require(fundingFee.epochDuration > 0, "ChargeFundingFacet: Zero epoch duration");
			uint256 newEpochs = (block.timestamp - ((fundingFee.epochs / fundingFee.epochDuration) * fundingFee.epochDuration)) /
				fundingFee.epochDuration;
			int256 newAccumulatedLongFee = ((fundingFee.accumulatedLongFee * int256(fundingFee.epochs)) +
				(fundingFee.currentLongFee * int256(newEpochs))) / (int256(newEpochs) + int256(fundingFee.epochs));
			int256 newAccumulatedShortFee = ((fundingFee.accumulatedShortFee * int256(fundingFee.epochs)) +
				(fundingFee.currentShortFee * int256(newEpochs))) / (int256(newEpochs) + int256(fundingFee.epochs));
			fundingFee.accumulatedLongFee = newAccumulatedLongFee;
			fundingFee.accumulatedShortFee = newAccumulatedShortFee;
			fundingFee.epochDuration = durations[i];
			fundingFee.epochs += newEpochs;
		}
	}

	function updateAccumulatedFundingFee(uint256[] memory symbolIds, int256[] memory longFees, int256[] memory shortFees) internal {
		require(symbolIds.length == longFees.length && longFees.length == shortFees.length, "ChargeFundingFacet: Invalid length");
		for (uint8 i = 0; i < symbolIds.length; i++) {
			FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[symbolIds[i]][msg.sender];
			require(fundingFee.epochDuration > 0, "ChargeFundingFacet: Zero epoch duration");
			uint256 newEpochs = (block.timestamp - ((fundingFee.epochs / fundingFee.epochDuration) * fundingFee.epochDuration)) /
				fundingFee.epochDuration;
			int256 newAccumulatedLongFee = ((fundingFee.accumulatedLongFee * int256(fundingFee.epochs)) +
				(fundingFee.currentLongFee * int256(newEpochs))) / (int256(newEpochs) + int256(fundingFee.epochs));
			int256 newAccumulatedShortFee = ((fundingFee.accumulatedShortFee * int256(fundingFee.epochs)) +
				(fundingFee.currentShortFee * int256(newEpochs))) / (int256(newEpochs) + int256(fundingFee.epochs));
			fundingFee.currentLongFee = longFees[i];
			fundingFee.currentShortFee = shortFees[i];
			fundingFee.accumulatedLongFee = newAccumulatedLongFee;
			fundingFee.accumulatedShortFee = newAccumulatedShortFee;
			fundingFee.epochs += newEpochs;
		}
	}

	function setFundingFee(uint256[] memory symbolIds, int256[] memory longFees, int256[] memory shortFees) internal {
		updateAccumulatedFundingFee(symbolIds, longFees, shortFees);
	}

	function setLongFundingFee(uint256[] memory symbolIds, int256[] memory longFees) internal {
		int256[] memory shortFees = new int256[](longFees.length);
		for (uint8 i = 0; i < symbolIds.length; i++) {
			FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[symbolIds[i]][msg.sender];
			shortFees[i] = fundingFee.currentShortFee;
		}
		updateAccumulatedFundingFee(symbolIds, longFees, shortFees);
	}

	function setShortFundingFee(uint256[] memory symbolIds, int256[] memory shortFees) internal {
		int256[] memory longFees = new int256[](shortFees.length);
		for (uint8 i = 0; i < symbolIds.length; i++) {
			FundingFee storage fundingFee = SymbolStorage.layout().fundingFees[symbolIds[i]][msg.sender];
			longFees[i] = fundingFee.currentLongFee;
		}
		updateAccumulatedFundingFee(symbolIds, longFees, shortFees);
	}

	function chargeAccumulatedFundingFee(address partyA, address partyB, uint256[] memory quoteIds, PairUpnlSig memory upnlSig) internal {
		LibMuon.verifyPairUpnl(upnlSig, partyB, partyA);
		for (uint8 i = 0; i < quoteIds.length; i++) {
			Quote storage quote = QuoteStorage.layout().quotes[quoteIds[i]];
			require(quote.partyA == partyA, "ChargeFundingFacet: Invalid quote");
			require(quote.partyB == partyB, "ChargeFundingFacet: Sender isn't partyB of quote");
			require(
				quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
				"ChargeFundingFacet: Invalid state"
			);
			LibQuote.chargeAccumulatedFundingFee(quoteIds[i]);
		}
		int256 partyBAvailableBalance = LibAccount.partyBAvailableBalanceForLiquidation(upnlSig.upnlPartyB, partyB, partyA);
		int256 partyAAvailableBalance = LibAccount.partyAAvailableBalanceForLiquidation(
			upnlSig.upnlPartyA,
			AccountStorage.layout().allocatedBalances[partyA],
			partyA
		);
		require(partyAAvailableBalance >= 0, "ChargeFundingFacet: PartyA will be insolvent");
		require(partyBAvailableBalance >= 0, "ChargeFundingFacet: PartyB will be insolvent");
	}
}
