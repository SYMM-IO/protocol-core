// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/muon/LibMuonSettlement.sol";
import "../../libraries/LibSettlement.sol";

library SettlementFacetImpl {
	function settleUpnl(SettlementSig memory settleSig, uint256[] memory updatedPrices, address partyA) internal {
		LibMuonSettlement.verifySettlement(settleSig, partyA);
		LibSettlement.settleUpnl(settleSig, updatedPrices, partyA, false);
	}
}
