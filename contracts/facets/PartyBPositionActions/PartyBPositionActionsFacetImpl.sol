// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/muon/LibMuonPartyB.sol";
import "../../libraries/LibSolvency.sol";
import "../../libraries/LibPartyBPositionsActions.sol";

library PartyBPositionActionsFacetImpl {
	using LockedValuesOps for LockedValues;

	function openPosition(
		uint256 quoteId,
		uint256 filledAmount,
		uint256 openedPrice,
		PairUpnlAndPriceSig memory upnlSig
	) internal returns (uint256 currentId) {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();

		Quote storage quote = QuoteStorage.layout().quotes[quoteId];

		require(accountLayout.suspendedAddresses[quote.partyA] == false, "PartyBFacet: PartyA is suspended");
		require(!accountLayout.suspendedAddresses[msg.sender], "PartyBFacet: Sender is Suspended");
		require(!appLayout.partyBEmergencyStatus[quote.partyB], "PartyBFacet: PartyB is in emergency mode");
		require(!appLayout.emergencyMode, "PartyBFacet: System is in emergency mode");
		LibMuonPartyB.verifyPairUpnlAndPrice(upnlSig, quote.partyB, quote.partyA, quote.symbolId);
		accountLayout.partyANonces[quote.partyA] += 1;
		accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;

		currentId = LibPartyBPositionsActions.openPosition(quoteId, filledAmount, openedPrice);
		uint256[] memory quoteIds = new uint256[](1);
		uint256[] memory filledAmounts = new uint256[](1);
		uint256[] memory marketPrices = new uint256[](1);
		quoteIds[0] = quoteId;
		filledAmounts[0] = filledAmount;
		marketPrices[0] = upnlSig.price;
		LibSolvency.isSolventAfterOpenPosition(
			quoteIds,
			filledAmounts,
			marketPrices,
			upnlSig.upnlPartyB,
			upnlSig.upnlPartyA,
			quote.partyB,
			quote.partyA
		);
	}

	function fillCloseRequest(uint256 quoteId, uint256 filledAmount, uint256 closedPrice, PairUpnlAndPriceSig memory upnlSig) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		LibMuonPartyB.verifyPairUpnlAndPrice(upnlSig, quote.partyB, quote.partyA, quote.symbolId);
		uint256[] memory quoteIds = new uint256[](1);
		uint256[] memory filledAmounts = new uint256[](1);
		uint256[] memory closedPrices = new uint256[](1);
		uint256[] memory marketPrices = new uint256[](1);
		quoteIds[0] = quoteId;
		filledAmounts[0] = filledAmount;
		closedPrices[0] = closedPrice;
		marketPrices[0] = upnlSig.price;
		LibSolvency.isSolventAfterClosePosition(
			quoteIds,
			filledAmounts,
			closedPrices,
			marketPrices,
			upnlSig.upnlPartyB,
			upnlSig.upnlPartyA,
			quote.partyB,
			quote.partyA
		);
		accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
		accountLayout.partyANonces[quote.partyA] += 1;
		LibPartyBPositionsActions.fillCloseRequest(quoteId, filledAmount, closedPrice);
	}

	function acceptCancelCloseRequest(uint256 quoteId) internal {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];

		require(quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING, "PartyBFacet: Invalid state");
		quote.statusModifyTimestamp = block.timestamp;
		quote.quoteStatus = QuoteStatus.OPENED;
		quote.requestedClosePrice = 0;
		quote.quantityToClose = 0;
	}

	function emergencyClosePosition(uint256 quoteId, PairUpnlAndPriceSig memory upnlSig) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		Symbol memory symbol = SymbolStorage.layout().symbols[quote.symbolId];
		require(
			GlobalAppStorage.layout().emergencyMode || GlobalAppStorage.layout().partyBEmergencyStatus[quote.partyB] || !symbol.isValid,
			"PartyBFacet: Operation not allowed. Either emergency mode must be active, party B must be in emergency status, or the symbol must be delisted"
		);
		require(quote.quoteStatus == QuoteStatus.OPENED || quote.quoteStatus == QuoteStatus.CLOSE_PENDING, "PartyBFacet: Invalid state");
		LibMuonPartyB.verifyPairUpnlAndPrice(upnlSig, quote.partyB, quote.partyA, quote.symbolId);
		uint256 filledAmount = LibQuote.quoteOpenAmount(quote);
		quote.quantityToClose = filledAmount;
		quote.requestedClosePrice = upnlSig.price;
		require(
			LibAccount.partyAAvailableBalanceForLiquidation(upnlSig.upnlPartyA, accountLayout.allocatedBalances[quote.partyA], quote.partyA) >= 0,
			"PartyBFacet: PartyA is insolvent"
		);
		require(
			LibAccount.partyBAvailableBalanceForLiquidation(upnlSig.upnlPartyB, quote.partyB, quote.partyA) >= 0,
			"PartyBFacet: PartyB should be solvent"
		);
		accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;
		accountLayout.partyANonces[quote.partyA] += 1;
		LibQuote.closeQuote(quote, filledAmount, upnlSig.price);
	}
}
