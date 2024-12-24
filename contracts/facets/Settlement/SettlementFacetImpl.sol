// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/muon/LibMuonSettlement.sol";
import "../../libraries/LibSettlement.sol";
import "../../facets/PartyBBatchActions/PartyBBatchActionsFacetImpl.sol";

library SettlementFacetImpl {
	function settleUpnl(
		SettlementSig memory settleSig,
		uint256[] memory updatedPrices,
		address partyA
	) internal returns (uint256[] memory newPartyBsAllocatedBalances) {
		LibMuonSettlement.verifySettlement(settleSig, partyA);
		return LibSettlement.settleUpnl(settleSig, updatedPrices, partyA, false);
	}

	function settleUpnlAndFillCloseRequests(
		SettlementSig memory settleSig,
		uint256[] memory updatedPrices,
		address partyA,
		uint256[] memory quoteIds,
		uint256[] memory filledAmounts,
		uint256[] memory closedPrices,
		PairUpnlAndPricesSig memory upnlSig
	) internal returns (uint256[] memory newPartyBsAllocatedBalances, QuoteStatus[] memory quoteStatuses, uint256[] memory closeIds) {
		LibMuonSettlement.verifySettlement(settleSig, partyA);
		newPartyBsAllocatedBalances = LibSettlement.settleUpnl(settleSig, updatedPrices, partyA, false);
		(quoteStatuses, closeIds) = PartyBBatchActionsFacetImpl.fillCloseRequests(quoteIds, filledAmounts, closedPrices, upnlSig);
	}
}
