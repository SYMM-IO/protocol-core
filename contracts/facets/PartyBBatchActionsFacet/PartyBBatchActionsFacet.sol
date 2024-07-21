// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;
import "./PartyBBatchActionsFacetImpl.sol";
import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "./IPartyBBatchActionsFacet.sol";

contract PartyBBatchActionsFacet is Accessibility, Pausable, IPartyBBatchActionsFacet {
	/**
	 * @notice Fills the close request for the specified quotes.
	 * @param quoteIds The ID of the quotes for which the close request is filled.
	 * @param filledAmounts The filled amount for the close requests. PartyB can fill the LIMIT requests in multiple steps
	 * 						and each within a different price but the market requests should be filled all at once.
	 * @param closedPrices The closed price for the close requests.
	 * @param upnlSig The Muon signature containing PairUpnlAndPriceSig data.
	 */
	function fillCloseRequests(
		uint256[] memory quoteIds,
		uint256[] memory filledAmounts,
		uint256[] memory closedPrices,
		PairUpnlAndPricesSig memory upnlSig
	) external whenNotPartyBActionsPaused {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		(QuoteStatus[] memory quoteStatuses, uint256[] memory closeIds) = PartyBBatchActionsFacetImpl.fillCloseRequests(
			quoteIds,
			filledAmounts,
			closedPrices,
			upnlSig
		);
		Quote storage firstQuote = quoteLayout.quotes[quoteIds[0]];
		emit FillCloseRequests(quoteIds, firstQuote.partyA, firstQuote.partyB, filledAmounts, closedPrices, quoteStatuses, closeIds);
	}
}
