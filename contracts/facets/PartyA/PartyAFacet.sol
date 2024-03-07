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

	function expireQuote(uint256[] memory expiredQuoteIds) external whenNotPartyAActionsPaused {
		QuoteStatus result;
		for (uint8 i; i < expiredQuoteIds.length; i++) {
			result = LibQuote.expireQuote(expiredQuoteIds[i]);
			if (result == QuoteStatus.OPENED){
				emit ExpireQuoteClose(result, expiredQuoteIds[i], QuoteStorage.layout().closeIds[expiredQuoteIds[i]]);
			} else {
				emit ExpireQuoteOpen(result, expiredQuoteIds[i]);
			}
		}
	}

	function requestToCancelQuote(uint256 quoteId) external whenNotPartyAActionsPaused onlyPartyAOfQuote(quoteId) notLiquidated(quoteId) {
		QuoteStatus result = PartyAFacetImpl.requestToCancelQuote(quoteId);
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];

		if (result == QuoteStatus.EXPIRED) {
			emit ExpireQuoteOpen(result, quoteId);
		} else if (result == QuoteStatus.CANCELED || result == QuoteStatus.CANCEL_PENDING) {
			emit RequestToCancelQuote(quote.partyA, quote.partyB, result, quoteId);
		}
	}

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

	function forceCancelQuote(uint256 quoteId) external notLiquidated(quoteId) whenNotPartyAActionsPaused {
		PartyAFacetImpl.forceCancelQuote(quoteId);
		emit ForceCancelQuote(quoteId, QuoteStatus.CANCELED);
	}

	function forceCancelCloseRequest(uint256 quoteId) external notLiquidated(quoteId) whenNotPartyAActionsPaused {
		PartyAFacetImpl.forceCancelCloseRequest(quoteId);
		emit ForceCancelCloseRequest(quoteId, QuoteStatus.OPENED, QuoteStorage.layout().closeIds[quoteId]);
	}

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
