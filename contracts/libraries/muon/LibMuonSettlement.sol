// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/MuonStorage.sol";
import "../../storages/AccountStorage.sol";
import "./LibMuon.sol";

library LibMuonSettlement {
	function verifySettlement(SettlementSig memory settleSig, address partyA) internal view {
		MuonStorage.Layout storage muonLayout = MuonStorage.layout();
		// == SignatureCheck( ==
		require(block.timestamp <= settleSig.timestamp + muonLayout.upnlValidTime, "LibMuon: Expired signature");
		// == ) ==
		bytes memory encodedData;
		uint256[] memory nonces = new uint256[](settleSig.quotesSettlementsData.length);
		for (uint256 i = 0; i < settleSig.quotesSettlementsData.length; i++) {
			nonces[i] = AccountStorage.layout().partyBNonces[QuoteStorage.layout().quotes[settleSig.quotesSettlementsData[i].quoteId].partyB][partyA];
			encodedData = abi.encodePacked(
				encodedData,  // Append the previously encoded data
				settleSig.quotesSettlementsData[i].quoteId,
				settleSig.quotesSettlementsData[i].currentPrice,
				settleSig.quotesSettlementsData[i].partyBUpnlIndex
			);
		}
		bytes32 hash = keccak256(
			abi.encodePacked(
				muonLayout.muonAppId,
				settleSig.reqId,
				address(this),
				"verifySettlement",
				nonces,
				AccountStorage.layout().partyANonces[partyA],
				encodedData,
				settleSig.upnlPartyBs,
				settleSig.upnlPartyA,
				settleSig.timestamp,
				LibMuon.getChainId()
			)
		);
		LibMuon.verifyTSSAndGateway(hash, settleSig.sigs, settleSig.gatewaySignature);
	}
}
