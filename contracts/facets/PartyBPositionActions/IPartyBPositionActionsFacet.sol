// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./IPartyBPositionActionsEvents.sol";

interface IPartyBPositionActionsFacet is IPartyBPositionActionsEvents {
	function openPosition(uint256 quoteId, uint256 filledAmount, uint256 openedPrice, PairUpnlAndPriceSig memory upnlSig) external;

	function fillCloseRequest(uint256 quoteId, uint256 filledAmount, uint256 closedPrice, PairUpnlAndPriceSig memory upnlSig) external;

	function acceptCancelCloseRequest(uint256 quoteId) external;

	function emergencyClosePosition(uint256 quoteId, PairUpnlAndPriceSig memory upnlSig) external;
}
