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
import "../facets/Bridge/IBridgeFacet.sol";
import "../facets/ViewFacet/IViewFacet.sol";
import "../facets/DiamondCut/IDiamondCut.sol";
import "../facets/DiamondLoup/IDiamondLoupe.sol";
import "../facets/PartyBQuoteActions/IPartyBQuoteActionsFacet.sol";
import "../facets/PartyBPositionActions/IPartyBPositionActionsFacet.sol";
import "../facets/PartyBGroupActions/IPartyBGroupActionsFacet.sol";
import "../facets/ForceActions/IForceActionsFacet.sol";
import "../facets/Settlement/ISettlementFacet.sol";

interface ISymmio is
	IAccountFacet,
	IControlFacet,
	IFundingRateFacet,
	IBridgeFacet,
	ISettlementFacet,
	IForceActionsFacet,
	IPartyBQuoteActionsFacet,
	IPartyBGroupActionsFacet,
	IPartyBPositionActionsFacet,
	IPartyAFacet,
	ILiquidationFacet,
	IViewFacet,
	IDiamondCut,
	IDiamondLoupe
{
	// Copied from SharedEvents library
	enum BalanceChangeType {
		ALLOCATE,
		DEALLOCATE,
		PLATFORM_FEE_IN,
		PLATFORM_FEE_OUT,
		REALIZED_PNL_IN,
		REALIZED_PNL_OUT,
		CVA_IN,
		CVA_OUT,
		LF_IN,
		LF_OUT,
		FUNDING_FEE_IN,
		FUNDING_FEE_OUT
	}

	// Copied from SharedEvents library
	event BalanceChangePartyA(address indexed partyA, uint256 amount, BalanceChangeType _type);

	// Copied from SharedEvents library
	event BalanceChangePartyB(address indexed partyB, address indexed partyA, uint256 amount, BalanceChangeType _type);
}
