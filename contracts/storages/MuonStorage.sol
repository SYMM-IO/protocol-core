// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../libraries/LibLockedValues.sol";

struct SchnorrSign {
	uint256 signature;
	address owner;
	address nonce;
}

struct PublicKey {
	uint256 x;
	uint8 parity;
}

struct SingleUpnlSig {
	bytes reqId;
	uint256 timestamp;
	int256 upnl;
	bytes gatewaySignature;
	SchnorrSign sigs;
}

struct SingleUpnlAndPriceSig {
	bytes reqId;
	uint256 timestamp;
	int256 upnl;
	uint256 price;
	bytes gatewaySignature;
	SchnorrSign sigs;
}

struct PairUpnlSig {
	bytes reqId;
	uint256 timestamp;
	int256 upnlPartyA;
	int256 upnlPartyB;
	bytes gatewaySignature;
	SchnorrSign sigs;
}

struct PairUpnlAndPriceSig {
	bytes reqId;
	uint256 timestamp;
	int256 upnlPartyA;
	int256 upnlPartyB;
	uint256 price;
	bytes gatewaySignature;
	SchnorrSign sigs;
}

struct PairUpnlAndPricesSig {
	bytes reqId;
	uint256 timestamp;
	int256 upnlPartyA;
	int256 upnlPartyB;
	uint256[] symbolIds;
	uint256[] prices;
	bytes gatewaySignature;
	SchnorrSign sigs;
}

struct DeferredLiquidationSig {
	bytes reqId; // Unique identifier for the liquidation request
	uint256 timestamp; // Timestamp when the liquidation signature was created
	uint256 liquidationBlockNumber; // Block number at which the user became insolvent
	uint256 liquidationTimestamp; // Timestamp when the user became insolvent
	uint256 liquidationAllocatedBalance; // User's allocated balance at the time of insolvency
	bytes liquidationId; // Unique identifier for the liquidation event
	int256 upnl; // User's unrealized profit and loss at the time of insolvency
	int256 totalUnrealizedLoss; // Total unrealized loss of the user at the time of insolvency
	uint256[] symbolIds; // List of symbol IDs involved in the liquidation
	uint256[] prices; // Corresponding prices of the symbols involved in the liquidation
	bytes gatewaySignature; // Signature from the gateway for verification
	SchnorrSign sigs; // Schnorr signature for additional verification
}

struct LiquidationSig {
	bytes reqId; // Unique identifier for the liquidation request
	uint256 timestamp; // Timestamp when the liquidation signature was created
	bytes liquidationId; // Unique identifier for the liquidation event
	int256 upnl; // User's unrealized profit and loss at the time of insolvency
	int256 totalUnrealizedLoss; // Total unrealized loss of the user at the time of insolvency
	uint256[] symbolIds; // List of symbol IDs involved in the liquidation
	uint256[] prices; // Corresponding prices of the symbols involved in the liquidation
	bytes gatewaySignature; // Signature from the gateway for verification
	SchnorrSign sigs; // Schnorr signature for additional verification
}

struct QuotePriceSig {
	bytes reqId;
	uint256 timestamp;
	uint256[] quoteIds;
	uint256[] prices;
	bytes gatewaySignature;
	SchnorrSign sigs;
}

struct HighLowPriceSig {
	bytes reqId;
	uint256 timestamp;
	uint256 symbolId;
	uint256 highest;
	uint256 lowest;
	uint256 averagePrice;
	uint256 startTime;
	uint256 endTime;
	int256 upnlPartyB;
	int256 upnlPartyA;
	uint256 currentPrice;
	bytes gatewaySignature;
	SchnorrSign sigs;
}

struct QuoteSettlementData {
	uint256 quoteId;
	uint256 currentPrice;
	uint8 partyBUpnlIndex;
}

struct SettlementSig {
	bytes reqId;
	uint256 timestamp;
	QuoteSettlementData[] quotesSettlementsData;
	int256[] upnlPartyBs;
	int256 upnlPartyA;
	bytes gatewaySignature;
	SchnorrSign sigs;
}

library MuonStorage {
	bytes32 internal constant MUON_STORAGE_SLOT = keccak256("diamond.standard.storage.muon");

	struct Layout {
		uint256 upnlValidTime;
		uint256 priceValidTime;
		uint256 priceQuantityValidTime; // UNUSED: Should be deleted later
		uint256 muonAppId;
		PublicKey muonPublicKey;
		address validGateway;
	}

	function layout() internal pure returns (Layout storage l) {
		bytes32 slot = MUON_STORAGE_SLOT;
		assembly {
			l.slot := slot
		}
	}
}
