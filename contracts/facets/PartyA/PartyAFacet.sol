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
	 * @notice Send a Quote to the protocol. The quote status will be pending.
	 * @param partyBsWhiteList List of party B addresses allowed to act on this quote.
	 * @param symbolId Each symbol within the system possesses a unique identifier, for instance, BTCUSDT carries its own distinct ID
	 * @param positionType Can be SHORT or LONG (0 or 1)
	 * @param orderType Can be LIMIT or MARKET (0 or 1)
	 * @param price For limit orders, this is the user-requested price for the position, and for market orders, this acts as the price threshold
	 * 				that the user is willing to open a position. For example, if the market price for an arbitrary symbol is $1000 and the user wants to
	 * 				open a short position on this symbol they might be ok with prices up to $990
	 * @param quantity Size of the position
	 * @param cva The Credit Valuation Adjustment value. In the system, either partyA or partyB can get liquidated and CVA is the penalty that the
	 * 			liquidated side should pay to the other one
	 * @param lf Liquidation Fee. It is the prize that will be paid to the liquidator user
	 * @param partyAmm The partyA Maintenance Margin value. The amount that is actually behind the position and is considered in liquidation status
	 * @param partyBmm The partyB Maintenance Margin value. The amount that is actually behind the position and is considered in liquidation status
	 * @param maxFundingRate The maximum funding rate allowed from user side.
	 * @param deadline The user should set a deadline for their request. If no PartyB takes action on the quote within this timeframe, the request will expire
	 * @param affiliate The affiliate of this quote
	 * @param upnlSig The Muon signature for user upnl and symbol price
	 */
	function sendQuoteWithAffiliate(
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
		address affiliate,
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
			affiliate,
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
 * @notice Send a Quote to the protocol. The quote status will be pending.
	 * @param partyBsWhiteList List of party B addresses allowed to act on this quote.
	 * @param symbolId Each symbol within the system possesses a unique identifier, for instance, BTCUSDT carries its own distinct ID
	 * @param positionType Can be SHORT or LONG (0 or 1)
	 * @param orderType Can be LIMIT or MARKET (0 or 1)
	 * @param price For limit orders, this is the user-requested price for the position, and for market orders, this acts as the price threshold
	 * 				that the user is willing to open a position. For example, if the market price for an arbitrary symbol is $1000 and the user wants to
	 * 				open a short position on this symbol they might be ok with prices up to $990
	 * @param quantity Size of the position
	 * @param cva The Credit Valuation Adjustment value. In the system, either partyA or partyB can get liquidated and CVA is the penalty that the
	 * 			liquidated side should pay to the other one
	 * @param lf Liquidation Fee. It is the prize that will be paid to the liquidator user
	 * @param partyAmm The partyA Maintenance Margin value. The amount that is actually behind the position and is considered in liquidation status
	 * @param partyBmm The partyB Maintenance Margin value. The amount that is actually behind the position and is considered in liquidation status
	 * @param maxFundingRate The maximum funding rate allowed from user side.
	 * @param deadline The user should set a deadline for their request. If no PartyB takes action on the quote within this timeframe, the request will expire
	 * @param upnlSig The Muon signature for user upnl and symbol price
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
			address(0),
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
	 * @param expiredQuoteIds An array of IDs of the quotes to be expired.
	 */
	function expireQuote(uint256[] memory expiredQuoteIds) external whenNotPartyAActionsPaused {
		QuoteStatus result;
		for (uint8 i; i < expiredQuoteIds.length; i++) {
			result = LibQuote.expireQuote(expiredQuoteIds[i]);
			if (result == QuoteStatus.OPENED) {
				emit ExpireQuoteClose(result, expiredQuoteIds[i], QuoteStorage.layout().closeIds[expiredQuoteIds[i]]);
			} else {
				emit ExpireQuoteOpen(result, expiredQuoteIds[i]);
			}
		}
	}

	/**
	 * @notice Requests to cancel the specified quote. Two scenarios can occur:
			If the quote has not yet been locked, it will be immediately canceled.
			For a locked quote, the outcome depends on PartyB's decision to either accept the cancellation request or to proceed with opening the position, disregarding the request. 
			If PartyB agrees to cancel, the quote will no longer be accessible for others to interact with. 
			Conversely, if the position has been opened, the user is unable to issue this request.
	 * @param quoteId The ID of the quote to be canceled.
	 */
	function requestToCancelQuote(uint256 quoteId) external whenNotPartyAActionsPaused onlyPartyAOfQuote(quoteId) notLiquidated(quoteId) {
		QuoteStatus result = PartyAFacetImpl.requestToCancelQuote(quoteId);
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];

		if (result == QuoteStatus.EXPIRED) {
			emit ExpireQuoteOpen(result, quoteId);
		} else if (result == QuoteStatus.CANCELED || result == QuoteStatus.CANCEL_PENDING) {
			emit RequestToCancelQuote(quote.partyA, quote.partyB, result, quoteId);
		}
	}

	/**
	 * @notice User requests to close one of their position.
	 * @param quoteId The ID of the quote associated with the position to be closed.
	 * @param closePrice The closing price for the position. In the case of limit orders, this is the price the user wants to close the position at.
	 * 						For market orders, it's more like a price threshold the user's okay with when closing their position. Say, for a random symbol, the market price is $1000.
	 * 						If a user wants to close a short position on this symbol, they might be cool with prices up to $1010
	 * @param quantityToClose The quantity of the position to be closed.
	 * @param orderType  orderType can again be LIMIT or MARKET with the same logic as in SendQuote
	 * @param deadline The deadline for executing the position closure. If 'partyB' doesn't get back to the request within a certain time, then the request will just time out
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
	 * @notice Requests to cancel a pending position closure request.
	 * @param quoteId The ID of the quote associated with the position.
	 */
	function requestToCancelCloseRequest(uint256 quoteId) external whenNotPartyAActionsPaused onlyPartyAOfQuote(quoteId) notLiquidated(quoteId) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote storage quote = quoteLayout.quotes[quoteId];
		QuoteStatus result = PartyAFacetImpl.requestToCancelCloseRequest(quoteId);
		if (result == QuoteStatus.OPENED) {
			emit ExpireQuoteClose(QuoteStatus.OPENED, quoteId, quoteLayout.closeIds[quoteId]);
		} else if (result == QuoteStatus.CANCEL_CLOSE_PENDING) {
			emit RequestToCancelCloseRequest(quote.partyA, quote.partyB, quoteId, QuoteStatus.CANCEL_CLOSE_PENDING, quoteLayout.closeIds[quoteId]);
		}
	}

	/**
	 * @notice Forces the cancellation of the specified quote when partyB is not responsive for a certian amount of time(ForceCancelCooldown).
	 * @param quoteId The ID of the quote to be canceled.
	 */
	function forceCancelQuote(uint256 quoteId) external notLiquidated(quoteId) whenNotPartyAActionsPaused {
		PartyAFacetImpl.forceCancelQuote(quoteId);
		emit ForceCancelQuote(quoteId, QuoteStatus.CANCELED);
	}

	/**
	 * @notice Forces the cancellation of the close request associated with the specified quote when partyB is not responsive for a certain amount of time(ForceCancelCloseCooldown).
	 * @param quoteId The ID of the quote for which the close request should be canceled.
	 */
	function forceCancelCloseRequest(uint256 quoteId) external notLiquidated(quoteId) whenNotPartyAActionsPaused {
		PartyAFacetImpl.forceCancelCloseRequest(quoteId);
		emit ForceCancelCloseRequest(quoteId, QuoteStatus.OPENED, QuoteStorage.layout().closeIds[quoteId]);
	}

	/**
	 * @notice Forces the closure of the position associated with the specified quote.
	 * @param quoteId The ID of the quote for which the position should be forced to close.
	 * @param sig The Muon signature.
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
