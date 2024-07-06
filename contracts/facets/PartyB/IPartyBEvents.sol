// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/QuoteStorage.sol";
import "../../interfaces/IPartiesEvents.sol";

interface IPartyBEvents is IPartiesEvents {
	event LockQuote(address partyB, uint256 quoteId);
	event AllocatePartyB(address partyB, address partyA, uint256 amount);
	event UnlockQuote(address partyB, uint256 quoteId, QuoteStatus quoteStatus);
	event AcceptCancelRequest(uint256 quoteId, QuoteStatus quoteStatus);
	event OpenPosition(uint256 quoteId, address partyA, address partyB, uint256 filledAmount, uint256 openedPrice);
	event FillCloseRequest(
		uint256 quoteId,
		address partyA,
		address partyB,
		uint256 filledAmount,
		uint256 closedPrice,
		QuoteStatus quoteStatus,
		uint256 closeId
	);
	event AcceptCancelCloseRequest(uint256 quoteId, QuoteStatus quoteStatus, uint256 closeId);
	event EmergencyClosePosition(
		uint256 quoteId,
		address partyA,
		address partyB,
		uint256 filledAmount,
		uint256 closedPrice,
		QuoteStatus quoteStatus,
		uint256 closeId
	);
	event SettleUpnl(
		uint256[] quoteIds,
		uint256[] newPrices,
		address partyB,
		address partyA
	);
}
