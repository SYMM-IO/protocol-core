// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./PartyAFacetImpl.sol";
import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "./IPartyAFacet.sol";

contract PartyAFacet is Accessibility, Pausable, IPartyAFacet {
	/**
	 * @notice Send a Quote to the protocol, and this quote status will be pending.
	 * @dev sendQuote can read more about the cva, lf, partyAmm, partyBmm, maxFundingRate in bla bla bla.
	 * @param partyBsWhiteList List of addresses allowed for Party B.
	 * @param symbolId The ID of the symbol being quoted.
	 * @param positionType The type of position (e.g., Long, Short).
	 * @param orderType The type of order (e.g., Limit, Market).
	 * @param price The quoted price.
	 * @param quantity The quantity being quoted.
	 * @param cva The Credit Valuation Adjustment value.
	 * @param lf The Liquidation Fee value.
	 * @param partyAmm The partyA Maintenance Margin value.
	 * @param partyBmm The partyB Maintenance Margin value.
	 * @param maxFundingRate The maximum funding rate allowed.
	 * @param deadline The deadline for the quote.
	 * @param upnlSig The signature for SingleUpnlAndPrice.
	 */
	function sendQuote(
		address[] memory partyBsWhiteList,
		uint256 symbolId,
		PositionType positionType,
		OrderType orderType,
		uint256 price,
		uint256 quantity,
		uint256 cva,
		uint256 lf,
		uint256 partyAmm,
		uint256 partyBmm,
		uint256 maxFundingRate,
		uint256 deadline,
		SingleUpnlAndPriceSig memory upnlSig
	) external whenNotPartyAActionsPaused notLiquidatedPartyA(msg.sender) notSuspended(msg.sender) {
		uint256 quoteId = PartyAFacetImpl.sendQuote(
			partyBsWhiteList,
			symbolId,
			positionType,
			orderType,
			price,
			quantity,
			cva,
			lf,
			partyAmm,
			partyBmm,
			maxFundingRate,
			deadline,
			upnlSig
		);
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		emit SendQuote(
			msg.sender,
			quoteId,
			partyBsWhiteList,
			symbolId,
			positionType,
			orderType,
			price,
			upnlSig.price,
			quantity,
			quote.lockedValues.cva,
			quote.lockedValues.lf,
			quote.lockedValues.partyAmm,
			quote.lockedValues.partyBmm,
			quote.tradingFee,
			deadline
		);
	}

	/**
	 * @notice Expires the specified quotes.
	 * @dev This function can only be called when Party A actions are not paused.
	 * @param expiredQuoteIds An array of IDs of the quotes to be expired.
	 */
	function expireQuote(uint256[] memory expiredQuoteIds) external whenNotPartyAActionsPaused {
		QuoteStatus result;
		for (uint8 i; i < expiredQuoteIds.length; i++) {
			result = LibQuote.expireQuote(expiredQuoteIds[i]);
			emit ExpireQuote(result, expiredQuoteIds[i], 0);
		}
	}

	/**
	 * @notice Requests to cancel the specified quote.
	 * @dev This function can only be called by Party A of the quote, and when Party A actions are not paused.
	 * @param quoteId The ID of the quote to be canceled.
	 */
	function requestToCancelQuote(uint256 quoteId) external whenNotPartyAActionsPaused onlyPartyAOfQuote(quoteId) notLiquidated(quoteId) {
		QuoteStatus result = PartyAFacetImpl.requestToCancelQuote(quoteId);
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];

		if (result == QuoteStatus.EXPIRED) {
			emit ExpireQuote(result, quoteId, 0);
		} else if (result == QuoteStatus.CANCELED || result == QuoteStatus.CANCEL_PENDING) {
			emit RequestToCancelQuote(quote.partyA, quote.partyB, result, quoteId);
		}
	}

	/**
	 * @notice Requests to close a position associated with the specified quote.
	 * @dev This function can only be called by Party A of the quote, and when Party A actions are not paused.
	 * @param quoteId The ID of the quote associated with the position to be closed.
	 * @param closePrice The closing price for the position.
	 * @param quantityToClose The quantity of the position to be closed.
	 * @param orderType The type of order for the position closure.
	 * @param deadline The deadline for executing the position closure.
	 */
	function requestToClosePosition(
		uint256 quoteId,
		uint256 closePrice,
		uint256 quantityToClose,
		OrderType orderType,
		uint256 deadline
	) external whenNotPartyAActionsPaused onlyPartyAOfQuote(quoteId) notLiquidated(quoteId) {
		PartyAFacetImpl.requestToClosePosition(quoteId, closePrice, quantityToClose, orderType, deadline);
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];
		emit RequestToClosePosition(
			quote.partyA,
			quote.partyB,
			quoteId,
			closePrice,
			quantityToClose,
			orderType,
			deadline,
			QuoteStatus.CLOSE_PENDING,
			quoteLayout.closeIds[quoteId]
		);
	}

	/**
	 * @notice Requests to cancel a pending position closure request associated with the specified quote.
	 * @dev This function can only be called by Party A of the quote, and when Party A actions are not paused.
	 * @param quoteId The ID of the quote associated with the pending position closure request to be canceled.
	 */
	function requestToCancelCloseRequest(uint256 quoteId) external whenNotPartyAActionsPaused onlyPartyAOfQuote(quoteId) notLiquidated(quoteId) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];
		QuoteStatus result = PartyAFacetImpl.requestToCancelCloseRequest(quoteId);
		if (result == QuoteStatus.OPENED) {
			emit ExpireQuote(QuoteStatus.OPENED, quoteId, quoteLayout.closeIds[quoteId]);
		} else if (result == QuoteStatus.CANCEL_CLOSE_PENDING) {
			emit RequestToCancelCloseRequest(quote.partyA, quote.partyB, quoteId, QuoteStatus.CANCEL_CLOSE_PENDING, quoteLayout.closeIds[quoteId]);
		}
	}

	/**
	 * @notice Forces the cancellation of the specified quote.
	 * @dev This function can only be called when Party A actions are not paused and the quote is not liquidated.
	 * @param quoteId The ID of the quote to be canceled.
	 */
	function forceCancelQuote(uint256 quoteId) external notLiquidated(quoteId) whenNotPartyAActionsPaused {
		PartyAFacetImpl.forceCancelQuote(quoteId);
		emit ForceCancelQuote(quoteId, QuoteStatus.CANCELED);
	}

	/**
	 * @notice Forces the cancellation of the close request associated with the specified quote.
	 * @dev This function can only be called when Party A actions are not paused and the quote is not liquidated.
	 * @param quoteId The ID of the quote for which the close request should be canceled.
	 */
	function forceCancelCloseRequest(uint256 quoteId) external notLiquidated(quoteId) whenNotPartyAActionsPaused {
		PartyAFacetImpl.forceCancelCloseRequest(quoteId);
		emit ForceCancelCloseRequest(quoteId, QuoteStatus.OPENED, QuoteStorage.layout().closeIds[quoteId]);
	}

	/**
	 * @notice Forces the closure of the position associated with the specified quote using the provided signature.
	 * @dev This function can only be called when Party A actions are not paused and the quote is not liquidated.
	 * @param quoteId The ID of the quote for which the position should be forced to close.
	 * @param sig The signature containing the high and low prices used to force close the position.
	 */
	function forceClosePosition(uint256 quoteId, HighLowPriceSig memory sig) external notLiquidated(quoteId) whenNotPartyAActionsPaused {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];
		uint256 filledAmount = quote.quantityToClose;
		(uint256 closePrice, bool isPartyBLiquidated, int256 upnlPartyB, uint256 partyBAllocatedBalance) = PartyAFacetImpl.forceClosePosition(
			quoteId,
			sig
		);
		if (isPartyBLiquidated) {
			emit LiquidatePartyB(msg.sender, quote.partyB, quote.partyA, partyBAllocatedBalance, upnlPartyB);
		} else {
			emit ForceClosePosition(quoteId, quote.partyA, quote.partyB, filledAmount, closePrice, quote.quoteStatus, quoteLayout.closeIds[quoteId]);
		}
	}
}
