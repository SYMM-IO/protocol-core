// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../utils/Pausable.sol";
import "../../utils/Accessibility.sol";
import "./ILiquidationEvents.sol";
import "./LiquidationFacetImpl.sol";

contract LiquidationFacet is Pausable, Accessibility, ILiquidationEvents {
    function liquidatePartyA(
        address partyA,
        LiquidationSig memory liquidationSig
    )
    external
    whenNotLiquidationPaused
    notLiquidatedPartyA(partyA)
    onlyRole(LibAccessibility.LIQUIDATOR_ROLE)
    {
        LiquidationFacetImpl.liquidatePartyA(partyA, liquidationSig);
        emit LiquidatePartyA(msg.sender, partyA);
    }

    function setSymbolsPrice(
        address partyA,
        LiquidationSig memory liquidationSig
    ) external whenNotLiquidationPaused onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
        LiquidationFacetImpl.setSymbolsPrice(partyA, liquidationSig);
        emit SetSymbolsPrices(msg.sender, partyA, liquidationSig.symbolIds, liquidationSig.prices);
    }

    function liquidatePendingPositionsPartyA(
        address partyA
    ) external whenNotLiquidationPaused onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
        LiquidationFacetImpl.liquidatePendingPositionsPartyA(partyA);
        emit LiquidatePendingPositionsPartyA(msg.sender, partyA);
    }

    function liquidatePositionsPartyA(
        address partyA,
        uint256[] memory quoteIds
    ) external whenNotLiquidationPaused onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
        bool isSuccessful = LiquidationFacetImpl.liquidatePositionsPartyA(partyA, quoteIds);
        emit LiquidatePositionsPartyA(msg.sender, partyA, quoteIds);
        if (!isSuccessful) {
            emit DisputeForLiquidation(msg.sender, partyA);
        } else if (
            QuoteStorage.layout().partyAPositionsCount[partyA] == 0 &&
            QuoteStorage.layout().partyAPendingQuotes[partyA].length == 0
        ) {
            emit FullyLiquidatedPartyA(partyA);
        }
    }

    function liquidatePartyB(
        address partyB,
        address partyA,
        SingleUpnlSig memory upnlSig
    )
    external
    whenNotLiquidationPaused
    notLiquidatedPartyB(partyB, partyA)
    notLiquidatedPartyA(partyA)
    onlyRole(LibAccessibility.LIQUIDATOR_ROLE)
    {
        LiquidationFacetImpl.liquidatePartyB(partyB, partyA, upnlSig);
        emit LiquidatePartyB(msg.sender, partyB, partyA);
    }

    function liquidatePositionsPartyB(
        address partyB,
        address partyA,
        QuotePriceSig memory priceSig
    ) external whenNotLiquidationPaused onlyRole(LibAccessibility.LIQUIDATOR_ROLE) {
        LiquidationFacetImpl.liquidatePositionsPartyB(partyB, partyA, priceSig);
        emit LiquidatePositionsPartyB(msg.sender, partyB, partyA, priceSig.quoteIds);
        if (QuoteStorage.layout().partyBPositionsCount[partyB][partyA] == 0) {
            emit FullyLiquidatedPartyB(partyB, partyA);
        }
    }
}
