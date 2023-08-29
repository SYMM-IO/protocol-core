// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;
import "./PartyBFacetImpl.sol";
import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "./IPartyBEvents.sol";
import "../../storages/MuonStorage.sol";
import "../Account/IAccountEvents.sol";
import "../Account/AccountFacetImpl.sol";

contract PartyBFacet is Accessibility, Pausable, IPartyBEvents, IAccountEvents {
    using LockedValuesOps for LockedValues;

    function lockQuote(
        uint256 quoteId,
        SingleUpnlSig memory upnlSig
    ) external whenNotPartyBActionsPaused onlyPartyB notLiquidated(quoteId) {
        PartyBFacetImpl.lockQuote(quoteId, upnlSig, true);
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        emit LockQuote(quote.partyB, quoteId, quote.quoteStatus);
    }

    function lockAndOpenQuote(
        uint256 quoteId,
        uint256 filledAmount,
        uint256 openedPrice,
        SingleUpnlSig memory upnlSig,
        PairUpnlAndPriceSig memory pairUpnlSig
    ) external whenNotPartyBActionsPaused onlyPartyB notLiquidated(quoteId) {
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        PartyBFacetImpl.lockQuote(quoteId, upnlSig, false);
        emit LockQuote(quote.partyB, quoteId, quote.quoteStatus);
        uint256 newId = PartyBFacetImpl.openPosition(
            quoteId,
            filledAmount,
            openedPrice,
            pairUpnlSig
        );
        emit OpenPosition(
            quoteId,
            quote.partyA,
            quote.partyB,
            filledAmount,
            openedPrice,
            QuoteStatus.OPENED
        );
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
                    newQuote.lockedValues.mm,
                    newQuote.lockedValues.lf,
                    newQuote.maxFundingRate,
                    newQuote.deadline,
                    newQuote.quoteStatus
                );
            } else if (newQuote.quoteStatus == QuoteStatus.CANCELED) {
                emit AcceptCancelRequest(newQuote.id, QuoteStatus.CANCELED);
            }
        }
    }

    function unlockQuote(
        uint256 quoteId
    ) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
        QuoteStatus res = PartyBFacetImpl.unlockQuote(quoteId);
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        if (res == QuoteStatus.EXPIRED) {
            emit ExpireQuote(res, quoteId);
        } else if (res == QuoteStatus.PENDING) {
            emit UnlockQuote(quote.partyB, quoteId, QuoteStatus.PENDING);
        }
    }

    function acceptCancelRequest(
        uint256 quoteId
    ) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
        PartyBFacetImpl.acceptCancelRequest(quoteId);
        emit AcceptCancelRequest(quoteId, QuoteStatus.CANCELED);
    }

    function openPosition(
        uint256 quoteId,
        uint256 filledAmount,
        uint256 openedPrice,
        PairUpnlAndPriceSig memory upnlSig
    ) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
        uint256 newId = PartyBFacetImpl.openPosition(quoteId, filledAmount, openedPrice, upnlSig);
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        emit OpenPosition(
            quoteId,
            quote.partyA,
            quote.partyB,
            filledAmount,
            openedPrice,
            QuoteStatus.OPENED
        );
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
                    newQuote.lockedValues.mm,
                    newQuote.lockedValues.lf,
                    newQuote.maxFundingRate,
                    newQuote.deadline,
                    newQuote.quoteStatus
                );
            } else if (newQuote.quoteStatus == QuoteStatus.CANCELED) {
                emit AcceptCancelRequest(newQuote.id, QuoteStatus.CANCELED);
            }
        }
    }

    function fillCloseRequest(
        uint256 quoteId,
        uint256 filledAmount,
        uint256 closedPrice,
        PairUpnlAndPriceSig memory upnlSig
    ) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
        PartyBFacetImpl.fillCloseRequest(quoteId, filledAmount, closedPrice, upnlSig);
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        emit FillCloseRequest(
            quoteId,
            quote.partyA,
            quote.partyB,
            filledAmount,
            closedPrice,
            quote.quoteStatus
        );
    }

    function acceptCancelCloseRequest(
        uint256 quoteId
    ) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
        PartyBFacetImpl.acceptCancelCloseRequest(quoteId);
        emit AcceptCancelCloseRequest(quoteId, QuoteStatus.OPENED);
    }

    function emergencyClosePosition(
        uint256 quoteId,
        PairUpnlAndPriceSig memory upnlSig
    )
        external
        whenNotPartyBActionsPaused
        onlyPartyBOfQuote(quoteId)
        whenEmergencyMode(msg.sender)
        notLiquidated(quoteId)
    {
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        uint256 filledAmount = LibQuote.quoteOpenAmount(quote);
        PartyBFacetImpl.emergencyClosePosition(quoteId, upnlSig);
        emit EmergencyClosePosition(
            quoteId,
            quote.partyA,
            quote.partyB,
            filledAmount,
            upnlSig.price,
            quote.quoteStatus
        );
    }

    function chargeFundingRate(
        address partyA,
        uint256[] memory quoteIds,
        int256[] memory rates,
        PairUpnlSig memory upnlSig
    ) external whenNotPartyBActionsPaused {
        PartyBFacetImpl.chargeFundingRate(partyA, quoteIds, rates, upnlSig);
        emit ChargeFundingRate(msg.sender, partyA, quoteIds, rates);
    }
}
