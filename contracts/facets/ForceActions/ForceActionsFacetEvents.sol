// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/MuonStorage.sol";
import "../../storages/QuoteStorage.sol";

interface ForceActionsFacetEvents {
	event ForceCancelQuote(uint256 quoteId, QuoteStatus quoteStatus);
	event ForceCancelCloseRequest(uint256 quoteId, QuoteStatus quoteStatus, uint256 closeId);
	event ForceCancelCloseRequest(uint256 quoteId, QuoteStatus quoteStatus); // For backward compatibility, will be removed in future
	event ForceClosePosition(
		uint256 quoteId,
		address partyA,
		address partyB,
		uint256 filledAmount,
		uint256 closedPrice,
		QuoteStatus quoteStatus,
		uint256 closeId
	);
	event ForceClosePosition(
        uint256 quoteId,
        address partyA,
        address partyB,
        uint256 filledAmount,
        uint256 closedPrice,
        QuoteStatus quoteStatus
    ); // For backward compatibility, will be removed in future
}
