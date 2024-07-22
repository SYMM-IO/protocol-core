// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/QuoteStorage.sol";
import "../../interfaces/IPartiesEvents.sol";

interface IOracleLessActionsEvents is IPartiesEvents {
	event BindToPartyB(address partyA, address partyB);
	event UnbindFromPartyB(address partyA, address partyB);
	event OpenPositions(uint256[] quoteIds, address partyA, address partyB, uint256[] filledAmounts, uint256[] openedPrices);
	event LockQuotes(address partyB, uint256[] quoteIds);
	event FillCloseRequests(
		uint256[] quoteIds,
		address partyA,
		address partyB,
		uint256[] filledAmounts,
		uint256[] closedPrices,
		QuoteStatus[] quoteStatuses,
		uint256[] closeIds
	);
	event AcceptCancelRequest(uint256 quoteId, QuoteStatus quoteStatus);
}
