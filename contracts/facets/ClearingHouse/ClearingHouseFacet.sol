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
    function liquidatePartyB(
        address partyB,
        ClearingHouseLiquidation memory liquidationSig
    ) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
        ClearingHouseFacetImpl.liquidatePartyB(partyB, liquidationSig);

        emit LiquidatePartyBClearingHouse(
            msg.sender,
            partyB,
            liquidationSig.liquidationId,
            liquidationSig.upnl,
            liquidationSig.totalUnrealizedLoss,
            liquidationSig.timestamp
        );
    }

    /**
     * @notice Deallocates PartyB balance for liquidation purposes.
     */
    function deallocateForLiquidation(
        address partyB,
        address partyA,
        uint256 amount
    ) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
        ClearingHouseFacetImpl.deallocateForLiquidation(partyB, partyA, amount);
        emit DeallocateForLiquidation(partyB, partyA, amount);
    }

    /**
     * @notice Transfers assets to PartyA during liquidation.
     */
    function transferToPartyA(
        address partyB,
        address partyA,
        uint256 amount
    ) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
        ClearingHouseFacetImpl.transferToPartyA(partyB, partyA, amount);
        emit TransferToPartyA(partyB, partyA, amount);
    }

    /**
     * @notice Transfers liquidation fee to liquidator (msg.sender).
     */
    function transferToLiquidator(
        address partyB,
        uint256 liquidatorShare
    ) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
        ClearingHouseFacetImpl.transferToLiquidator(partyB, liquidatorShare);
        emit TransferToLiquidator(partyB, msg.sender, liquidatorShare);
    }

    /**
     * @notice Liquidates all pending quotes from PartyB to PartyA.
     */
    function liquidatePendingQuotes(
        address partyB,
        address partyA
    ) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
        ClearingHouseFacetImpl.liquidatePendingQuotes(partyB, partyA);
        emit LiquidatePendingQuotes(partyB, partyA);
    }

    /**
     * @notice Liquidates active positions of PartyB with PartyA.
     */
    function liquidatePositionsPartyB(
        address partyB,
        address partyA,
        QuotePriceSig memory priceSig
    ) external whenNotLiquidationPaused onlyRole(LibAccessibility.CLEARING_HOUSE_ROLE) {
        (uint256[] memory liquidatedAmounts, uint256[] memory closeIds) = ClearingHouseFacetImpl.liquidatePositionsPartyB(
            partyB,
            partyA,
            priceSig
        );
        emit LiquidatePositionsPartyB(partyB, partyA, priceSig.quoteIds, liquidatedAmounts, closeIds);
    }
}
