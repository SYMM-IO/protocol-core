// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/muon/LibMuonPartyBBatchActions.sol";
import "../../libraries/LibSolvency.sol";
import "../../libraries/LibPartyBPositionsActions.sol";
import "../../storages/MAStorage.sol";
import "../../storages/QuoteStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../storages/AccountStorage.sol";

library PartyBBatchActionsFacetImpl {
	function openPositions(
		uint256[] memory quoteIds,
		uint256[] memory filledAmounts,
		uint256[] memory openedPrices,
		PairUpnlAndPricesSig memory upnlSig
	) internal returns (uint256[] memory currentIds) {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();

		require(
			quoteIds.length == filledAmounts.length && quoteIds.length == openedPrices.length && quoteIds.length > 0,
			"PartyBFacet: Invalid length"
		);

		Quote storage firstQuote = quoteLayout.quotes[quoteIds[0]];

		// PartyA and PartyB are not suspended
		require(!accountLayout.suspendedAddresses[firstQuote.partyA], "PartyBFacet: PartyA is Suspended");
		require(!accountLayout.suspendedAddresses[firstQuote.partyB], "PartyBFacet: Sender is Suspended");

		// PartyB is not in emergency mode
		require(!appLayout.partyBEmergencyStatus[firstQuote.partyB], "PartyBFacet: PartyB is in emergency mode");
		require(!appLayout.emergencyMode, "PartyBFacet: System is in emergency mode");

		// Solvency checks
		require(!maLayout.liquidationStatus[firstQuote.partyA], "PartyBFacet: PartyA isn't solvent");
		require(!maLayout.partyBLiquidationStatus[firstQuote.partyB][firstQuote.partyA], "PartyBFacet: PartyB isn't solvent");
		require(!accountLayout.crossLiquidationDetails[firstQuote.partyB].inProgress, "PartyBFacet: PartyB is in cross liquidation process");

		// Verify the upnl and prices
		LibMuonPartyBBatchActions.verifyPairUpnlAndPrices(upnlSig, firstQuote.partyB, firstQuote.partyA, quoteIds);

		accountLayout.partyANonces[firstQuote.partyA] += 1;
		accountLayout.partyBNonces[firstQuote.partyB][firstQuote.partyA] += 1;

		currentIds = new uint256[](quoteIds.length);
		for (uint256 i = 0; i < quoteIds.length; i++) {
			uint256 quoteId = quoteIds[i];
			Quote storage quote = quoteLayout.quotes[quoteId];
			require(quote.partyB == msg.sender, "PartyBFacet: Sender should be the partyB");
			require(firstQuote.partyA == quote.partyA, "PartyBFacet: All positions should belong to one partyA");
			currentIds[i] = LibPartyBPositionsActions.openPosition(quoteId, filledAmounts[i], openedPrices[i]);
		}
		LibSolvency.isSolventAfterOpenPosition(
			quoteIds,
			filledAmounts,
			upnlSig.prices,
			upnlSig.upnlPartyB,
			upnlSig.upnlPartyA,
			firstQuote.partyB,
			firstQuote.partyA
		);
	}

	function fillCloseRequests(
		uint256[] memory quoteIds,
		uint256[] memory filledAmounts,
		uint256[] memory closedPrices,
		PairUpnlAndPricesSig memory upnlSig
	) internal returns (QuoteStatus[] memory quoteStatuses, uint256[] memory closeIds) {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();

		require(
			quoteIds.length == filledAmounts.length && quoteIds.length == closedPrices.length && quoteIds.length > 0,
			"PartyBFacet: Invalid length"
		);

		Quote storage firstQuote = quoteLayout.quotes[quoteIds[0]];

		// Verify the upnl and prices
		LibMuonPartyBBatchActions.verifyPairUpnlAndPrices(upnlSig, firstQuote.partyB, firstQuote.partyA, quoteIds);

		LibSolvency.isSolventAfterClosePosition(
			quoteIds,
			filledAmounts,
			closedPrices,
			upnlSig.prices,
			upnlSig.upnlPartyB,
			upnlSig.upnlPartyA,
			firstQuote.partyB,
			firstQuote.partyA
		);

		// Solvency checks
		require(!maLayout.liquidationStatus[firstQuote.partyA], "PartyBFacet: PartyA isn't solvent");
		require(!maLayout.partyBLiquidationStatus[firstQuote.partyB][firstQuote.partyA], "PartyBFacet: PartyB isn't solvent");
		require(!accountLayout.crossLiquidationDetails[firstQuote.partyB].inProgress, "PartyBFacet: PartyB is in cross liquidation process");

		accountLayout.partyBNonces[firstQuote.partyB][firstQuote.partyA] += 1;
		accountLayout.partyANonces[firstQuote.partyA] += 1;

		quoteStatuses = new QuoteStatus[](quoteIds.length);
		closeIds = new uint256[](quoteIds.length);
		for (uint256 i = 0; i < quoteIds.length; i++) {
			uint256 quoteId = quoteIds[i];
			Quote storage quote = quoteLayout.quotes[quoteId];
			require(quote.partyB == msg.sender, "PartyBFacet: Sender should be the partyB");
			require(firstQuote.partyA == quote.partyA, "PartyBFacet: All positions should belong to one partyA");
			LibPartyBPositionsActions.fillCloseRequest(quoteId, filledAmounts[i], closedPrices[i]);
			quoteStatuses[i] = quote.quoteStatus;
			closeIds[i] = quoteLayout.closeIds[quoteId];
		}
	}
}
