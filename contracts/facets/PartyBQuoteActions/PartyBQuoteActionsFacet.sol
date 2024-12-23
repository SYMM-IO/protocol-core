// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;
import "./PartyBQuoteActionsFacetImpl.sol";
import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "./IPartyBQuoteActionsFacet.sol";

contract PartyBQuoteActionsFacet is Accessibility, Pausable, IPartyBQuoteActionsFacet {
	using LockedValuesOps for LockedValues;

	/**
	 * @notice Once a user issues a quote, any PartyB can secure it by providing sufficient funds, based on their estimated profit and loss from opening the position.
	 * @param quoteId The ID of the quote to be locked.
	 * @param upnlSig The Muon signature containing the upnl value used to lock the quote.
	 */
	function lockQuote(uint256 quoteId, SingleUpnlSig memory upnlSig) external whenNotPartyBActionsPaused onlyPartyB notLiquidated(quoteId) {
		PartyBQuoteActionsFacetImpl.lockQuote(quoteId, upnlSig);
		Quote storage quote = QuoteStorage.layout().quotes[quoteId];
		emit LockQuote(quote.partyB, quoteId);
	}

	/**
	 * @notice Unlocks the specified quote.
	 * @param quoteId The ID of the quote to be unlocked.
	 */
	function unlockQuote(uint256 quoteId) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
		QuoteStatus res = PartyBQuoteActionsFacetImpl.unlockQuote(quoteId);
		if (res == QuoteStatus.EXPIRED) {
			emit ExpireQuoteOpen(res, quoteId);
		} else if (res == QuoteStatus.PENDING) {
			emit UnlockQuote(msg.sender, quoteId, QuoteStatus.PENDING);
		}
	}

	/**
	 * @notice Accepts the cancellation request for the specified quote.
	 * @param quoteId The ID of the quote for which the cancellation request is accepted.
	 */
	function acceptCancelRequest(uint256 quoteId) external whenNotPartyBActionsPaused onlyPartyBOfQuote(quoteId) notLiquidated(quoteId) {
		PartyBQuoteActionsFacetImpl.acceptCancelRequest(quoteId);
		emit AcceptCancelRequest(quoteId, QuoteStatus.CANCELED);
	}
}
