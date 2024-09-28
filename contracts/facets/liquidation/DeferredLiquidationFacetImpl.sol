// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/LibLockedValues.sol";
import "../../libraries/muon/LibMuonLiquidation.sol";
import "../../libraries/LibAccount.sol";
import "../../libraries/LibQuote.sol";
import "../../libraries/LibLiquidation.sol";
import "../../libraries/SharedEvents.sol";
import "../../storages/MAStorage.sol";
import "../../storages/QuoteStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/SymbolStorage.sol";

library DeferredLiquidationFacetImpl {
	using LockedValuesOps for LockedValues;

	function deferredLiquidatePartyA(address partyA, DeferredLiquidationSig memory liquidationSig) internal {
		MAStorage.Layout storage maLayout = MAStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		LibMuonLiquidation.verifyDeferredLiquidationSig(liquidationSig, partyA);

		int256 liquidationAvailableBalance = LibAccount.partyAAvailableBalanceForLiquidation(
			liquidationSig.upnl,
			liquidationSig.liquidationAllocatedBalance,
			partyA
		);
		require(liquidationAvailableBalance < 0, "LiquidationFacet: PartyA is solvent");

		int256 availableBalance = LibAccount.partyAAvailableBalanceForLiquidation(
			liquidationSig.upnl,
			accountLayout.allocatedBalances[partyA],
			partyA
		);
		if (availableBalance > 0) {
			accountLayout.allocatedBalances[partyA] -= uint256(availableBalance);
			emit SharedEvents.BalanceChangePartyA(partyA, uint256(availableBalance), SharedEvents.BalanceChangeType.REALIZED_PNL_OUT);
			accountLayout.partyAReimbursement[partyA] += uint256(availableBalance);
		}

		maLayout.liquidationStatus[partyA] = true;
		accountLayout.liquidationDetails[partyA] = LiquidationDetail({
			liquidationId: liquidationSig.liquidationId,
			liquidationType: LiquidationType.NONE,
			upnl: liquidationSig.upnl,
			totalUnrealizedLoss: liquidationSig.totalUnrealizedLoss,
			deficit: 0,
			liquidationFee: 0,
			timestamp: liquidationSig.timestamp,
			involvedPartyBCounts: 0,
			partyAAccumulatedUpnl: 0,
			disputed: false,
			liquidationTimestamp: liquidationSig.liquidationTimestamp
		});
		accountLayout.liquidators[partyA].push(msg.sender);
	}

	function deferredSetSymbolsPrice(address partyA, DeferredLiquidationSig memory liquidationSig) internal {
		MAStorage.Layout storage maLayout = MAStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		LibMuonLiquidation.verifyDeferredLiquidationSig(liquidationSig, partyA);
		require(maLayout.liquidationStatus[partyA], "LiquidationFacet: PartyA is solvent");

		LiquidationDetail storage detail = accountLayout.liquidationDetails[partyA];
		require(keccak256(detail.liquidationId) == keccak256(liquidationSig.liquidationId), "LiquidationFacet: Invalid liquidationId");

		for (uint256 index = 0; index < liquidationSig.symbolIds.length; index++) {
			accountLayout.symbolsPrices[partyA][liquidationSig.symbolIds[index]] = Price(liquidationSig.prices[index], detail.timestamp);
		}

		int256 availableBalance = LibAccount.partyAAvailableBalanceForLiquidation(
			liquidationSig.upnl,
			accountLayout.allocatedBalances[partyA],
			partyA
		);

		if (detail.liquidationType == LiquidationType.NONE) {
			if (uint256(- availableBalance) < accountLayout.lockedBalances[partyA].lf) {
				uint256 remainingLf = accountLayout.lockedBalances[partyA].lf - uint256(- availableBalance);
				detail.liquidationType = LiquidationType.NORMAL;
				detail.liquidationFee = remainingLf;
			} else if (uint256(- availableBalance) <= accountLayout.lockedBalances[partyA].lf + accountLayout.lockedBalances[partyA].cva) {
				uint256 deficit = uint256(- availableBalance) - accountLayout.lockedBalances[partyA].lf;
				detail.liquidationType = LiquidationType.LATE;
				detail.deficit = deficit;
			} else {
				uint256 deficit = uint256(- availableBalance) - accountLayout.lockedBalances[partyA].lf - accountLayout.lockedBalances[partyA].cva;
				detail.liquidationType = LiquidationType.OVERDUE;
				detail.deficit = deficit;
			}
			accountLayout.liquidators[partyA].push(msg.sender);
		}
	}
}
