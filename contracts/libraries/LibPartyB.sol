// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/QuoteStorage.sol";
import "../storages/MAStorage.sol";
import "../storages/MuonStorage.sol";
import "../storages/QuoteStorage.sol";
import "./LibAccount.sol";
import "./LibQuote.sol";
import "./LibLockedValues.sol";

library LibPartyB {
	using LockedValuesOps for LockedValues;

	/**
	 * @notice Checks if the Party B is valid to lock a quote.
	 * @param quoteId The ID of the quote to be locked.
	 * @param upnl The unrealized profit and loss of the Party B.
	 */
	function checkPartyBValidationToLockQuote(uint256 quoteId, int256 upnl) internal view {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();

		Quote storage quote = quoteLayout.quotes[quoteId];
		require(quote.quoteStatus == QuoteStatus.PENDING, "PartyBFacet: Invalid state");
		require(block.timestamp <= quote.deadline, "PartyBFacet: Quote is expired");
		require(quoteId <= quoteLayout.lastId, "PartyBFacet: Invalid quoteId");
		int256 availableBalance = LibAccount.partyBAvailableForQuote(upnl, msg.sender, quote.partyA);
		require(availableBalance >= 0, "PartyBFacet: Available balance is lower than zero");
		require(uint256(availableBalance) >= quote.lockedValues.totalForPartyB(), "PartyBFacet: insufficient available balance");
		require(!maLayout.partyBLiquidationStatus[msg.sender][quote.partyA], "PartyBFacet: PartyB isn't solvent");
		bool isValidPartyB;
		if (quote.partyBsWhiteList.length == 0) {
			require(msg.sender != quote.partyA, "PartyBFacet: PartyA can't be partyB too");
			isValidPartyB = true;
		} else {
			for (uint8 index = 0; index < quote.partyBsWhiteList.length; index++) {
				if (msg.sender == quote.partyBsWhiteList[index]) {
					isValidPartyB = true;
					break;
				}
			}
		}
		require(isValidPartyB, "PartyBFacet: Sender isn't whitelisted");
	}

	function settleUpnl(SettlementSig memory settleSig, uint256[] memory updatedPrices, address partyA, bool isForceClose) internal {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		require(settleSig.quotesSettlementsData.length == updatedPrices.length, "PartyBFacet: Invalid length");
		require(
			LibAccount.partyAAvailableBalanceForLiquidation(settleSig.upnlPartyA, accountLayout.allocatedBalances[partyA], partyA) >= 0,
			"PartyBFacet: PartyA is insolvent"
		);

		require(
			isForceClose || quoteLayout.partyBOpenPositions[msg.sender][partyA].length > 0,
			"PartyBFacet: Sender should have a position with partyA"
		);
		accountLayout.partyANonces[partyA] += 1;

		int256[] memory settleAmounts = new int256[](settleSig.upnlPartyBs.length);
		address[] memory partyBs = new address[](settleSig.upnlPartyBs.length);

		for (uint8 i = 0; i < settleSig.quotesSettlementsData.length; i++) {
			QuoteSettlementData memory data = settleSig.quotesSettlementsData[i];
			Quote storage quote = quoteLayout.quotes[data.quoteId];
			require(quote.partyA == partyA, "PartyBFacet: PartyA is invalid");
			require(
				quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
				"PartyBFacet: Invalid state"
			);

			partyBs[data.partyBUpnlIndex] = quote.partyB;

			if (quote.openedPrice > data.currentPrice) {
				require(updatedPrices[i] < quote.openedPrice && updatedPrices[i] >= data.currentPrice, "PartyBFacet: Updated price is out of range");
			} else {
				require(updatedPrices[i] > quote.openedPrice && updatedPrices[i] <= data.currentPrice, "PartyBFacet: Updated price is out of range");
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
		for (uint8 i = 0; i < partyBs.length; i++) {
			address partyB = partyBs[i];

			require(
				LibAccount.partyBAvailableBalanceForLiquidation(settleSig.upnlPartyBs[i], partyB, partyA) >= 0,
				"PartyBFacet: PartyB should be solvent"
			);
			require(!MAStorage.layout().partyBLiquidationStatus[partyB][partyA], "PartyBFacet: PartyB is in liquidation process");

			if (!isForceClose && msg.sender != partyB) {
				require(
					block.timestamp >=
						MAStorage.layout().lastUpnlSettlementTimestamp[msg.sender][partyB][partyA] + MAStorage.layout().settlementCooldown,
					"PartyBFacet: Cooldown should be passed"
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
				emit SharedEvents.BalanceChangePartyB(partyB, partyA, uint256(settlementAmount), SharedEvents.BalanceChangeType.REALIZED_PNL_IN);
			}
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
