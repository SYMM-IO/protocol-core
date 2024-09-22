// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "../../storages/MuonStorage.sol";
import "../Account/AccountFacetImpl.sol";
import "./IPartyBGroupActionsFacet.sol";
import "../PartyBPositionActions/PartyBPositionActionsFacetImpl.sol";
import "../PartyBQuoteActions/PartyBQuoteActionsFacetImpl.sol";

contract PartyBGroupActionsFacet is Accessibility, Pausable, IPartyBGroupActionsFacet {
    using LockedValuesOps for LockedValues;

    /**
	 * @notice Locks and opens the specified quote with the provided details and signatures.
	 * @param quoteId The ID of the quote to be locked and opened.
	 * @param filledAmount PartyB has the option to open the position with either the full amount requested by the user or a specific fraction of it
	 * @param openedPrice The price at which the position is opened.
	 * @param upnlSig The Muon signature containing the single UPNL value used to lock the quote.
	 * @param pairUpnlSig The Muon signature containing the pair UPNL and price values used to open the position.
	 */
    function lockAndOpenQuote(
        uint256 quoteId,
        uint256 filledAmount,
        uint256 openedPrice,
        SingleUpnlSig memory upnlSig,
        PairUpnlAndPriceSig memory pairUpnlSig
    ) external whenNotPartyBActionsPaused onlyPartyB notLiquidated(quoteId) {
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        PartyBQuoteActionsFacetImpl.lockQuote(quoteId, upnlSig);
        emit LockQuote(quote.partyB, quoteId);
        uint256 newId = PartyBPositionActionsFacetImpl.openPosition(quoteId, filledAmount, openedPrice, pairUpnlSig);
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
}
