// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../utils/Pausable.sol";
import "../../utils/Accessibility.sol";
import "./IClearingHouseFacet.sol";
import "./ClearingHouseFacetImpl.sol";

contract ClearingHouseFacet is Pausable, Accessibility, IClearingHouseFacet {
	/**
	 * @notice Initiates clearing house liquidation for a PartyB.
	 * @param partyB The address of Party B.
	 * @param liquidationSig The signature confirming PartyB insolvency.
	 */
	function liquidateCrossPartyB(
		address partyB,
		CrossLiquidationSig memory liquidationSig
	) external whenNotLiquidationPaused notCrossLiquidatedPartyB(partyB) onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
		ClearingHouseFacetImpl.liquidateCrossPartyB(partyB, liquidationSig);
		emit LiquidateCrossPartyB(msg.sender, partyB, liquidationSig.liquidationId, liquidationSig.upnl, liquidationSig.timestamp);
	}

	/**
	 * @notice Deallocates PartyB balance for liquidation purposes.
	 * @param partyB The address of Party B.
	 * @param partyAs The addresses of Party A.
	 * @param amounts The amounts to deallocate.
	 */
	function deallocateForCrossLiquidation(
		address partyB,
		address[] memory partyAs,
		uint256[] memory amounts
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
		ClearingHouseFacetImpl.deallocateForCrossLiquidation(partyB, partyAs, amounts);
		emit DeallocateForCrossLiquidation(partyB, partyAs, amounts);
	}

	/**
	 * @notice Transfers assets to PartyAs during liquidation.
	 * @param partyB The address of Party B.
	 * @param receivers The addresses of Party A.
	 * @param amounts The amounts to distribute.
	 */
	function distributeForCrossLiquidation(
		address partyB,
		address[] memory receivers,
		uint256[] memory amounts
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
		ClearingHouseFacetImpl.distributeForCrossLiquidation(partyB, receivers, amounts);
		emit DistributeForCrossLiquidation(partyB, receivers, amounts);
	}

	/**
	 * @notice Liquidates all pending quotes from PartyB to PartyA.
	 * @param partyB The address of Party B.
	 * @param partyAs The addresses of Party A.
	 */
	function liquidatePendingPositionsForCrossLiquidation(
		address partyB,
		address[] memory partyAs
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
		ClearingHouseFacetImpl.liquidatePendingPositionsForCrossLiquidation(partyB, partyAs);
		emit LiquidatePendingPositionsForCrossLiquidation(partyB, partyAs);
	}

	/**
	 * @notice Liquidates active positions of PartyB with PartyA.
	 * @param partyB The address of Party B.
	 * @param partyA The address of Party A.
	 * @param priceSig The price signature.
	 */
	function liquidatePositionsForCrossLiquidation(
		address partyB,
		address partyA,
		QuotePriceSig memory priceSig
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
		(uint256[] memory liquidatedAmounts, uint256[] memory closeIds) = ClearingHouseFacetImpl.liquidatePositionsForCrossLiquidation(
			partyB,
			partyA,
			priceSig
		);
		emit LiquidatePositionsForCrossLiquidation(partyB, partyA, priceSig.quoteIds, liquidatedAmounts, closeIds);
	}
}
