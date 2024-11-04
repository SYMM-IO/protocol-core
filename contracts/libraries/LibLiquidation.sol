// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/MuonStorage.sol";
import "../storages/QuoteStorage.sol";
import "../libraries/SharedEvents.sol";
import "./LibAccount.sol";
import "./LibQuote.sol";

library LibLiquidation {
	using LockedValuesOps for LockedValues;

	/**
	 * @notice Liquidates Party B.
	 * @param partyB The address of Party B.
	 * @param partyA The address of Party A.
	 * @param upnlPartyB The unrealized profit and loss of Party B.
	 * @param timestamp The timestamp of the liquidation.
	 */
	function liquidatePartyB(address partyB, address partyA, int256 upnlPartyB, uint256 timestamp) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();

		// Calculate available balance for liquidation
		int256 availableBalance = LibAccount.partyBAvailableBalanceForLiquidation(upnlPartyB, partyB, partyA);

		// Ensure Party B is insolvent
		require(availableBalance < 0, "LiquidationFacet: partyB is solvent");

		uint256 liquidatorShare;
		uint256 remainingLf;

		// Determine liquidator share and remaining locked funds
		if (uint256(-availableBalance) < accountLayout.partyBLockedBalances[partyB][partyA].lf) {
			remainingLf = accountLayout.partyBLockedBalances[partyB][partyA].lf - uint256(-availableBalance);
			liquidatorShare = (remainingLf * maLayout.liquidatorShare) / 1e18;

			maLayout.partyBPositionLiquidatorsShare[partyB][partyA] =
				(remainingLf - liquidatorShare) /
				quoteLayout.partyBPositionsCount[partyB][partyA];
		} else {
			maLayout.partyBPositionLiquidatorsShare[partyB][partyA] = 0;
		}

		// Update liquidation status and timestamp for Party B
		maLayout.partyBLiquidationStatus[partyB][partyA] = true;
		maLayout.partyBLiquidationTimestamp[partyB][partyA] = timestamp;

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

		// Update allocated balances for Party A
		uint256 value = accountLayout.partyBAllocatedBalances[partyB][partyA] - remainingLf;
		accountLayout.allocatedBalances[partyA] += value;
		emit SharedEvents.BalanceChangePartyA(partyA, value, SharedEvents.BalanceChangeType.REALIZED_PNL_IN);

		// Clear pending quotes and reset balances for Party B
		delete quoteLayout.partyBPendingQuotes[partyB][partyA];
		emit SharedEvents.BalanceChangePartyB(partyB, partyA, accountLayout.partyBAllocatedBalances[partyB][partyA],
			SharedEvents.BalanceChangeType.REALIZED_PNL_OUT);
		accountLayout.partyBAllocatedBalances[partyB][partyA] = 0;
		accountLayout.partyBLockedBalances[partyB][partyA].makeZero();
		accountLayout.partyBPendingLockedBalances[partyB][partyA].makeZero();
		accountLayout.partyANonces[partyA] += 1;

		// Transfer liquidator share to the liquidator
		if (liquidatorShare > 0) {
			accountLayout.allocatedBalances[msg.sender] += liquidatorShare;
			emit SharedEvents.BalanceChangePartyA(msg.sender, liquidatorShare, SharedEvents.BalanceChangeType.LF_IN);
		}

		accountLayout.connectedPartyBCount[partyA] -= 1;
	}
}
