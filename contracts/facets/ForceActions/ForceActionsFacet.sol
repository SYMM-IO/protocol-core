// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/LibAccessibility.sol";
import "../../libraries/LibAccessibility.sol";
import "../../storages/QuoteStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "../../interfaces/IPartiesEvents.sol";
import "./IForceActionsFacet.sol";
import "./ForceActionsFacetImpl.sol";
import "../Settlement/SettlementFacetEvents.sol";

contract ForceActionsFacet is Accessibility, Pausable, IPartiesEvents, IForceActionsFacet, SettlementFacetEvents {
    /**
     * @notice Forces the cancellation of the specified quote when partyB is not responsive for a certian amount of time(ForceCancelCooldown).
	 * @param quoteId The ID of the quote to be canceled.
	 */
    function forceCancelQuote(uint256 quoteId) external notLiquidated(quoteId) whenNotPartyAActionsPaused {
        ForceActionsFacetImpl.forceCancelQuote(quoteId);
        emit ForceCancelQuote(quoteId, QuoteStatus.CANCELED);
    }

    /**
     * @notice Forces the cancellation of the close request associated with the specified quote when partyB is not responsive for a certain amount of time(ForceCancelCloseCooldown).
	 * @param quoteId The ID of the quote for which the close request should be canceled.
	 */
    function forceCancelCloseRequest(uint256 quoteId) external notLiquidated(quoteId) whenNotPartyAActionsPaused {
        ForceActionsFacetImpl.forceCancelCloseRequest(quoteId);
        emit ForceCancelCloseRequest(quoteId, QuoteStatus.OPENED, QuoteStorage.layout().closeIds[quoteId]);
        emit ForceCancelCloseRequest(quoteId, QuoteStatus.OPENED); // For backward compatibility, will be removed in future
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
        SettlementSig memory settleSig;
        (uint256 closePrice, bool isPartyBLiquidated, int256 upnlPartyB, uint256 partyBAllocatedBalance) = ForceActionsFacetImpl.forceClosePosition(
            quoteId,
            sig,
            settleSig,
            new uint256[](0)
        );
        if (isPartyBLiquidated) {
            emit LiquidatePartyB(msg.sender, quote.partyB, quote.partyA, partyBAllocatedBalance, upnlPartyB);
        } else {
            emit ForceClosePosition(quoteId, quote.partyA, quote.partyB, filledAmount, closePrice, quote.quoteStatus, quoteLayout.closeIds[quoteId]);
            emit ForceClosePosition(quoteId, quote.partyA, quote.partyB, filledAmount, closePrice, quote.quoteStatus); // For backward compatibility, will be removed in future
        }
    }

    /**
 * @notice Settles the positions then forces the closure of the position associated with the specified quote.
	 * @param quoteId The ID of the quote for which the position should be forced to close.
	 * @param highLowPriceSig The Muon signature.
	 * @param settleSig The data struct contains quoteIds and upnl of parties and market prices
	 * @param updatedPrices New prices to be set as openedPrice for the specified quotes.
	 */
    function settleAndForceClosePosition(
        uint256 quoteId,
        HighLowPriceSig memory highLowPriceSig,
        SettlementSig memory settleSig,
        uint256[] memory updatedPrices
    ) external notLiquidated(quoteId) whenNotPartyAActionsPaused {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        Quote storage quote = quoteLayout.quotes[quoteId];
        uint256 filledAmount = quote.quantityToClose;
        (uint256 closePrice, bool isPartyBLiquidated, int256 upnlPartyB, uint256 partyBAllocatedBalance) = ForceActionsFacetImpl.forceClosePosition(
            quoteId,
            highLowPriceSig,
            settleSig,
            updatedPrices
        );
        if (isPartyBLiquidated) {
            emit LiquidatePartyB(msg.sender, quote.partyB, quote.partyA, partyBAllocatedBalance, upnlPartyB);
        } else {
            emit SettleUpnl(settleSig.quotesSettlementsData, updatedPrices, msg.sender);
            emit ForceClosePosition(quoteId, quote.partyA, quote.partyB, filledAmount, closePrice, quote.quoteStatus, quoteLayout.closeIds[quoteId]);
            emit ForceClosePosition(quoteId, quote.partyA, quote.partyB, filledAmount, closePrice, quote.quoteStatus); // For backward compatibility, will be removed in future
        }
    }
}
