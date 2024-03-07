// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;
import "./PartyBFacetImpl.sol";
import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "./IPartyBFacet.sol";
import "../../storages/MuonStorage.sol";
import "../Account/AccountFacetImpl.sol";

contract PartyBFacet is Accessibility, Pausable, IPartyBFacet {
	using LockedValuesOps for LockedValues;

	/**
	 * @notice Locks the specified quote using the provided signature.
	 * @dev This function can only be called when Party B actions are not paused, and the quote is not liquidated.
	 * @param quoteId The ID of the quote to be locked.
	 * @param upnlSig The signature containing the single upnl value used to lock the quote.
	 */
	function lockQuote(uint256 quoteId, SingleUpnlSig memory upnlSig) external whenNotPartyBActionsPaused onlyPartyB notLiquidated(quoteId) {
		PartyBFacetImpl.lockQuote(quoteId, upnlSig, true);
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		emit LockQuote(quote.partyB, quoteId);
	}

	/**
	 * @notice Locks and opens the specified quote with the provided details and signatures.
	 * @dev This function can only be called when Party B actions are not paused, and the quote is not liquidated.
	 * @param quoteId The ID of the quote to be locked and opened.
	 * @param filledAmount The amount to be filled when opening the position.
	 * @param openedPrice The price at which the position is opened.
	 * @param upnlSig The signature containing the single UPNL value used to lock the quote.
	 * @param pairUpnlSig The signature containing the pair UPNL and price values used to open the position.
	 */
	function lockAndOpenQuote(
		uint256 quoteId,
		uint256 filledAmount,
		uint256 openedPrice,
		SingleUpnlSig memory upnlSig,
		PairUpnlAndPriceSig memory pairUpnlSig
	) external whenNotPartyBActionsPaused onlyPartyB notLiquidated(quoteId) {
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		PartyBFacetImpl.lockQuote(quoteId, upnlSig, false);
		emit LockQuote(quote.partyB, quoteId);
		uint256 newId = PartyBFacetImpl.openPosition(quoteId, filledAmount, openedPrice, pairUpnlSig);
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
	 * @notice Unlocks the specified quote.
	 * @dev This function can only be called when Party B actions are not paused, and the quote is not liquidated.
	 * @param quoteId The ID of the quote to be unlocked.
	 */
	function unlockQuote(uint256 quoteId) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
		QuoteStatus res = PartyBFacetImpl.unlockQuote(quoteId);
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		if (res == QuoteStatus.EXPIRED) {
			emit ExpireQuote(res, quoteId, 0);
		} else if (res == QuoteStatus.PENDING) {
			emit UnlockQuote(quote.partyB, quoteId, QuoteStatus.PENDING);
		}
	}

	/**
	 * @notice Accepts the cancellation request for the specified quote.
	 * @dev This function can only be called when Party B actions are not paused, and the quote is not liquidated.
	 * @param quoteId The ID of the quote for which the cancellation request is accepted.
	 */
	function acceptCancelRequest(uint256 quoteId) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
		PartyBFacetImpl.acceptCancelRequest(quoteId);
		emit AcceptCancelRequest(quoteId, QuoteStatus.CANCELED);
	}

	/**
	 * @notice Opens a position for the specified quote.
	 * @dev This function can only be called when Party B actions are not paused, and the quote is not liquidated.
	 * @param quoteId The ID of the quote for which the position is opened.
	 * @param filledAmount The filled amount for the position.
	 * @param openedPrice The opened price for the position.
	 * @param upnlSig The signature containing PairUpnlAndPriceSig data.
	 */
	function openPosition(
		uint256 quoteId,
		uint256 filledAmount,
		uint256 openedPrice,
		PairUpnlAndPriceSig memory upnlSig
	) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
		uint256 newId = PartyBFacetImpl.openPosition(quoteId, filledAmount, openedPrice, upnlSig);
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
	 * @notice Fills a close request for the specified quote.
	 * @dev This function can only be called when Party B actions are not paused, and the quote is not liquidated.
	 * @param quoteId The ID of the quote for which the close request is filled.
	 * @param filledAmount The filled amount for the close request.
	 * @param closedPrice The closed price for the close request.
	 * @param upnlSig The signature containing PairUpnlAndPriceSig data.
	 */
	function fillCloseRequest(
		uint256 quoteId,
		uint256 filledAmount,
		uint256 closedPrice,
		PairUpnlAndPriceSig memory upnlSig
	) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];
		PartyBFacetImpl.fillCloseRequest(quoteId, filledAmount, closedPrice, upnlSig);
		emit FillCloseRequest(quoteId, quote.partyA, quote.partyB, filledAmount, closedPrice, quote.quoteStatus, quoteLayout.closeIds[quoteId]);
	}

	/**
	 * @notice Accepts a cancel close request for the specified quote.
	 * @dev This function can only be called when Party B actions are not paused, and the quote is not liquidated.
	 * @param quoteId The ID of the quote for which the cancel close request is accepted.
	 */
	function acceptCancelCloseRequest(uint256 quoteId) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
		PartyBFacetImpl.acceptCancelCloseRequest(quoteId);
		emit AcceptCancelCloseRequest(quoteId, QuoteStatus.OPENED, QuoteStorage.layout().closeIds[quoteId]);
	}

	/**
	 * @notice Allows Party B to emergency close a position for the specified quote.
	 * @dev This function can only be called when Party B actions are not paused, and the caller is in emergency mode. The quote must not be liquidated.
	 * @param quoteId The ID of the quote for which the position is emergency closed.
	 * @param upnlSig The signature containing the unrealized profit and loss (UPNL) and the closing price.
	 */
	function emergencyClosePosition(
		uint256 quoteId,
		PairUpnlAndPriceSig memory upnlSig
	) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) whenEmergencyMode(msg.sender) notLiquidated(quoteId) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];
		uint256 filledAmount = LibQuote.quoteOpenAmount(quote);
		PartyBFacetImpl.emergencyClosePosition(quoteId, upnlSig);
		emit EmergencyClosePosition(
			quoteId,
			quote.partyA,
			quote.partyB,
			filledAmount,
			upnlSig.price,
			quote.quoteStatus,
			quoteLayout.closeIds[quoteId]
		);
	}
}
