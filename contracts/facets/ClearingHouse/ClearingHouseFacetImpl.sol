// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/AccountStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../storages/MAStorage.sol";
import "../../storages/QuoteStorage.sol";

import "../../libraries/SharedEvents.sol";
import "../../libraries/LibQuote.sol";
import "../../libraries/muon/LibMuonLiquidation.sol";

library ClearingHouseFacetImpl {
	using LockedValuesOps for LockedValues;

	function liquidateCrossPartyB(address partyB, CrossLiquidationSig memory liquidationSig) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();

		require(accountLayout.masterAccountMode[partyB], "ClearingHouseFacet: partyB is not using master account mode");
		LibMuonLiquidation.verifyCrossLiquidation(liquidationSig, partyB);
		require(
			liquidationSig.upnl +
				(int256(liquidationSig.totalAllocatedBalance + accountLayout.partyBAllocatedBalances[partyB][address(0)]) -
					int256(accountLayout.partyBTotalCva[partyB] + accountLayout.partyBTotalLf[partyB])) <
				0,
			"ClearingHouseFacet: partyB is solvent"
		);
		maLayout.partyBLiquidationTimestamp[partyB][address(0)] = liquidationSig.timestamp;
		accountLayout.crossLiquidationDetails[partyB] = CrossLiquidationDetail({
			liquidationId: liquidationSig.liquidationId,
			upnl: liquidationSig.upnl,
			timestamp: liquidationSig.timestamp,
			deallocateForLiquidation: 0,
			inProgress: true
		});
	}

	function deallocateForCrossLiquidation(address partyB, address[] memory partyAs, uint256[] memory amounts) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		require(partyAs.length == amounts.length, "ClearingHouseFacet: Invalid length");
		CrossLiquidationDetail storage crossLiquidationDetail = accountLayout.crossLiquidationDetails[partyB];
		require(crossLiquidationDetail.inProgress == true, "ClearingHouseFacet: PartyB is solvent");
		for (uint256 i = 0; i < partyAs.length; i++) {
			address partyA = partyAs[i];
			uint256 amount = amounts[i];
			require(accountLayout.partyBAllocatedBalances[partyB][partyA] >= amount, "ClearingHouseFacet: Insufficient allocated balance");
			accountLayout.partyBAllocatedBalances[partyB][partyA] -= amount;
			crossLiquidationDetail.deallocateForLiquidation += amount;
		}
	}

	function distributeForCrossLiquidation(address partyB, address[] memory receivers, uint256[] memory amounts) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		require(receivers.length == amounts.length, "ClearingHouseFacet: Invalid length");
		CrossLiquidationDetail storage crossLiquidationDetail = accountLayout.crossLiquidationDetails[partyB];
		require(crossLiquidationDetail.inProgress == true, "ClearingHouseFacet: PartyB is solvent");
		for (uint256 i = 0; i < receivers.length; i++) {
			require(crossLiquidationDetail.deallocateForLiquidation >= amounts[i], "ClearingHouseFacet: Insufficient allocated balance");
			crossLiquidationDetail.deallocateForLiquidation -= amounts[i];
			accountLayout.allocatedBalances[receivers[i]] += amounts[i];
		}
	}

	function liquidatePendingPositionsForCrossLiquidation(address partyB, address[] memory partyAs) internal {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		CrossLiquidationDetail storage crossLiquidationDetail = accountLayout.crossLiquidationDetails[partyB];
		require(crossLiquidationDetail.inProgress == true, "ClearingHouseFacet: PartyB is solvent");

		for (uint256 j = 0; j < partyAs.length; j++) {
			address partyA = partyAs[j];
			uint256[] storage pendingQuotes = quoteLayout.partyAPendingQuotes[partyA];
			for (uint256 index = 0; index < pendingQuotes.length; ) {
				Quote storage quote = quoteLayout.quotes[pendingQuotes[index]];
				if (quote.partyB == partyB && (quote.quoteStatus == QuoteStatus.LOCKED || quote.quoteStatus == QuoteStatus.CANCEL_PENDING)) {
					accountLayout.pendingLockedBalances[partyA].subQuote(quote);
					uint256 fee = LibQuote.getTradingFee(quote.id);
					accountLayout.allocatedBalances[partyA] += fee;
					emit SharedEvents.BalanceChangePartyA(partyA, fee, SharedEvents.BalanceChangeType.PLATFORM_FEE_IN);
					pendingQuotes[index] = pendingQuotes[pendingQuotes.length - 1];
					pendingQuotes.pop();
					quote.quoteStatus = QuoteStatus.LIQUIDATED_PENDING;
					quote.statusModifyTimestamp = block.timestamp;
				} else {
					index++;
				}
			}

			if (quoteLayout.partyBPendingQuotes[partyB][partyA].length > 0) {
				delete quoteLayout.partyBPendingQuotes[partyB][partyA];
				accountLayout.partyBLockedBalances[partyB][partyA].makeZero();
				accountLayout.partyBPendingLockedBalances[partyB][partyA].makeZero();
				accountLayout.partyANonces[partyA] += 1;
			}
		}
	}

	function liquidatePositionsForCrossLiquidation(
		address partyB,
		address partyA,
		QuotePriceSig memory priceSig
	) internal returns (uint256[] memory liquidatedAmounts, uint256[] memory closeIds) {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();

		LibMuonLiquidation.verifyQuotePrices(priceSig);

		CrossLiquidationDetail storage crossLiquidationDetail = accountLayout.crossLiquidationDetails[partyB];
		require(crossLiquidationDetail.inProgress == true, "ClearingHouseFacet: PartyB is solvent");

		require(
			priceSig.timestamp <= maLayout.partyBLiquidationTimestamp[partyB][address(0)] + maLayout.liquidationTimeout,
			"ClearingHouseFacet: Invalid signature"
		);
		require(maLayout.partyBLiquidationTimestamp[partyB][address(0)] <= priceSig.timestamp, "ClearingHouseFacet: Expired signature");

		liquidatedAmounts = new uint256[](priceSig.quoteIds.length);
		closeIds = new uint256[](priceSig.quoteIds.length);

		for (uint256 index = 0; index < priceSig.quoteIds.length; index++) {
			Quote storage quote = quoteLayout.quotes[priceSig.quoteIds[index]];
			require(
				quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
				"ClearingHouseFacet: Invalid state"
			);
			require(quote.partyA == partyA && quote.partyB == partyB, "ClearingHouseFacet: Invalid party");

			liquidatedAmounts[index] = quote.quantity - quote.closedAmount;
			closeIds[index] = quoteLayout.closeIds[quote.id];
			quote.quoteStatus = QuoteStatus.LIQUIDATED;
			quote.statusModifyTimestamp = block.timestamp;

			accountLayout.lockedBalances[partyA].subQuote(quote);

			quote.avgClosedPrice =
				(quote.avgClosedPrice * quote.closedAmount + LibQuote.quoteOpenAmount(quote) * priceSig.prices[index]) /
				(quote.closedAmount + LibQuote.quoteOpenAmount(quote));
			quote.closedAmount = quote.quantity;

			accountLayout.partyBTotalLf[partyB] -= quote.lockedValues.lf;
			accountLayout.partyBTotalCva[partyB] -= quote.lockedValues.cva;
			LibQuote.removeFromOpenPositions(quote.id);
			quoteLayout.partyAPositionsCount[partyA] -= 1;
			quoteLayout.partyBPositionsCount[partyB][partyA] -= 1;
			quoteLayout.partyBPositionsCount[partyB][address(0)] -= 1;
		}

		if (quoteLayout.partyBPositionsCount[partyB][partyA] == 0) {
			accountLayout.partyBNonces[partyB][partyA] += 1;
		}

		if (quoteLayout.partyBPositionsCount[partyB][address(0)] == 0) {
			crossLiquidationDetail.inProgress = false;
			crossLiquidationDetail.timestamp = 0;
		}

		return (liquidatedAmounts, closeIds);
	}
}
