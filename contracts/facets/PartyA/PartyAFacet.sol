// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./PartyAFacetImpl.sol";
import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "./IPartyAEvents.sol";

contract PartyAFacet is Accessibility, Pausable, IPartyAEvents {
    function sendQuote(
        address[] memory partyBsWhiteList,
        uint256 symbolId,
        PositionType positionType,
        OrderType orderType,
        uint256 price,
        uint256 quantity,
        uint256 cva,
        uint256 mm,
        uint256 lf,
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
            mm,
            lf,
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
            quote.lockedValues.mm,
            quote.lockedValues.lf,
            maxFundingRate,
            deadline,
            QuoteStatus.PENDING
        );
    }

    function expireQuote(uint256[] memory expiredQuoteIds) external whenNotPartyAActionsPaused {
        QuoteStatus result;
        for (uint8 i; i < expiredQuoteIds.length; i++) {
            result = LibQuote.expireQuote(expiredQuoteIds[i]);
            emit ExpireQuote(result, expiredQuoteIds[i]);
        }
    }

    function requestToCancelQuote(uint256 quoteId)
        external
        whenNotPartyAActionsPaused
        onlyPartyAOfQuote(quoteId)
        notLiquidated(quoteId)
    {
        QuoteStatus result = PartyAFacetImpl.requestToCancelQuote(quoteId);
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];

        if (result == QuoteStatus.EXPIRED) {
            emit ExpireQuote(result, quoteId);
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
        PartyAFacetImpl.requestToClosePosition(
            quoteId,
            closePrice,
            quantityToClose,
            orderType,
            deadline
        );
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        emit RequestToClosePosition(
            quote.partyA,
            quote.partyB,
            quoteId,
            closePrice,
            quantityToClose,
            orderType,
            deadline,
            QuoteStatus.CLOSE_PENDING
        );
    }

    function requestToCancelCloseRequest(uint256 quoteId)
        external
        whenNotPartyAActionsPaused
        onlyPartyAOfQuote(quoteId)
        notLiquidated(quoteId)
    {
        QuoteStatus result = PartyAFacetImpl.requestToCancelCloseRequest(quoteId);
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        if (result == QuoteStatus.OPENED) {
            emit ExpireQuote(QuoteStatus.OPENED, quoteId);
        } else if (result == QuoteStatus.CANCEL_CLOSE_PENDING) {
            emit RequestToCancelCloseRequest(
                quote.partyA,
                quote.partyB,
                quoteId,
                QuoteStatus.CANCEL_CLOSE_PENDING
            );
        }
    }

    function forceCancelQuote(uint256 quoteId)
        external
        notLiquidated(quoteId)
        whenNotPartyAActionsPaused
    {
        PartyAFacetImpl.forceCancelQuote(quoteId);
        emit ForceCancelQuote(quoteId, QuoteStatus.CANCELED);
    }

    function forceCancelCloseRequest(uint256 quoteId)
        external
        notLiquidated(quoteId)
        whenNotPartyAActionsPaused
    {
        PartyAFacetImpl.forceCancelCloseRequest(quoteId);
        emit ForceCancelCloseRequest(quoteId, QuoteStatus.OPENED);
    }

    function forceClosePosition(uint256 quoteId, PairUpnlAndPriceSig memory upnlSig)
        external
        notLiquidated(quoteId)
        whenNotPartyAActionsPaused
    {
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        uint256 filledAmount = quote.quantityToClose;
        uint256 requestedClosePrice = quote.requestedClosePrice;
        PartyAFacetImpl.forceClosePosition(quoteId, upnlSig);
        emit ForceClosePosition(
            quoteId,
            quote.partyA,
            quote.partyB,
            filledAmount,
            requestedClosePrice,
            quote.quoteStatus
        );
    }
}
