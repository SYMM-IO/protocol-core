// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/MuonStorage.sol";
import "../../storages/AccountStorage.sol";
import "./LibMuon.sol";

library LibMuonForceActions {
	function verifyHighLowPrice(HighLowPriceSig memory sig, address partyB, address partyA, uint256 symbolId) internal view {
		MuonStorage.Layout storage muonLayout = MuonStorage.layout();
		// == SignatureCheck( ==
		require(block.timestamp <= sig.timestamp + muonLayout.upnlValidTime, "LibMuon: Expired signature");
		// == ) ==
		bytes32 hash = keccak256(
			abi.encodePacked(
				muonLayout.muonAppId,
				sig.reqId,
				address(this),
				partyB,
				partyA,
				AccountStorage.layout().partyBNonces[partyB][partyA],
				AccountStorage.layout().partyANonces[partyA],
				sig.upnlPartyB,
				sig.upnlPartyA,
				symbolId,
				sig.currentPrice,
				sig.startTime,
				sig.endTime,
				sig.lowest,
				sig.highest,
				sig.averagePrice,
				sig.timestamp,
				LibMuon.getChainId()
			)
		);
		LibMuon.verifyTSSAndGateway(hash, sig.sigs, sig.gatewaySignature);
	}
}
