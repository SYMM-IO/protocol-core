// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../utils/Pausable.sol";
import "../../utils/Accessibility.sol";
import "./ILiquidationFacet.sol";
import "./LiquidationFacetImpl.sol";
import "../../storages/AccountStorage.sol";

contract LiquidationFacet is Pausable, Accessibility, ILiquidationFacet {
	/**
	 * @notice Liquidates Party A's position based on the provided signature.
	 * @dev This function can only be called when liquidation is not paused and Party A is not already liquidated.
	 * @param partyA The address of Party A to be liquidated.
	 * @param liquidationSig The signature containing liquidation data.
	 */
	function liquidatePartyA(
		address partyA,
		LiquidationSig memory liquidationSig
	) external whenNotLiquidationPaused notLiquidatedPartyA(partyA) onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
		LiquidationFacetImpl.liquidatePartyA(partyA, liquidationSig);
		emit LiquidatePartyA(
			msg.sender,
			partyA,
			AccountStorage.layout().allocatedBalances[partyA],
			liquidationSig.upnl,
			liquidationSig.totalUnrealizedLoss
		);
	}

	/**
	 * @notice Sets prices for symbols based on the provided signature.
	 * @dev This function can only be called when liquidation is not paused and the caller has the LIQUIDATOR_ROLE.
	 * @param partyA The address of Party A associated with the liquidation.
	 * @param liquidationSig The signature containing symbol IDs and their corresponding prices.
	 */
	function setSymbolsPrice(
		address partyA,
		LiquidationSig memory liquidationSig
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
		LiquidationFacetImpl.setSymbolsPrice(partyA, liquidationSig);
		emit SetSymbolsPrices(msg.sender, partyA, liquidationSig.symbolIds, liquidationSig.prices);
	}

	/**
	 * @notice Liquidates pending positions for Party A.
	 * @dev This function can only be called when liquidation is not paused and the caller has the LIQUIDATOR_ROLE.
	 * @param partyA The address of Party A whose pending positions will be liquidated.
	 */
	function liquidatePendingPositionsPartyA(address partyA) external whenNotLiquidationPaused onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		uint256[] memory pendingQuotes = quoteLayout.partyAPendingQuotes[partyA];
		LiquidationFacetImpl.liquidatePendingPositionsPartyA(partyA);
		emit LiquidatePendingPositionsPartyA(msg.sender, partyA, pendingQuotes);
	}

	/**
	 * @notice Liquidates positions for Party A.
	 * @dev This function can only be called when liquidation is not paused and the caller has the LIQUIDATOR_ROLE.
	 * @param partyA The address of Party A whose positions will be liquidated.
	 * @param quoteIds An array of quote IDs representing the positions to be liquidated.
	 */
	function liquidatePositionsPartyA(
		address partyA,
		uint256[] memory quoteIds
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
		(bool disputed, uint256[] memory liquidatedAmounts, uint256[] memory closeIds) = LiquidationFacetImpl.liquidatePositionsPartyA(
			partyA,
			quoteIds
		);
		emit LiquidatePositionsPartyA(msg.sender, partyA, quoteIds, liquidatedAmounts, closeIds);
		if (disputed) {
			emit LiquidationDisputed(partyA);
		}
	}

	/**
	 * @notice Settles liquidation for Party A with specified Party Bs.
	 * @dev This function can only be called when liquidation is not paused.
	 * @param partyA The address of Party A to settle liquidation for.
	 * @param partyBs An array of addresses representing Party Bs involved in the settlement.
	 */
	function settlePartyALiquidation(address partyA, address[] memory partyBs) external whenNotLiquidationPaused {
		int256[] memory settleAmounts = LiquidationFacetImpl.settlePartyALiquidation(partyA, partyBs);
		emit SettlePartyALiquidation(partyA, partyBs, settleAmounts);
		if (MAStorage.layout().liquidationStatus[partyA] == false) {
			emit FullyLiquidatedPartyA(partyA);
		}
	}

	/**
	 * @notice Resolves a liquidation dispute for Party A with specified Party Bs and settlement amounts.
	 * @dev This function can only be called by accounts with the DISPUTE_ROLE role.
	 * @param partyA The address of Party A involved in the dispute.
	 * @param partyBs An array of addresses representing Party Bs involved in the dispute.
	 * @param amounts An array of settlement amounts corresponding to Party Bs.
	 * @param disputed A boolean indicating whether the liquidation was disputed.
	 */
	function resolveLiquidationDispute(
		address partyA,
		address[] memory partyBs,
		int256[] memory amounts,
		bool disputed
	) external onlyRole(LibAccessibility.DISPUTE_ROLE) {
		LiquidationFacetImpl.resolveLiquidationDispute(partyA, partyBs, amounts, disputed);
		emit ResolveLiquidationDispute(partyA, partyBs, amounts, disputed);
	}

	/**
	 * @notice Liquidates Party B with respect to Party A using the provided unrealized profit and loss signature.
	 * @dev This function can only be called by accounts with the LIQUIDATOR_ROLE role.
	 * @param partyB The address of Party B to be liquidated.
	 * @param partyA The address of Party A related to the liquidation.
	 * @param upnlSig The signature containing the unrealized profit and loss data.
	 */
	function liquidatePartyB(
		address partyB,
		address partyA,
		SingleUpnlSig memory upnlSig
	) external whenNotLiquidationPaused notLiquidatedPartyB(partyB, partyA) notLiquidatedPartyA(partyA) onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
		emit LiquidatePartyB(msg.sender, partyB, partyA, AccountStorage.layout().partyBAllocatedBalances[partyB][partyA], upnlSig.upnl);
		LiquidationFacetImpl.liquidatePartyB(partyB, partyA, upnlSig);
	}

	/**
	 * @notice Liquidates positions of Party B with respect to Party A using the provided quote price signature.
	 * @dev This function can only be called by accounts with the LIQUIDATOR_ROLE role.
	 * @param partyB The address of Party B whose positions are being liquidated.
	 * @param partyA The address of Party A related to the liquidation.
	 * @param priceSig The signature containing the quote price data.
	 */
	function liquidatePositionsPartyB(
		address partyB,
		address partyA,
		QuotePriceSig memory priceSig
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
		(uint256[] memory liquidatedAmounts, uint256[] memory closeIds) = LiquidationFacetImpl.liquidatePositionsPartyB(partyB, partyA, priceSig);
		emit LiquidatePositionsPartyB(msg.sender, partyB, partyA, priceSig.quoteIds, liquidatedAmounts, closeIds);
		if (QuoteStorage.layout().partyBPositionsCount[partyB][partyA] == 0) {
			emit FullyLiquidatedPartyB(partyB, partyA);
		}
	}
}
