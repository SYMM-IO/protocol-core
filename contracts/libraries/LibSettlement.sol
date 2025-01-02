// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/MAStorage.sol";
import "../storages/MuonStorage.sol";
import "../storages/AccountStorage.sol";
import "./LibQuote.sol";
import "./LibAccount.sol";

library LibSettlement {
	function settleUpnl(
		SettlementSig memory settleSig,
		uint256[] memory updatedPrices,
		address partyA,
		bool isForceClose
	) internal returns (uint256[] memory newPartyBsAllocatedBalances) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		require(settleSig.quotesSettlementsData.length > 0 && settleSig.quotesSettlementsData.length == updatedPrices.length, "LibSettlement: Invalid length");
		require(
			LibAccount.partyAAvailableBalanceForLiquidation(settleSig.upnlPartyA, accountLayout.allocatedBalances[partyA], partyA) >= 0,
			"LibSettlement: PartyA is insolvent"
		);

		require(
			isForceClose || quoteLayout.partyBOpenPositions[msg.sender][partyA].length > 0,
			"LibSettlement: Sender should have a position with partyA"
		);
		accountLayout.partyANonces[partyA] += 1;

		int256[] memory settleAmounts = new int256[](settleSig.upnlPartyBs.length);
		address[] memory partyBs = new address[](settleSig.upnlPartyBs.length);
		newPartyBsAllocatedBalances = new uint256[](settleSig.upnlPartyBs.length);

		for (uint256 i = 0; i < settleSig.quotesSettlementsData.length; i++) {
			QuoteSettlementData memory data = settleSig.quotesSettlementsData[i];
			Quote storage quote = quoteLayout.quotes[data.quoteId];
			require(quote.partyA == partyA, "LibSettlement: PartyA is invalid");
			require(
				quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
				"LibSettlement: Invalid state"
			);
			require(data.partyBUpnlIndex <= settleSig.upnlPartyBs.length, "LibSettlement: Invalid partyBUpnlIndex in signature");
			require(
				partyBs[data.partyBUpnlIndex] == address(0) || partyBs[data.partyBUpnlIndex] == quote.partyB,
				"LibSettlement: Invalid upnlPartyBs list"
			);
			partyBs[data.partyBUpnlIndex] = quote.partyB;

			if (quote.openedPrice > data.currentPrice) {
				require(
					updatedPrices[i] < quote.openedPrice && updatedPrices[i] >= data.currentPrice,
					"LibSettlement: Updated price is out of range"
				);
			} else {
				require(
					updatedPrices[i] > quote.openedPrice && updatedPrices[i] <= data.currentPrice,
					"LibSettlement: Updated price is out of range"
				);
			}
			if (quote.positionType == PositionType.LONG) {
				settleAmounts[data.partyBUpnlIndex] +=
					((int256(updatedPrices[i]) - int256(quote.openedPrice)) * int256(LibQuote.quoteOpenAmount(quote))) /
					1e18;
			} else {
				settleAmounts[data.partyBUpnlIndex] +=
					((int256(quote.openedPrice) - int256(updatedPrices[i])) * int256(LibQuote.quoteOpenAmount(quote))) /
					1e18;
			}
			quote.openedPrice = updatedPrices[i];
		}

		int256 totalSettlementAmount;
		for (uint256 i = 0; i < partyBs.length; i++) {
			address partyB = partyBs[i];
			require(
				LibAccount.partyBAvailableBalanceForLiquidation(settleSig.upnlPartyBs[i], partyB, partyA) >= 0,
				"LibSettlement: PartyB should be solvent"
			);
			require(!MAStorage.layout().partyBLiquidationStatus[partyB][partyA], "LibSettlement: PartyB is in liquidation process");

			if (!isForceClose && msg.sender != partyB) {
				require(
					block.timestamp >=
						MAStorage.layout().lastUpnlSettlementTimestamp[msg.sender][partyB][partyA] + MAStorage.layout().settlementCooldown,
					"LibSettlement: Cooldown should be passed"
				);
				MAStorage.layout().lastUpnlSettlementTimestamp[msg.sender][partyB][partyA] = block.timestamp;
			}
			accountLayout.partyBNonces[partyB][partyA] += 1;

			int256 settlementAmount = settleAmounts[i];
			totalSettlementAmount += settlementAmount;
			if (settlementAmount >= 0) {
				accountLayout.partyBAllocatedBalances[partyB][partyA] -= uint256(settlementAmount);
				emit SharedEvents.BalanceChangePartyB(partyB, partyA, uint256(settlementAmount), SharedEvents.BalanceChangeType.REALIZED_PNL_OUT);
			} else {
				accountLayout.partyBAllocatedBalances[partyB][partyA] += uint256(-settlementAmount);
				emit SharedEvents.BalanceChangePartyB(partyB, partyA, uint256(-settlementAmount), SharedEvents.BalanceChangeType.REALIZED_PNL_IN);
			}
			newPartyBsAllocatedBalances[i] = accountLayout.partyBAllocatedBalances[partyB][partyA];
		}
		if (totalSettlementAmount >= 0) {
			accountLayout.allocatedBalances[partyA] += uint256(totalSettlementAmount);
			emit SharedEvents.BalanceChangePartyA(partyA, uint256(totalSettlementAmount), SharedEvents.BalanceChangeType.REALIZED_PNL_IN);
		} else {
			accountLayout.allocatedBalances[partyA] -= uint256(-totalSettlementAmount);
			emit SharedEvents.BalanceChangePartyA(partyA, uint256(-totalSettlementAmount), SharedEvents.BalanceChangeType.REALIZED_PNL_OUT);
		}
	}
}
