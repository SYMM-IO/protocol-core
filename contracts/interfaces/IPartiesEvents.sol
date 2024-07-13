// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/QuoteStorage.sol";

interface IPartiesEvents {
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
		uint256 lf,
		uint256 partyAmm,
		uint256 partyBmm,
		uint256 tradingFee,
		uint256 deadline
	);

	event ExpireQuoteOpen(QuoteStatus quoteStatus, uint256 quoteId);

	event ExpireQuoteClose(QuoteStatus quoteStatus, uint256 quoteId, uint256 closeId);

	event LiquidatePartyB(address liquidator, address partyB, address partyA, uint256 partyBAllocatedBalance, int256 upnl);

	event SettleUpnl(uint256[] quoteIds, uint256[] newPrices, address[] partyBs, address partyA);
}
