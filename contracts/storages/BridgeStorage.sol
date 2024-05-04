// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

struct BridgeTransaction {
	uint256 id;
	uint256 amount;
	address user;
	address bridge;
	uint256 timestamp;
	BridgeTransactionStatus status;
}

enum BridgeTransactionStatus {
	RECEIVED,
	SUSPENDED,
	WITHDRAWN
}

library BridgeStorage {
	bytes32 internal constant BRIDGE_STORAGE_SLOT = keccak256("diamond.standard.storage.bridge");

	struct Layout {
		mapping(address => bool) bridges;
		mapping(uint256 => BridgeTransaction) bridgeTransactions;
		uint256 lastId;
		address invalidBridgedAmountsPool;
	}

	function layout() internal pure returns (Layout storage l) {
		bytes32 slot = BRIDGE_STORAGE_SLOT;
		assembly {
			l.slot := slot
		}
	}
}
