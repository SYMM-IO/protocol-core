// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license

pragma solidity >=0.8.18;

interface IMuonSignatureVerifier {
	struct PublicKey {
		uint256 x;
		uint8 parity;
	}

	struct SchnorrSign {
		uint256 signature;
		address owner;
		address nonce;
	}

	// === Signature Verification ===
	function verify(bytes32 hash, SchnorrSign memory sign, bytes calldata gatewaySignature) external view;

	// === Public Key Management ===
	function addPublicKey(PublicKey memory pubKey) external;

	function removePublicKey(PublicKey memory pubKey) external;

	function getAllPublicKeys() external view returns (PublicKey[] memory);

	// === Gateway Signer Management ===
	function addGatewaySigner(address signer) external;

	function removeGatewaySigner(address signer) external;

	function getAllGatewaySigners() external view returns (address[] memory);
}
