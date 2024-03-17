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
			liquidationSig.totalUnrealizedLoss,
			liquidationSig.liquidationId
		);
	}

	function setSymbolsPrice(
		address partyA,
		LiquidationSig memory liquidationSig
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
		LiquidationFacetImpl.setSymbolsPrice(partyA, liquidationSig);
		emit SetSymbolsPrices(msg.sender, partyA, liquidationSig.symbolIds, liquidationSig.prices, liquidationSig.liquidationId);
	}

	function liquidatePendingPositionsPartyA(address partyA) external whenNotLiquidationPaused onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		uint256[] memory pendingQuotes = quoteLayout.partyAPendingQuotes[partyA];
		(uint256[] memory liquidatedAmounts, bytes memory liquidationId) = LiquidationFacetImpl.liquidatePendingPositionsPartyA(partyA);
		emit LiquidatePendingPositionsPartyA(msg.sender, partyA, pendingQuotes, liquidatedAmounts, liquidationId);
	}

	function liquidatePositionsPartyA(
		address partyA,
		uint256[] memory quoteIds
	) external whenNotLiquidationPaused onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
		(bool disputed, uint256[] memory liquidatedAmounts, uint256[] memory closeIds, bytes memory liquidationId) = LiquidationFacetImpl.liquidatePositionsPartyA(
			partyA,
			quoteIds
		);
		emit LiquidatePositionsPartyA(msg.sender, partyA, quoteIds, liquidatedAmounts, closeIds, liquidationId);
		if (disputed) {
			emit LiquidationDisputed(partyA, liquidationId);
		}
	}

	function settlePartyALiquidation(address partyA, address[] memory partyBs) external whenNotLiquidationPaused {
		(int256[] memory settleAmounts, bytes memory liquidationId) = LiquidationFacetImpl.settlePartyALiquidation(partyA, partyBs);
		emit SettlePartyALiquidation(partyA, partyBs, settleAmounts, liquidationId);
		if (MAStorage.layout().liquidationStatus[partyA] == false) {
			emit FullyLiquidatedPartyA(partyA, liquidationId);
		}
	}

	function resolveLiquidationDispute(
		address partyA,
		address[] memory partyBs,
		int256[] memory amounts,
		bool disputed
	) external onlyRole(LibAccessibility.DISPUTE_ROLE) {
		bytes memory liquidationId = LiquidationFacetImpl.resolveLiquidationDispute(partyA, partyBs, amounts, disputed);
		emit ResolveLiquidationDispute(partyA, partyBs, amounts, disputed, liquidationId);
	}

	function liquidatePartyB(
		address partyB,
		address partyA,
		SingleUpnlSig memory upnlSig
	) external whenNotLiquidationPaused notLiquidatedPartyB(partyB, partyA) notLiquidatedPartyA(partyA) onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
		emit LiquidatePartyB(msg.sender, partyB, partyA, AccountStorage.layout().partyBAllocatedBalances[partyB][partyA], upnlSig.upnl);
		LiquidationFacetImpl.liquidatePartyB(partyB, partyA, upnlSig);
	}

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
