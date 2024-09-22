// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;
import "./PartyBPositionActionsFacetImpl.sol";
import "./IPartyBPositionActionsFacet.sol";
import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "../../storages/MuonStorage.sol";
import "../Account/AccountFacetImpl.sol";

contract PartyBPositionActionsFacet is Accessibility, Pausable, IPartyBPositionActionsFacet {
	using LockedValuesOps for LockedValues;

	/**
	 * @notice Opens a position for the specified quote. The opened position's size can't be excessively small or large.
	 * 			If it's like 99/100, the leftover will be a minuscule quote that falls below the minimum acceptable quote value.
	 * 			Conversely, the position might be so small that it also falls beneath the minimum value.
	 * 			Also, the remaining open portion of the position cannot fall below the minimum acceptable quote value for that particular symbol.
	 * @param quoteId The ID of the quote for which the position is opened.
	 * @param filledAmount PartyB has the option to open the position with either the full amount requested by the user or a specific fraction of it
	 * @param openedPrice The opened price for the position.
	 * @param upnlSig The Muon signature containing PairUpnlAndPriceSig data.
	 */
	function openPosition(
		uint256 quoteId,
		uint256 filledAmount,
		uint256 openedPrice,
		PairUpnlAndPriceSig memory upnlSig
	) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
		uint256 newId = PartyBPositionActionsFacetImpl.openPosition(quoteId, filledAmount, openedPrice, upnlSig);
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		emit OpenPosition(quoteId, quote.partyA, quote.partyB, filledAmount, openedPrice);
		if (newId != 0) {
			Quote storage newQuote = QuoteStorage.layout().quotes[newId];
			if (newQuote.quoteStatus == QuoteStatus.PENDING) {
				emit SendQuote(
					newQuote.partyA,
					newQuote.id,
					newQuote.partyBsWhiteList,
					newQuote.symbolId,
					newQuote.positionType,
					newQuote.orderType,
					newQuote.requestedOpenPrice,
					newQuote.marketPrice,
					newQuote.quantity,
					newQuote.lockedValues.cva,
					newQuote.lockedValues.lf,
					newQuote.lockedValues.partyAmm,
					newQuote.lockedValues.partyBmm,
					newQuote.tradingFee,
					newQuote.deadline
				);
			} else if (newQuote.quoteStatus == QuoteStatus.CANCELED) {
				emit AcceptCancelRequest(newQuote.id, QuoteStatus.CANCELED);
			}
		}
	}

	/**
	 * @notice Fills the close request for the specified quote.
	 * @param quoteId The ID of the quote for which the close request is filled.
	 * @param filledAmount The filled amount for the close request. PartyB can fill the LIMIT requests in multiple steps
	 * 						and each within a different price but the market requests should be filled all at once.
	 * @param closedPrice The closed price for the close request.
	 * @param upnlSig The Muon signature containing PairUpnlAndPriceSig data.
	 */
	function fillCloseRequest(
		uint256 quoteId,
		uint256 filledAmount,
		uint256 closedPrice,
		PairUpnlAndPriceSig memory upnlSig
	) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];
		PartyBPositionActionsFacetImpl.fillCloseRequest(quoteId, filledAmount, closedPrice, upnlSig);
		emit FillCloseRequest(quoteId, quote.partyA, quote.partyB, filledAmount, closedPrice, quote.quoteStatus, quoteLayout.closeIds[quoteId]);
		emit FillCloseRequest(quoteId, quote.partyA, quote.partyB, filledAmount, closedPrice, quote.quoteStatus); // For backward compatibility, will be removed in future
	}

	/**
	 * @notice Accepts a cancel close request for the specified quote.
	 * @param quoteId The ID of the quote for which the cancel close request is accepted.
	 */
	function acceptCancelCloseRequest(uint256 quoteId) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
		PartyBPositionActionsFacetImpl.acceptCancelCloseRequest(quoteId);
		emit AcceptCancelCloseRequest(quoteId, QuoteStatus.OPENED, QuoteStorage.layout().closeIds[quoteId]);
		emit AcceptCancelCloseRequest(quoteId, QuoteStatus.OPENED); // For backward compatibility, will be removed in future
	}

	/**
	 * @notice Allows Party B to emergency close a position for the specified quote.
	 * @param quoteId The ID of the quote for which the position is emergency closed.
	 * @param upnlSig The Muon signature containing the unrealized profit and loss (UPNL) and the closing price.
	 */
	function emergencyClosePosition(
		uint256 quoteId,
		PairUpnlAndPriceSig memory upnlSig
	) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];
		uint256 filledAmount = LibQuote.quoteOpenAmount(quote);
		PartyBPositionActionsFacetImpl.emergencyClosePosition(quoteId, upnlSig);
		emit EmergencyClosePosition(
			quoteId,
			quote.partyA,
			quote.partyB,
			filledAmount,
			upnlSig.price,
			quote.quoteStatus,
			quoteLayout.closeIds[quoteId]
		);
		emit EmergencyClosePosition(
			quoteId,
			quote.partyA,
			quote.partyB,
			filledAmount,
			upnlSig.price,
			quote.quoteStatus
		); // For backward compatibility, will be removed in future
	}
}
