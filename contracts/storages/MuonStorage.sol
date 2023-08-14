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

struct LiquidationSig {
    bytes reqId;
    uint256 timestamp;
    bytes liquidationId;
    int256 upnl;
    int256 totalUnrealizedLoss; 
    uint256[] symbolIds;
    uint256[] prices;
    bytes gatewaySignature;
    SchnorrSign sigs;
}

struct QuotePriceSig {
    bytes reqId;
    uint256 timestamp;
    uint256[] quoteIds;
    uint256[] prices;
    bytes gatewaySignature;
    SchnorrSign sigs;
}

library MuonStorage {
    bytes32 internal constant MUON_STORAGE_SLOT = keccak256("diamond.standard.storage.muon");

    struct Layout {
        uint256 upnlValidTime;
        uint256 priceValidTime;
        uint256 priceQuantityValidTime;
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
