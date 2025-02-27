// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./LibMuon.sol";

library LibMuonPartyB {
	function verifyPairUpnlAndPrice(PairUpnlAndPriceSig memory upnlSig, address partyB, address partyA, uint256 symbolId) internal view {
		MuonStorage.Layout storage muonLayout = MuonStorage.layout();
		// == SignatureCheck( ==
		require(block.timestamp <= upnlSig.timestamp + muonLayout.upnlValidTime, "LibMuon: Expired signature");
		// == ) ==
		bytes32 hash = keccak256(
			abi.encodePacked(
				muonLayout.muonAppId,
				upnlSig.reqId,
				address(this),
				partyB,
				partyA,
				AccountStorage.layout().partyBNonces[partyB][partyA],
				AccountStorage.layout().partyANonces[partyA],
				upnlSig.upnlPartyB,
				upnlSig.upnlPartyA,
				symbolId,
				upnlSig.price,
				upnlSig.timestamp,
				LibMuon.getChainId()
			)
		);
		LibMuon.verifyTSSAndGateway(hash, upnlSig.sigs, upnlSig.gatewaySignature);
	}

	function verifyPartyBUpnl(SingleUpnlSig memory upnlSig, address partyB, address partyA) internal view {
		LibMuon.verifyPartyBUpnl(upnlSig, partyB, partyA);
	}
}
