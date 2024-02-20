// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./ILiquidationEvents.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/MuonStorage.sol";

interface ILiquidationFacet is ILiquidationEvents {
	function liquidatePartyA(address partyA, LiquidationSig memory liquidationSig) external;

	function setSymbolsPrice(address partyA, LiquidationSig memory liquidationSig) external;

	function liquidatePendingPositionsPartyA(address partyA) external;

	function liquidatePositionsPartyA(address partyA, uint256[] memory quoteIds) external;

	function settlePartyALiquidation(address partyA, address[] memory partyBs) external;

	function resolveLiquidationDispute(address partyA, address[] memory partyBs, int256[] memory amounts, bool disputed) external;

	function liquidatePartyB(address partyB, address partyA, SingleUpnlSig memory upnlSig) external;

	function liquidatePositionsPartyB(address partyB, address partyA, QuotePriceSig memory priceSig) external;
}
