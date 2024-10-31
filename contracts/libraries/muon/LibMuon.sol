// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../LibMuonV04ClientBase.sol";
import "../../storages/MuonStorage.sol";
import "../../storages/AccountStorage.sol";

library LibMuon {
	using ECDSA for bytes32;

	function getChainId() internal view returns (uint256 id) {
		assembly {
			id := chainid()
		}
	}

	// CONTEXT for commented out lines
	// We're utilizing muon signatures for asset pricing and user uPNLs calculations.
	// Even though these signatures are necessary for full testing of the system, particularly when invoking various methods.
	// The process of creating automated functional signature for tests has proven to be either impractical or excessively time-consuming. therefore, we've established commenting out the necessary code as a workaround specifically for testing.
	// Essentially, during testing, we temporarily disable the code sections responsible for validating these signatures. The sections I'm referring to are located within the LibMuon file. Specifically, the body of the 'verifyTSSAndGateway' method is a prime candidate for temporary disablement. In addition, several 'require' statements within other functions of this file, which examine the signatures' expiration status, also need to be temporarily disabled.
	// However, it is crucial to note that these lines should not be disabled in the production deployed version.
	// We emphasize this because they are only disabled for testing purposes.
	function verifyTSSAndGateway(bytes32 hash, SchnorrSign memory sign, bytes memory gatewaySignature) internal view {
		// == SignatureCheck( ==
		bool verified = LibMuonV04ClientBase.muonVerify(uint256(hash), sign, MuonStorage.layout().muonPublicKey);
		require(verified, "LibMuon: TSS not verified");

		hash = hash.toEthSignedMessageHash();
		address gatewaySignatureSigner = hash.recover(gatewaySignature);

		require(gatewaySignatureSigner == MuonStorage.layout().validGateway, "LibMuon: Gateway is not valid");
		// == ) ==
	}

	// Used in PartyB/Account/Liquidation
	function verifyPartyBUpnl(SingleUpnlSig memory upnlSig, address partyB, address partyA) internal view {
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
				upnlSig.upnl,
				upnlSig.timestamp,
				getChainId()
			)
		);
		verifyTSSAndGateway(hash, upnlSig.sigs, upnlSig.gatewaySignature);
	}
}
