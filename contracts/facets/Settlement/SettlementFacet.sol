// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./ISettlementFacet.sol";
import "../../libraries/LibAccessibility.sol";
import "../../libraries/LibAccessibility.sol";
import "../../storages/MuonStorage.sol";
import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "./SettlementFacetImpl.sol";

contract SettlementFacet is Accessibility, Pausable, ISettlementFacet {
	/**
	 * @notice Allows Party B to settle the upnl of party A position for the specified quotes.
	 * @param settlementSig The data struct contains quoteIds and upnl of parties and market prices
	 * @param updatedPrices New prices to be set as openedPrice for the specified quotes.
	 * @param partyA Address of party A
	 */
	function settleUpnl(
		SettlementSig memory settlementSig,
		uint256[] memory updatedPrices,
		address partyA
	) external whenNotPartyBActionsPaused onlyPartyB notLiquidatedPartyA(partyA) {
		uint256[] memory newPartyBsAllocatedBalances = SettlementFacetImpl.settleUpnl(settlementSig, updatedPrices, partyA);
		emit SettleUpnl(
			settlementSig.quotesSettlementsData,
			updatedPrices,
			partyA,
			AccountStorage.layout().allocatedBalances[partyA],
			newPartyBsAllocatedBalances
		);
	}

	function settleUpnlAndFillCloseRequests(
		SettlementSig memory settleSig,
		uint256[] memory updatedPrices,
		address partyA,
		uint256[] memory quoteIds,
		uint256[] memory filledAmounts,
		uint256[] memory closedPrices,
		PairUpnlAndPricesSig memory upnlSig
	) external whenNotPartyBActionsPaused onlyPartyB notLiquidatedPartyA(partyA) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		(uint256[] memory newPartyBsAllocatedBalances, QuoteStatus[] memory quoteStatuses, uint256[] memory closeIds) = SettlementFacetImpl
			.settleUpnlAndFillCloseRequests(settleSig, updatedPrices, partyA, quoteIds, filledAmounts, closedPrices, upnlSig);
		emit SettleUpnl(
			settleSig.quotesSettlementsData,
			updatedPrices,
			partyA,
			AccountStorage.layout().allocatedBalances[partyA],
			newPartyBsAllocatedBalances
		);
		Quote storage firstQuote = quoteLayout.quotes[quoteIds[0]];
		for (uint8 i = 0; i < quoteIds.length; i++) {
			emit FillCloseRequest(
				quoteIds[i],
				firstQuote.partyA,
				firstQuote.partyB,
				filledAmounts[i],
				closedPrices[i],
				quoteStatuses[i],
				closeIds[i]
			);
		}
	}
}
