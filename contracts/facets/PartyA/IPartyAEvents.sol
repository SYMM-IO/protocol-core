// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/QuoteStorage.sol";
import "../../interfaces/IPartiesEvents.sol";

interface IPartyAEvents is IPartiesEvents {
	event RequestToCancelQuote(address partyA, address partyB, QuoteStatus quoteStatus, uint256 quoteId);
	event RequestToClosePosition(
		address partyA,
		address partyB,
		uint256 quoteId,
		uint256 closePrice,
		uint256 quantityToClose,
		OrderType orderType,
		uint256 deadline,
		QuoteStatus quoteStatus,
		uint256 closeId
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
	); // For backward compatibility, will be removed in future
	event RequestToCancelCloseRequest(address partyA, address partyB, uint256 quoteId, QuoteStatus quoteStatus, uint256 closeId);
	event RequestToCancelCloseRequest(address partyA, address partyB, uint256 quoteId, QuoteStatus quoteStatus); // For backward compatibility, will be removed in future
}
