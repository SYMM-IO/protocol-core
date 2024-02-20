// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;
import "./IPartyBEvents.sol";
import "../../storages/MuonStorage.sol";

interface IPartyBFacet is IPartyBEvents {
	function lockQuote(uint256 quoteId, SingleUpnlSig memory upnlSig) external;

	function lockAndOpenQuote(
		uint256 quoteId,
		uint256 filledAmount,
		uint256 openedPrice,
		SingleUpnlSig memory upnlSig,
		PairUpnlAndPriceSig memory pairUpnlSig
	) external;

	function unlockQuote(uint256 quoteId) external;

	function acceptCancelRequest(uint256 quoteId) external;

	function openPosition(uint256 quoteId, uint256 filledAmount, uint256 openedPrice, PairUpnlAndPriceSig memory upnlSig) external;

	function fillCloseRequest(uint256 quoteId, uint256 filledAmount, uint256 closedPrice, PairUpnlAndPriceSig memory upnlSig) external;

	function acceptCancelCloseRequest(uint256 quoteId) external;

	function emergencyClosePosition(uint256 quoteId, PairUpnlAndPriceSig memory upnlSig) external;
}
