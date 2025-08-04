// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../utils/Pausable.sol";
import "../../utils/Accessibility.sol";
import "./IClearingHouseFacet.sol";
import "./ClearingHouseFacetImpl.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/MAStorage.sol";

contract ClearingHouseFacet is Pausable, Accessibility, IClearingHouseFacet {
	using LockedValuesOps for LockedValues;

	/**
	 * @notice Initiates clearing house liquidation for a PartyB.
	 * @param partyB The address of Party B.
	 * @param liquidationSig The signature confirming PartyB insolvency.
	 */
	function liquidateCrossPartyB(
		address partyB,
		CrossLiquidation memory liquidationSig
	) external whenNotLiquidationPaused notCrossLiquidatedPartyB(partyB) onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
		ClearingHouseFacetImpl.liquidateCrossPartyB(partyB, liquidationSig);

		emit LiquidateCrossPartyB(msg.sender, partyB, liquidationSig.liquidationId, liquidationSig.upnl, liquidationSig.timestamp);
	}

	/**
	 * @notice Deallocates PartyB balance for liquidation purposes.
	 */
	function deallocateForCrossLiquidation(
		address partyB,
		address[] memory partyAs,
		uint256[] memory amounts
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
		ClearingHouseFacetImpl.deallocateForCrossLiquidation(partyB, partyAs, amounts);
		emit DeallocateForLiquidation(partyB, partyAs, amounts);
	}

	/**
	 * @notice Transfers assets to PartyA during liquidation.
	 */
	function distribute(
		address partyB,
		address receiver,
		uint256 amount
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
		ClearingHouseFacetImpl.distribute(partyB, receiver, amount);
		emit Distribute(partyB, receiver, amount);
	}

	/**
	 * @notice Liquidates all pending quotes from PartyB to PartyA.
	 */
	function liquidatePendingQuotes(
		address partyB,
		address[] memory partyAs
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
		ClearingHouseFacetImpl.liquidatePendingQuotes(partyB, partyAs);
		emit LiquidatePendingQuotes(partyB, partyAs);
	}

	/**
	 * @notice Liquidates active positions of PartyB with PartyA.
	 */
	function liquidateCrossPositionsPartyB(
		address partyB,
		address partyA,
		QuotePriceSig memory priceSig
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
		(uint256[] memory liquidatedAmounts, uint256[] memory closeIds) = ClearingHouseFacetImpl.liquidateCrossPositionsPartyB(
			partyB,
			partyA,
			priceSig
		);
		emit LiquidateCrossPositionsPartyB(partyB, partyA, priceSig.quoteIds, liquidatedAmounts, closeIds);
	}
}
