// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/MAStorage.sol";
import "../storages/AccountStorage.sol";
import "../storages/QuoteStorage.sol";
import "../libraries/LibAccessibility.sol";

abstract contract Accessibility {
    modifier onlyPartyB() {
        require(MAStorage.layout().partyBStatus[msg.sender], "Accessibility: Should be partyB");
        _;
    }

    modifier notPartyB() {
        require(!MAStorage.layout().partyBStatus[msg.sender], "Accessibility: Shouldn't be partyB");
        _;
    }

    modifier onlyRole(bytes32 role) {
        require(LibAccessibility.hasRole(msg.sender, role), "Accessibility: Must has role");
        _;
    }

    modifier notLiquidatedPartyA(address partyA) {
        require(
            !MAStorage.layout().liquidationStatus[partyA],
            "Accessibility: PartyA isn't solvent"
        );
        _;
    }

    modifier notLiquidatedPartyB(address partyB, address partyA) {
        require(
            !MAStorage.layout().partyBLiquidationStatus[partyB][partyA],
            "Accessibility: PartyB isn't solvent"
        );
        _;
    }

    modifier notLiquidated(uint256 quoteId) {
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        require(
            !MAStorage.layout().liquidationStatus[quote.partyA],
            "Accessibility: PartyA isn't solvent"
        );
        require(
            !MAStorage.layout().partyBLiquidationStatus[quote.partyB][quote.partyA],
            "Accessibility: PartyB isn't solvent"
        );
        require(
            quote.quoteStatus != QuoteStatus.LIQUIDATED && quote.quoteStatus != QuoteStatus.CLOSED,
            "Accessibility: Invalid state"
        );
        _;
    }

    modifier onlyPartyAOfQuote(uint256 quoteId) {
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        require(quote.partyA == msg.sender, "Accessibility: Should be partyA of quote");
        _;
    }

    modifier onlyPartyBOfQuote(uint256 quoteId) {
        Quote storage quote = QuoteStorage.layout().quotes[quoteId];
        require(quote.partyB == msg.sender, "Accessibility: Should be partyB of quote");
        _;
    }

    modifier notSuspended(address user) {
        require(
            !AccountStorage.layout().suspendedAddresses[user],
            "Accessibility: Sender is Suspended"
        );
        _;
    }
}
