// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../facets/Account/IAccountFacet.sol";
import "../facets/Control/IControlFacet.sol";
import "../facets/FundingRate/IFundingRateFacet.sol";
import "../facets/liquidation/ILiquidationFacet.sol";
import "../facets/PartyA/IPartyAFacet.sol";
import "../facets/PartyB/IPartyBFacet.sol";
import "../facets/Bridge/IBridgeFacet.sol";
import "../facets/ViewFacet/IViewFacet.sol";
import "../facets/DiamondCut/IDiamondCut.sol";
import "../facets/DiamondLoup/IDiamondLoupe.sol";

interface ISymmio is
	IAccountFacet,
	IControlFacet,
	IFundingRateFacet,
	IBridgeFacet,
	IPartyBFacet,
	IPartyAFacet,
	ILiquidationFacet,
	IViewFacet,
	IDiamondCut,
	IDiamondLoupe
{}
