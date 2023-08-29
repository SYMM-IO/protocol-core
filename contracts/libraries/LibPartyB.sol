// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/QuoteStorage.sol";
import "../storages/MAStorage.sol";
import "../storages/QuoteStorage.sol";
import "./LibAccount.sol";
import "./LibLockedValues.sol";

library LibPartyB {
    using LockedValuesOps for LockedValues;

    function checkPartyBValidationToLockQuote(uint256 quoteId, int256 upnl) internal view {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        MAStorage.Layout storage maLayout = MAStorage.layout();

        Quote storage quote = quoteLayout.quotes[quoteId];
        require(quote.quoteStatus == QuoteStatus.PENDING, "PartyBFacet: Invalid state");
        require(block.timestamp <= quote.deadline, "PartyBFacet: Quote is expired");
        require(quoteId <= quoteLayout.lastId, "PartyBFacet: Invalid quoteId");
        int256 availableBalance = LibAccount.partyBAvailableForQuote(
            upnl,
            msg.sender,
            quote.partyA
        );
        require(availableBalance >= 0, "PartyBFacet: Available balance is lower than zero");
        require(
            uint256(availableBalance) >= quote.lockedValues.total(),
            "PartyBFacet: insufficient available balance"
        );
        require(
            !maLayout.partyBLiquidationStatus[msg.sender][quote.partyA],
            "PartyBFacet: PartyB isn't solvent"
        );
        bool isValidPartyB;
        if (quote.partyBsWhiteList.length == 0) {
            require(msg.sender != quote.partyA, "PartyBFacet: PartyA can't be partyB too");
            isValidPartyB = true;
        } else {
            for (uint8 index = 0; index < quote.partyBsWhiteList.length; index++) {
                if (msg.sender == quote.partyBsWhiteList[index]) {
                    isValidPartyB = true;
                    break;
                }
            }
        }
        require(isValidPartyB, "PartyBFacet: Sender isn't whitelisted");
    }
}
