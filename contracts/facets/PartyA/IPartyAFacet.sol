// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./IPartyAEvents.sol";
import "../../storages/MuonStorage.sol";

interface IPartyAFacet is IPartyAEvents {
	function sendQuote(
		address[] memory partyBsWhiteList,
		uint256 symbolId,
		PositionType positionType,
		OrderType orderType,
		uint256 price,
		uint256 quantity,
		uint256 cva,
		uint256 lf,
		uint256 partyAmm,
		uint256 partyBmm,
		uint256 maxFundingRate,
		uint256 deadline,
		SingleUpnlAndPriceSig memory upnlSig
	) external;

	function expireQuote(uint256[] memory expiredQuoteIds) external;

	function requestToCancelQuote(uint256 quoteId) external;

	function requestToClosePosition(uint256 quoteId, uint256 closePrice, uint256 quantityToClose, OrderType orderType, uint256 deadline) external;

	function requestToCancelCloseRequest(uint256 quoteId) external;

	function forceCancelQuote(uint256 quoteId) external;

	function forceCancelCloseRequest(uint256 quoteId) external;

	function forceClosePosition(uint256 quoteId, HighLowPriceSig memory sig) external;
}
