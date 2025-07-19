// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/AccountStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../storages/MAStorage.sol";
import "../../storages/QuoteStorage.sol";

import "../../libraries/LibAccount.sol";
import "../../libraries/SharedEvents.sol";
import "../../libraries/LibQuote.sol";
import "../../libraries/muon/LibMuonLiquidation.sol";

import "hardhat/console.sol";
library ClearingHouseFacetImpl {
	using LockedValuesOps for LockedValues;

	function liquidateCrossPartyB(address partyB, CrossLiquidation memory liquidationSig) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();

		require(accountLayout.masterAccountMode[partyB], "ClearingHouseFacet: partyB masterMode is not active");

		LibMuonLiquidation.verifyCrossLiquidation(liquidationSig, partyB);
		require(
			liquidationSig.upnl < 0 &&
				liquidationSig.upnl +
					(int256(liquidationSig.liquidationAllocatedBalance + accountLayout.partyBAllocatedBalances[partyB][address(0)]) -
						int256(accountLayout.partyBTotalCva[partyB] + accountLayout.partyBTotalLf[partyB])) <
				0,
			"ClearingHouseFacet: partyB is solvent"
		);
		maLayout.crossLiquidationStatus[partyB] = true;
		maLayout.partyBLiquidationTimestamp[partyB][address(0)] = liquidationSig.timestamp;
		accountLayout.CrossLiquidationDetails[partyB] = CrossLiquidationDetail({
			liquidationId: liquidationSig.liquidationId,
			upnl: liquidationSig.upnl,
			totalUnrealizedLoss: liquidationSig.totalUnrealizedLoss,
			liquidationFee: 0,
			timestamp: liquidationSig.timestamp,
			deallocateForLiquidation: 0
		});
	}

	function deallocateForCrossLiquidation(address partyB, address partyA, uint256 amount) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();

		require(maLayout.crossLiquidationStatus[partyB], "ClearingHouseFacet: PartyB is solvent");
		require(accountLayout.partyBAllocatedBalances[partyB][partyA] >= amount, "ClearingHouseFacet: Insufficient allocated balance");
		accountLayout.partyBAllocatedBalances[partyB][partyA] -= amount;
		accountLayout.CrossLiquidationDetails[partyB].deallocateForLiquidation += amount;
	}

	function transferToPartyA(address partyB, address partyA, uint256 amount) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();

		require(maLayout.crossLiquidationStatus[partyB] == true, "ClearingHouseFacet: PartyB is solvent");
		require(
			accountLayout.CrossLiquidationDetails[partyB].deallocateForLiquidation >= amount,
			"ClearingHouseFacet: Insufficient allocated balance"
		);
		accountLayout.CrossLiquidationDetails[partyB].deallocateForLiquidation -= amount;
		accountLayout.allocatedBalances[partyA] += amount;
	}

	function transferToLiquidator(address partyB, uint256 liquidatorShare) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();

		require(maLayout.crossLiquidationStatus[partyB] == true, "ClearingHouseFacet: PartyB is solvent");
		require(
			accountLayout.CrossLiquidationDetails[partyB].deallocateForLiquidation >= liquidatorShare,
			"ClearingHouseFacet: Insufficient allocated balance"
		);
		accountLayout.CrossLiquidationDetails[partyB].deallocateForLiquidation -= liquidatorShare;
		accountLayout.CrossLiquidationDetails[partyB].liquidationFee += liquidatorShare;
		accountLayout.allocatedBalances[msg.sender] += liquidatorShare;
	}

	function liquidatePendingQuotes(address partyB, address partyA) internal {
		MAStorage.Layout storage maLayout = MAStorage.layout();
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		require(maLayout.crossLiquidationStatus[partyB] == true, "ClearingHouseFacet: PartyB is solvent");
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

		delete quoteLayout.partyBPendingQuotes[partyB][partyA];

		accountLayout.partyBLockedBalances[partyB][partyA].makeZero();
		accountLayout.partyBPendingLockedBalances[partyB][partyA].makeZero();
		accountLayout.partyANonces[partyA] += 1;

		accountLayout.connectedPartyBCount[partyA] -= 1;
	}

	function liquidateCrossPositionsPartyB(
		address partyB,
		address partyA,
		QuotePriceSig memory priceSig
	) internal returns (uint256[] memory liquidatedAmounts, uint256[] memory closeIds) {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();

		LibMuonLiquidation.verifyQuotePrices(priceSig);
		require(maLayout.crossLiquidationStatus[partyB], "ClearingHouseFacet: PartyB is solvent");

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

			LibQuote.removeFromOpenPositions(quote.id);
			quoteLayout.partyAPositionsCount[partyA] -= 1;
			quoteLayout.partyBPositionsCount[partyB][partyA] -= 1;
		}

		if (quoteLayout.partyBPositionsCount[partyB][partyA] == 0) {
			maLayout.crossLiquidationStatus[partyB] = false;
			//! maLayout.partyBLiquidationTimestamp[partyB][partyA] = 0;
			accountLayout.partyBNonces[partyB][partyA] += 1;
		}
		return (liquidatedAmounts, closeIds);
	}
}
