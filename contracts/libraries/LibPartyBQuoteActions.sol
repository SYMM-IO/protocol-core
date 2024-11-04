// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/QuoteStorage.sol";
import "../storages/MAStorage.sol";
import "./LibAccount.sol";
import "./LibLockedValues.sol";

library LibPartyBQuoteActions {
	using LockedValuesOps for LockedValues;

	function lockQuote(uint256 quoteId) internal {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];
		require(quote.quoteStatus == QuoteStatus.PENDING, "PartyBFacet: Invalid state");
		require(block.timestamp <= quote.deadline, "PartyBFacet: Quote is expired");
		require(quoteId <= quoteLayout.lastId, "PartyBFacet: Invalid quoteId");
		require(!MAStorage.layout().partyBLiquidationStatus[msg.sender][quote.partyA], "PartyBFacet: PartyB isn't solvent");
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
		quote.statusModifyTimestamp = block.timestamp;
		quote.quoteStatus = QuoteStatus.LOCKED;
		quote.partyB = msg.sender;
		// lock funds for partyB
		accountLayout.partyBPendingLockedBalances[msg.sender][quote.partyA].addQuote(quote);
		if (
			quoteLayout.partyBPendingQuotes[msg.sender][quote.partyA].length == 0 && quoteLayout.partyBPositionsCount[msg.sender][quote.partyA] == 0
		) {
			accountLayout.connectedPartyBCount[quote.partyA] += 1;
		}
		quoteLayout.partyBPendingQuotes[msg.sender][quote.partyA].push(quote.id);
	}
}
