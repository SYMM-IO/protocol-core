// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license

pragma solidity >=0.8.18;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "./LibMuonV04ClientBase.sol";
import "./IMuonSignatureVerifier.sol";

contract MuonSignatureVerifier is IMuonSignatureVerifier, AccessControlEnumerable {
	using ECDSA for bytes32;

	bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");

	event PublicKeyAdded(uint256 x, uint8 parity);
	event PublicKeyRemoved(uint256 x, uint8 parity);
	event GatewaySignerAdded(address signer);
	event GatewaySignerRemoved(address signer);

	PublicKey[] public publicKeys;
	address[] public gatewaySigners;

	constructor(address _admin) {
		_setupRole(DEFAULT_ADMIN_ROLE, _admin);
		_setupRole(SETTER_ROLE, _admin);
	}

	// === Signature Verification ===
	function verify(bytes32 hash, SchnorrSign memory sign, bytes memory gatewaySignature) external view {
		// Verify TSS via Muon
		bool verifiedTSS = false;
		for (uint256 i = 0; i < publicKeys.length; i++) {
			if (LibMuonV04ClientBase.muonVerify(uint256(hash), sign, publicKeys[i])) {
				verifiedTSS = true;
				break;
			}
		}
		require(verifiedTSS, "MuonSignatureVerifier: TSS not verified");

		// Verify Gateway Signature
		address signer = hash.toEthSignedMessageHash().recover(gatewaySignature);
		bool gatewayVerified = false;
		for (uint256 i = 0; i < gatewaySigners.length; i++) {
			if (signer == gatewaySigners[i]) {
				gatewayVerified = true;
				break;
			}
		}
		require(gatewayVerified, "MuonSignatureVerifier: Gateway is not valid");
	}

	// === Public Key Management ===
	function addPublicKey(PublicKey memory pubKey) external onlyRole(SETTER_ROLE) {
		publicKeys.push(pubKey);
		emit PublicKeyAdded(pubKey.x, pubKey.parity);
	}

	function removePublicKey(PublicKey memory pubKey) external onlyRole(SETTER_ROLE) {
		for (uint256 i = 0; i < publicKeys.length; i++) {
			if (publicKeys[i].x == pubKey.x && publicKeys[i].parity == pubKey.parity) {
				publicKeys[i] = publicKeys[publicKeys.length - 1];
				publicKeys.pop();
				break;
			}
		}
		emit PublicKeyRemoved(pubKey.x, pubKey.parity);
	}

	function getAllPublicKeys() external view returns (PublicKey[] memory) {
		return publicKeys;
	}

	// === Gateway Signer Management ===
	function addGatewaySigner(address signer) external onlyRole(SETTER_ROLE) {
		gatewaySigners.push(signer);
		emit GatewaySignerAdded(signer);
	}

	function removeGatewaySigner(address signer) external onlyRole(SETTER_ROLE) {
		for (uint256 i = 0; i < gatewaySigners.length; i++) {
			if (gatewaySigners[i] == signer) {
				gatewaySigners[i] = gatewaySigners[gatewaySigners.length - 1];
				gatewaySigners.pop();
				break;
			}
		}
		emit GatewaySignerRemoved(signer);
	}

	function getAllGatewaySigners() external view returns (address[] memory) {
		return gatewaySigners;
	}
}
