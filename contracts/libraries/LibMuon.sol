// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../libraries/LibMuonV04ClientBase.sol";
import "../storages/MuonStorage.sol";
import "../storages/AccountStorage.sol";

library LibMuon {
    using ECDSA for bytes32;

    function getChainId() internal view returns (uint256 id) {
        assembly {
            id := chainid()
        }
    }

    function verifyTSSAndGateway(
        bytes32 hash,
        SchnorrSign memory sign,
        bytes memory gatewaySignature
    ) internal view {
       bool verified = LibMuonV04ClientBase.muonVerify(
           uint256(hash),
           sign,
           MuonStorage.layout().muonPublicKey
       );
       require(verified, "LibMuon: TSS not verified");

       hash = hash.toEthSignedMessageHash();
       address gatewaySignatureSigner = hash.recover(gatewaySignature);

       require(
           gatewaySignatureSigner == MuonStorage.layout().validGateway,
           "LibMuon: Gateway is not valid"
       );
    }

    function verifyPrices(PriceSig memory priceSig, address partyA) internal view {
        MuonStorage.Layout storage muonLayout = MuonStorage.layout();
        require(priceSig.prices.length == priceSig.symbolIds.length, "LibMuon: Invalid length");
        bytes32 hash = keccak256(
            abi.encodePacked(
                muonLayout.muonAppId,
                priceSig.reqId,
                address(this),
                partyA,
                priceSig.upnl,
                priceSig.totalUnrealizedLoss,
                priceSig.symbolIds,
                priceSig.prices,
                priceSig.timestamp,
                getChainId()
            )
        );
        verifyTSSAndGateway(hash, priceSig.sigs, priceSig.gatewaySignature);
    }

    function verifyQuotePrices(QuotePriceSig memory priceSig) internal view {
        MuonStorage.Layout storage muonLayout = MuonStorage.layout();
        require(priceSig.prices.length == priceSig.quoteIds.length, "LibMuon: Invalid length");
        bytes32 hash = keccak256(
            abi.encodePacked(
                muonLayout.muonAppId,
                priceSig.reqId,
                address(this),
                priceSig.quoteIds,
                priceSig.prices,
                priceSig.timestamp,
                getChainId()
            )
        );
        verifyTSSAndGateway(hash, priceSig.sigs, priceSig.gatewaySignature);
    }

    function verifyPartyAUpnl(SingleUpnlSig memory upnlSig, address partyA) internal view {
        MuonStorage.Layout storage muonLayout = MuonStorage.layout();
        require(
            block.timestamp <= upnlSig.timestamp + muonLayout.upnlValidTime,
            "LibMuon: Expired signature"
        );
        bytes32 hash = keccak256(
            abi.encodePacked(
                muonLayout.muonAppId,
                upnlSig.reqId,
                address(this),
                partyA,
                AccountStorage.layout().partyANonces[partyA],
                upnlSig.upnl,
                upnlSig.timestamp,
                getChainId()
            )
        );
        verifyTSSAndGateway(hash, upnlSig.sigs, upnlSig.gatewaySignature);
    }

    function verifyPartyAUpnlAndPrice(
        SingleUpnlAndPriceSig memory upnlSig,
        address partyA,
        uint256 symbolId
    ) internal view {
        MuonStorage.Layout storage muonLayout = MuonStorage.layout();
        require(
            block.timestamp <= upnlSig.timestamp + muonLayout.upnlValidTime,
            "LibMuon: Expired signature"
        );
        bytes32 hash = keccak256(
            abi.encodePacked(
                muonLayout.muonAppId,
                upnlSig.reqId,
                address(this),
                partyA,
                AccountStorage.layout().partyANonces[partyA],
                upnlSig.upnl,
                symbolId,
                upnlSig.price,
                upnlSig.timestamp,
                getChainId()
            )
        );
        verifyTSSAndGateway(hash, upnlSig.sigs, upnlSig.gatewaySignature);
    }

    function verifyPartyBUpnl(
        SingleUpnlSig memory upnlSig,
        address partyB,
        address partyA
    ) internal view {
        MuonStorage.Layout storage muonLayout = MuonStorage.layout();
        require(
            block.timestamp <= upnlSig.timestamp + muonLayout.upnlValidTime,
            "LibMuon: Expired signature"
        );
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

    function verifyPairUpnlAndPrice(
        PairUpnlAndPriceSig memory upnlSig,
        address partyB,
        address partyA,
        uint256 symbolId
    ) internal view {
        MuonStorage.Layout storage muonLayout = MuonStorage.layout();
        require(
            block.timestamp <= upnlSig.timestamp + muonLayout.upnlValidTime,
            "LibMuon: Expired signature"
        );
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
                getChainId()
            )
        );
        verifyTSSAndGateway(hash, upnlSig.sigs, upnlSig.gatewaySignature);
    }

    function verifyPairUpnl(
        PairUpnlSig memory upnlSig,
        address partyB,
        address partyA
    ) internal view {
        MuonStorage.Layout storage muonLayout = MuonStorage.layout();
        require(
            block.timestamp <= upnlSig.timestamp + muonLayout.upnlValidTime,
            "LibMuon: Expired signature"
        );
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
                upnlSig.timestamp,
                getChainId()
            )
        );
        verifyTSSAndGateway(hash, upnlSig.sigs, upnlSig.gatewaySignature);
    }
}
