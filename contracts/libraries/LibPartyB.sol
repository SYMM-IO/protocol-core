// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/QuoteStorage.sol";
import "../storages/MAStorage.sol";
import "../storages/QuoteStorage.sol";
import "./LibAccount.sol";
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

	function settleUpnl(SettleSig memory settleSig, uint256[] memory newPrices, address partyA, address partAIsSender) internal {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		mapping(address => int256) memory partyBUpnls;
		// amount to transfer from partyB to partyA (if it's positive it means we should increase partyA allocated balance)
		mapping(address => int256) memory amountToTransfer; // partyB => amount

		// check solvency
		require(
			LibAccount.partyAAvailableBalanceForLiquidation(settleSig.upnlPartyA, accountLayout.allocatedBalances[partyA], partyA) >= 0,
			"PartyBFacet: PartyA should be solvent"
		);

		for (uint8 i = 0; i < settleSig.partyBs.length; i++) {
			address partyB = settleSig.partyBs[i];
			partyBUpnls[partyB] = settleSig.partyBUpnls[i];
			require(
				LibAccount.partyBAvailableBalanceForLiquidation(settleSig.partyBUpnls[i], partyB, partyA) >= 0,
				"PartyBFacet: PartyB should be solvent"
			);
			require(!MAStorage.layout().partyBLiquidationStatus[partyB][partyA], "PartyBFacet: PartyB is in liquidation process");
			if (!partAIsSender && msg.sender != partyB) {
				require(
					block.timestamp >=
						MAStorage.layout().lastUpnlSettlementTimestamp[msg.sender][partyB][partyA] + MAStorage.layout().settlementCooldown,
					"PartyBFacet: Cooldown should be passed"
				);
				MAStorage.layout().lastUpnlSettlementTimestamp[msg.sender][partyB][partyA] = block.timestamp;
			}
			accountLayout.partyBNonces[partyB][partyA] += 1;
		}
		if (partAIsSender) {
			require(msg.sender == partyA, "PartyBFacet: Sender should be partyA Of positions");
		} else {
			require(partyBUpnls[msg.sender] != 0, "PartyBFacet: Sender should have a position with partyA");
		}
		require(settleSig.quoteIds.length == newPrices.length, "PartyBFacet: Invalid length");

		accountLayout.partyANonces[partyA] += 1;

		for (uint8 i = 0; i < settleSig.quoteIds.length; i++) {
			Quote storage quote = quoteLayout.quotes[settleSig.quoteIds[i].quoteId];
			require(quote.partyA == partyA, "PartyBFacet: PartyA is invalid");
			require(partyBUpnls[quote.partyB] != 0, "PartyBFacet: Sender should be partyB of quote");
			require(
				quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
				"PartyBFacet: Invalid state"
			);
			if (quote.openedPrice > settleSig.prices[i]) {
				require(newPrices[i] < quote.openedPrice && newPrices[i] >= settleSig.prices[i], "PartyBFacet: New price is out of range");
			} else {
				require(newPrices[i] > quote.openedPrice && newPrices[i] <= settleSig.prices[i], "PartyBFacet: New price is out of range");
			}
			if (quote.positionType == PositionType.LONG) {
				amountToTransfer[quote.partyB] +=
					((int256(newPrices[i]) - int256(quote.openedPrice)) * int256(libQuote.quoteOpenAmount(quote))) /
					1e18;
			} else {
				amountToTransfer[quote.partyB] +=
					((int256(quote.openedPrice) - int256(newPrices[i])) * int256(libQuote.quoteOpenAmount(quote))) /
					1e18;
			}
			quote.openedPrice = newPrices[i];
		}
		int256 resultAmount;
		for (uint8 i = 0; i < settleSig.partyBs.length; i++) {
			address partyB = settleSig.partyBs[i];
			int256 amount = amountToTransfer[partyB];
			resultAmount += amount;
			if (amount >= 0) {
				accountLayout.partyBAllocatedBalances[partyB][partyA] -= uint256(amount);
				emit SharedEvents.BalanceChangePartyB(partyB, partyA, uint256(amount), SharedEvents.BalanceChangeType.REALIZED_PNL_OUT);
			} else {
				accountLayout.partyBAllocatedBalances[partyB][partyA] += uint256(-amount);
				emit SharedEvents.BalanceChangePartyB(partyB, partyA, uint256(amount), SharedEvents.BalanceChangeType.REALIZED_PNL_IN);
			}
		}
		if (resultAmount >= 0) {
			accountLayout.allocatedBalances[partyA] += uint256(resultAmount);
			emit SharedEvents.BalanceChangePartyA(partyA, uint256(resultAmount), SharedEvents.BalanceChangeType.REALIZED_PNL_IN);
		} else {
			accountLayout.allocatedBalances[partyA] -= uint256(-resultAmount);
			emit SharedEvents.BalanceChangePartyA(partyA, uint256(-resultAmount), SharedEvents.BalanceChangeType.REALIZED_PNL_OUT);
		}
	}
}
