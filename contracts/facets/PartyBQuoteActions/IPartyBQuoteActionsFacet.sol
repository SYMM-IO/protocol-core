// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./IPartyBQuoteActionsEvents.sol";

interface IPartyBQuoteActionsFacet is IPartyBQuoteActionsEvents {
	function lockQuote(uint256 quoteId, SingleUpnlSig memory upnlSig) external;

	function unlockQuote(uint256 quoteId) external;

	function acceptCancelRequest(uint256 quoteId) external;
}
