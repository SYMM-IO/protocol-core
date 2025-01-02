// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;
import "./OracleLessActionsFacetImpl.sol";
import "../../utils/Accessibility.sol";
import "../../utils/Pausable.sol";
import "./IOracleLessActionsFacet.sol";

contract OracleLessActionsFacet is Accessibility, Pausable, IOracleLessActionsFacet {
	/**
	 * @notice Party A can bind their address to a specific Party B, allowing them to interact exclusively with this Party B from that point onward.
	 * @param partyB The address of partyB.
	 */
	function bindToPartyB(address partyB) external whenNotPartyAActionsPaused {
		OracleLessActionsFacetImpl.bindToPartyB(partyB);
		emit BindToPartyB(msg.sender, partyB);
	}

	/**
	 * @notice Party A can schedule a request to unbind their address from Party B.
	 * @param partyB The address of partyB.
	 */
	function scheduleUnbindingFromPartyB(address partyB) external whenNotPartyAActionsPaused {
		OracleLessActionsFacetImpl.scheduleUnbindingFromPartyB(partyB);
		emit ScheduleUnbindingFromPartyB(msg.sender, partyB, block.timestamp);
	}

	/**
	 * @notice Party A can unbind their address from Party B after scheduling the action and completing a cooldown period.
	 * @param partyB The address of partyB.
	 */
	function unbindFromPartyB(address partyB) external whenNotPartyAActionsPaused {
		OracleLessActionsFacetImpl.unbindFromPartyB(partyB);
		emit UnbindFromPartyB(msg.sender, partyB);
	}

	/**
	 * @notice Once a user issues a quote, any PartyB can secure it by providing sufficient funds, based on their estimated profit and loss from opening the position.
	 * @param quoteIds The ID of the quotes to be locked.
	 */
	function lockQuotes(uint256[] memory quoteIds) external whenNotPartyBActionsPaused onlyPartyB {
		OracleLessActionsFacetImpl.lockQuotes(quoteIds);
		emit LockQuotes(msg.sender, quoteIds);
	}

	/**
	 * @notice Opens positions for the specified quotes. The opened position's size can't be excessively small or large.
	 * 			If it's like 99/100, the leftover will be a minuscule quote that falls below the minimum acceptable quote value.
	 * 			Conversely, the position might be so small that it also falls beneath the minimum value.
	 * 			Also, the remaining open portion of the position cannot fall below the minimum acceptable quote value for that particular symbol.
	 * @param quoteIds The ID of the quotes for which the positions is opened.
	 * @param filledAmounts PartyB has the option to open the position with either the full amount requested by the user or a specific fraction of it
	 * @param openedPrices The opened price for the positions.
	 */
	function openPositions(
		uint256[] memory quoteIds,
		uint256[] memory filledAmounts,
		uint256[] memory openedPrices
	) external whenNotPartyBActionsPaused {
		uint256[] memory newIds = OracleLessActionsFacetImpl.openPositions(quoteIds, filledAmounts, openedPrices);
		Quote storage firstQuote = QuoteStorage.layout().quotes[quoteIds[0]];
		emit OpenPositions(quoteIds, firstQuote.partyA, firstQuote.partyB, filledAmounts, openedPrices);
		for (uint256 i = 0; i < newIds.length; i++) {
			if (newIds[i] != 0) {
				Quote storage newQuote = QuoteStorage.layout().quotes[newIds[i]];
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

	/**
	 * @notice Fills the close request for the specified quotes.
	 * @param quoteIds The ID of the quotes for which the close request is filled.
	 * @param filledAmounts The filled amount for the close requests. PartyB can fill the LIMIT requests in multiple steps
	 * 						and each within a different price but the market requests should be filled all at once.
	 * @param closedPrices The closed price for the close requests.
	 */
	function fillCloseRequests(
		uint256[] memory quoteIds,
		uint256[] memory filledAmounts,
		uint256[] memory closedPrices
	) external whenNotPartyBActionsPaused {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		(QuoteStatus[] memory quoteStatuses, uint256[] memory closeIds) = OracleLessActionsFacetImpl.fillCloseRequests(
			quoteIds,
			filledAmounts,
			closedPrices
		);
		Quote storage firstQuote = quoteLayout.quotes[quoteIds[0]];
		emit FillCloseRequests(quoteIds, firstQuote.partyA, firstQuote.partyB, filledAmounts, closedPrices, quoteStatuses, closeIds);
	}
}
