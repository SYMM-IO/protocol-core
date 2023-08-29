// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/QuoteStorage.sol";

interface IPartyAEvents {
    event SendQuote(
        address partyA,
        uint256 quoteId,
        address[] partyBsWhiteList,
        uint256 symbolId,
        PositionType positionType,
        OrderType orderType,
        uint256 price,
        uint256 marketPrice,
        uint256 quantity,
        uint256 cva,
        uint256 mm,
        uint256 lf,
        uint256 maxFundingRate,
        uint256 deadline,
        QuoteStatus quoteStatus
    );

    event ExpireQuote(QuoteStatus quoteStatus, uint256 quoteId);
    event RequestToCancelQuote(
        address partyA,
        address partyB,
        QuoteStatus quoteStatus,
        uint256 quoteId
    );

    event RequestToClosePosition(
        address partyA,
        address partyB,
        uint256 quoteId,
        uint256 closePrice,
        uint256 quantityToClose,
        OrderType orderType,
        uint256 deadline,
        QuoteStatus quoteStatus
    );

    event RequestToCancelCloseRequest(
        address partyA,
        address partyB,
        uint256 quoteId,
        QuoteStatus quoteStatus
    );

    event ForceCancelQuote(uint256 quoteId, QuoteStatus quoteStatus);

    event ForceCancelCloseRequest(uint256 quoteId, QuoteStatus quoteStatus);

    event ForceClosePosition(
        uint256 quoteId,
        address partyA,
        address partyB,
        uint256 filledAmount,
        uint256 closedPrice,
        QuoteStatus quoteStatus
    );
}
