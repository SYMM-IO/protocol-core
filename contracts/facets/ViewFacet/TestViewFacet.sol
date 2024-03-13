// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/LibLockedValues.sol";
import "../../libraries/LibQuote.sol";
import "../../libraries/LibMuon.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/MAStorage.sol";
import "../../storages/QuoteStorage.sol";
import "../../storages/GlobalAppStorage.sol";
import "../../storages/SymbolStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../libraries/LibLockedValues.sol";

contract TestViewFacet {
    using LockedValuesOps for LockedValues;


//    function getPartyAOpenPositions(address partyA, uint256 start, uint256 size) external view returns (Quote[] memory) {
//        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
//        if (quoteLayout.partyAOpenPositions[partyA].length < start + size) {
//            size = quoteLayout.partyAOpenPositions[partyA].length - start;
//        }
//        Quote[] memory quotes = new Quote[](size);
//        for (uint256 i = start; i < start + size; i++) {
//            quotes[i - start] = quoteLayout.quotes[quoteLayout.partyAOpenPositions[partyA][i]];
//        }
//        return quotes;
//    }

    function getPartyBOpenPositionsWithPartyA(
        address partyB,
        address partyA,
        uint256 start,
        uint256 size
    ) external view returns (Quote[] memory quotes) {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        if (quoteLayout.partyBOpenPositions[partyB][partyA].length < start + size) {
            size = quoteLayout.partyBOpenPositions[partyB][partyA].length - start;
        }
        quotes = new Quote[](size);
        for (uint256 i = start; i < start + size; i++) {
            quotes[i - start] = quoteLayout.quotes[quoteLayout.partyBOpenPositions[partyB][partyA][i]];
        }
    }

    function getPositionsFilteredByPartyB(address partyB, uint256 start, uint256 size) external view returns (Quote[] memory) {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        Quote[] memory quotes = new Quote[](size);
        uint j = 0;
        for (uint256 i = start; i < start + size; i++) {
            Quote memory quote = quoteLayout.quotes[i];
            if (quote.partyB == partyB) {
                quotes[j] = quote;
                j += 1;
            }
        }
        return quotes;
    }

    function getOpenPositionsFilteredByPartyB(address partyB, uint256 start, uint256 size) external view returns (Quote[] memory) {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        Quote[] memory quotes = new Quote[](size);
        uint j = 0;
        for (uint256 i = start; i < start + size; i++) {
            Quote memory quote = quoteLayout.quotes[i];
            if (
                quote.partyB == partyB &&
                (quote.quoteStatus == QuoteStatus.OPENED ||
                quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
                    quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING)
            ) {
                quotes[j] = quote;
                j += 1;
            }
        }
        return quotes;
    }

    function getActivePositionsFilteredByPartyB(address partyB, uint256 start, uint256 size) external view returns (Quote[] memory) {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        Quote[] memory quotes = new Quote[](size);
        uint j = 0;
        for (uint256 i = start; i < start + size; i++) {
            Quote memory quote = quoteLayout.quotes[i];
            if (
                quote.partyB == partyB &&
                quote.quoteStatus != QuoteStatus.CANCELED &&
                quote.quoteStatus != QuoteStatus.CLOSED &&
                quote.quoteStatus != QuoteStatus.EXPIRED &&
                quote.quoteStatus != QuoteStatus.LIQUIDATED
            ) {
                quotes[j] = quote;
                j += 1;
            }
        }
        return quotes;
    }

    function countPartyBOpenPositionsWithPartyA(address partyB, address partyA) external view returns (uint256 count) {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();

        count = quoteLayout.partyBOpenPositions[partyB][partyA].length;
    }


    function countPartyBPendingQuotesWithPartyA(address partyB, address partyA) external view returns (uint256 count) {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();

        count = quoteLayout.partyBPendingQuotes[partyB][partyA].length;
    }

    function getPartyBPendingQuotesWithPartyA(
        address partyB,
        address partyA,
        uint256 start,
        uint256 size
    ) external view returns (Quote[] memory quotes) {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        if (quoteLayout.partyBPendingQuotes[partyB][partyA].length < start + size) {
            size = quoteLayout.partyBPendingQuotes[partyB][partyA].length - start;
        }
        quotes = new Quote[](size);
        for (uint256 i = start; i < start + size; i++) {
            quotes[i - start] = quoteLayout.quotes[quoteLayout.partyBPendingQuotes[partyB][partyA][i]];
        }
    }

    function getPositionsFilteredByPartyB(
        address partyB,
        uint256 cursor,
        uint256 maxPageSize,
        uint256 gasNeededForReturn,
        uint256 gasCostForQuoteMemLoad
    ) external view returns (Quote[] memory quotes, uint256 retCursor) {
        QuoteStorage.Layout storage qL = QuoteStorage.layout();
        uint256 end = qL.lastId;
        retCursor = cursor;

        uint256[] memory cache = new uint256[](maxPageSize);
        uint256 cacheSize = 0;
        do {
            // Filter by partyB
            if (qL.quotes[retCursor].partyB == partyB) {
                cache[cacheSize] = retCursor;
                ++cacheSize;
                if (cacheSize == maxPageSize) {
                    ++retCursor;
                    break;
                }
            }
            ++retCursor;
        }
        while (retCursor < end && gasleft() > gasNeededForReturn + gasCostForQuoteMemLoad * cacheSize);

        if (retCursor == end) {
            retCursor = type(uint256).max;
        }

        quotes = new Quote[](cacheSize);
        for (uint256 i = 0; i < cacheSize; ++i) {
            quotes[i] = qL.quotes[cache[i]];
        }
    }

    function getPositionsFilteredByStatus(
        uint256 statusMask,
        uint256 cursor,
        uint256 maxPageSize,
        uint256 gasNeededForReturn,
        uint256 gasCostForQuoteMemLoad
    ) external view returns (Quote[] memory quotes, uint256 retCursor) {
        QuoteStorage.Layout storage qL = QuoteStorage.layout();
        uint256 end = qL.lastId;
        retCursor = cursor;

        uint256[] memory cache = new uint256[](maxPageSize);
        uint256 cacheSize = 0;
        do {
            // Filter by statusMask
            if (((1 << uint256(qL.quotes[retCursor].quoteStatus)) & statusMask) > 0) {
                cache[cacheSize] = retCursor;
                ++cacheSize;
                if (cacheSize == maxPageSize) {
                    ++retCursor;
                    break;
                }
            }
            ++retCursor;
        }
        while (retCursor < end && gasleft() > gasNeededForReturn + gasCostForQuoteMemLoad * cacheSize);

        if (retCursor == end) {
            retCursor = type(uint256).max;
        }

        quotes = new Quote[](cacheSize);
        for (uint256 i = 0; i < cacheSize; ++i) {
            quotes[i] = qL.quotes[cache[i]];
        }
    }

    function getPositionsFilteredByPartyBAndStatus(
        address partyB,
        uint256 statusMask,
        uint256 cursor,
        uint256 maxPageSize,
        uint256 gasNeededForReturn,
        uint256 gasCostForQuoteMemLoad
    ) external view returns (Quote[] memory quotes, uint256 retCursor) {
        QuoteStorage.Layout storage qL = QuoteStorage.layout();
        uint256 end = qL.lastId;
        retCursor = cursor;

        uint256[] memory cache = new uint256[](maxPageSize);
        uint256 cacheSize = 0;
        do {
            Quote storage q = qL.quotes[retCursor];
            // Filter by partyB and statusMask
            if (q.partyB == partyB && ((1 << uint256(q.quoteStatus)) & statusMask) > 0) {
                cache[cacheSize] = retCursor;
                ++cacheSize;
                if (cacheSize == maxPageSize) {
                    ++retCursor;
                    break;
                }
            }
            ++retCursor;
        }
        while (retCursor < end && gasleft() > gasNeededForReturn + gasCostForQuoteMemLoad * cacheSize);

        if (retCursor == end) {
            retCursor = type(uint256).max;
        }

        quotes = new Quote[](cacheSize);
        for (uint256 i = 0; i < cacheSize; ++i) {
            quotes[i] = qL.quotes[cache[i]];
        }
    }
}
