// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/LibLockedValues.sol";
import "../../libraries/LibMuon.sol";
import "../../libraries/LibAccount.sol";
import "../../libraries/LibQuote.sol";
import "../../libraries/LibLiquidation.sol";
import "../../storages/MAStorage.sol";
import "../../storages/QuoteStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/SymbolStorage.sol";

library LiquidationFacetImpl {
	using LockedValuesOps for LockedValues;

	function liquidatePartyA(address partyA, LiquidationSig memory liquidationSig) internal {
		MAStorage.Layout storage maLayout = MAStorage.layout();

		LibMuon.verifyLiquidationSig(liquidationSig, partyA);
		require(block.timestamp <= liquidationSig.timestamp + MuonStorage.layout().upnlValidTime, "LiquidationFacet: Expired signature");
		int256 availableBalance = LibAccount.partyAAvailableBalanceForLiquidation(liquidationSig.upnl, partyA);
		require(availableBalance < 0, "LiquidationFacet: PartyA is solvent");
		maLayout.liquidationStatus[partyA] = true;
		AccountStorage.layout().liquidationDetails[partyA] = LiquidationDetail({
			liquidationId: liquidationSig.liquidationId,
			liquidationType: LiquidationType.NONE,
			upnl: liquidationSig.upnl,
			totalUnrealizedLoss: liquidationSig.totalUnrealizedLoss,
			deficit: 0,
			liquidationFee: 0,
			timestamp: liquidationSig.timestamp,
			involvedPartyBCounts: 0,
			partyAAccumulatedUpnl: 0,
			disputed: false
		});
		AccountStorage.layout().liquidators[partyA].push(msg.sender);
	}

	function setSymbolsPrice(address partyA, LiquidationSig memory liquidationSig) internal {
		MAStorage.Layout storage maLayout = MAStorage.layout();
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();

		LibMuon.verifyLiquidationSig(liquidationSig, partyA);
		require(maLayout.liquidationStatus[partyA], "LiquidationFacet: PartyA is solvent");
		require(
			keccak256(accountLayout.liquidationDetails[partyA].liquidationId) == keccak256(liquidationSig.liquidationId),
			"LiquidationFacet: Invalid liqiudationId"
		);
		for (uint256 index = 0; index < liquidationSig.symbolIds.length; index++) {
			accountLayout.symbolsPrices[partyA][liquidationSig.symbolIds[index]] = Price(
				liquidationSig.prices[index],
				accountLayout.liquidationDetails[partyA].timestamp
			);
		}

		int256 availableBalance = LibAccount.partyAAvailableBalanceForLiquidation(liquidationSig.upnl, partyA);
		if (accountLayout.liquidationDetails[partyA].liquidationType == LiquidationType.NONE) {
			if (uint256(-availableBalance) < accountLayout.lockedBalances[partyA].lf) {
				uint256 remainingLf = accountLayout.lockedBalances[partyA].lf - uint256(-availableBalance);
				accountLayout.liquidationDetails[partyA].liquidationType = LiquidationType.NORMAL;
				accountLayout.liquidationDetails[partyA].liquidationFee = remainingLf;
			} else if (uint256(-availableBalance) <= accountLayout.lockedBalances[partyA].lf + accountLayout.lockedBalances[partyA].cva) {
				uint256 deficit = uint256(-availableBalance) - accountLayout.lockedBalances[partyA].lf;
				accountLayout.liquidationDetails[partyA].liquidationType = LiquidationType.LATE;
				accountLayout.liquidationDetails[partyA].deficit = deficit;
			} else {
				uint256 deficit = uint256(-availableBalance) - accountLayout.lockedBalances[partyA].lf - accountLayout.lockedBalances[partyA].cva;
				accountLayout.liquidationDetails[partyA].liquidationType = LiquidationType.OVERDUE;
				accountLayout.liquidationDetails[partyA].deficit = deficit;
			}
			AccountStorage.layout().liquidators[partyA].push(msg.sender);
		}
	}

	function liquidatePendingPositionsPartyA(address partyA) internal {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		require(MAStorage.layout().liquidationStatus[partyA], "LiquidationFacet: PartyA is solvent");
		for (uint256 index = 0; index < quoteLayout.partyAPendingQuotes[partyA].length; index++) {
			Quote storage quote = quoteLayout.quotes[quoteLayout.partyAPendingQuotes[partyA][index]];
			if (
				(quote.quoteStatus == QuoteStatus.LOCKED || quote.quoteStatus == QuoteStatus.CANCEL_PENDING) &&
				quoteLayout.partyBPendingQuotes[quote.partyB][partyA].length > 0
			) {
				delete quoteLayout.partyBPendingQuotes[quote.partyB][partyA];
				AccountStorage.layout().partyBPendingLockedBalances[quote.partyB][partyA].makeZero();
			}
			AccountStorage.layout().partyAReimbursement[partyA] += LibQuote.getTradingFee(quote.id);
			quote.quoteStatus = QuoteStatus.CANCELED;
			quote.statusModifyTimestamp = block.timestamp;
		}
		AccountStorage.layout().pendingLockedBalances[partyA].makeZero();
		delete quoteLayout.partyAPendingQuotes[partyA];
	}

	function liquidatePositionsPartyA(address partyA, uint256[] memory quoteIds) internal returns (bool) {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();

		require(maLayout.liquidationStatus[partyA], "LiquidationFacet: PartyA is solvent");
		for (uint256 index = 0; index < quoteIds.length; index++) {
			Quote storage quote = quoteLayout.quotes[quoteIds[index]];
			require(
				quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
				"LiquidationFacet: Invalid state"
			);
			require(!maLayout.partyBLiquidationStatus[quote.partyB][partyA], "LiquidationFacet: PartyB is in liquidation process");
			require(quote.partyA == partyA, "LiquidationFacet: Invalid party");
			require(
				accountLayout.symbolsPrices[partyA][quote.symbolId].timestamp == accountLayout.liquidationDetails[partyA].timestamp,
				"LiquidationFacet: Price should be set"
			);
			quote.quoteStatus = QuoteStatus.LIQUIDATED;
			quote.statusModifyTimestamp = block.timestamp;

			accountLayout.partyBNonces[quote.partyB][quote.partyA] += 1;

			(bool hasMadeProfit, uint256 amount) = LibQuote.getValueOfQuoteForPartyA(
				accountLayout.symbolsPrices[partyA][quote.symbolId].price,
				LibQuote.quoteOpenAmount(quote),
				quote
			);

			if (!accountLayout.settlementStates[partyA][quote.partyB].pending) {
				accountLayout.settlementStates[partyA][quote.partyB].pending = true;
				accountLayout.liquidationDetails[partyA].involvedPartyBCounts += 1;
			}
			if (accountLayout.liquidationDetails[partyA].liquidationType == LiquidationType.NORMAL) {
				accountLayout.settlementStates[partyA][quote.partyB].cva += quote.lockedValues.cva;

				if (hasMadeProfit) {
					accountLayout.settlementStates[partyA][quote.partyB].actualAmount += int256(amount);
				} else {
					accountLayout.settlementStates[partyA][quote.partyB].actualAmount -= int256(amount);
				}
				accountLayout.settlementStates[partyA][quote.partyB].expectedAmount = accountLayout
				.settlementStates[partyA][quote.partyB].actualAmount;
			} else if (accountLayout.liquidationDetails[partyA].liquidationType == LiquidationType.LATE) {
				accountLayout.settlementStates[partyA][quote.partyB].cva +=
					quote.lockedValues.cva -
					((quote.lockedValues.cva * accountLayout.liquidationDetails[partyA].deficit) / accountLayout.lockedBalances[partyA].cva);
				if (hasMadeProfit) {
					accountLayout.settlementStates[partyA][quote.partyB].actualAmount += int256(amount);
				} else {
					accountLayout.settlementStates[partyA][quote.partyB].actualAmount -= int256(amount);
				}
				accountLayout.settlementStates[partyA][quote.partyB].expectedAmount = accountLayout
				.settlementStates[partyA][quote.partyB].actualAmount;
			} else if (accountLayout.liquidationDetails[partyA].liquidationType == LiquidationType.OVERDUE) {
				if (hasMadeProfit) {
					accountLayout.settlementStates[partyA][quote.partyB].actualAmount += int256(amount);
					accountLayout.settlementStates[partyA][quote.partyB].expectedAmount += int256(amount);
				} else {
					accountLayout.settlementStates[partyA][quote.partyB].actualAmount -= int256(
						amount -
							((amount * accountLayout.liquidationDetails[partyA].deficit) /
								uint256(-accountLayout.liquidationDetails[partyA].totalUnrealizedLoss))
					);
					accountLayout.settlementStates[partyA][quote.partyB].expectedAmount -= int256(amount);
				}
			}
			accountLayout.partyBLockedBalances[quote.partyB][partyA].subQuote(quote);
			quote.avgClosedPrice =
				(quote.avgClosedPrice *
					quote.closedAmount +
					LibQuote.quoteOpenAmount(quote) *
					accountLayout.symbolsPrices[partyA][quote.symbolId].price) /
				(quote.closedAmount + LibQuote.quoteOpenAmount(quote));
			quote.closedAmount = quote.quantity;

			LibQuote.removeFromOpenPositions(quote.id);
			quoteLayout.partyAPositionsCount[partyA] -= 1;
			quoteLayout.partyBPositionsCount[quote.partyB][partyA] -= 1;

			if (quoteLayout.partyBPositionsCount[quote.partyB][partyA] == 0) {
				int256 settleAmount = accountLayout.settlementStates[partyA][quote.partyB].expectedAmount;
				if (settleAmount < 0) {
					accountLayout.liquidationDetails[partyA].partyAAccumulatedUpnl += settleAmount;
				} else {
					if (accountLayout.partyBAllocatedBalances[quote.partyB][partyA] >= uint256(settleAmount)) {
						accountLayout.liquidationDetails[partyA].partyAAccumulatedUpnl += settleAmount;
					} else {
						accountLayout.liquidationDetails[partyA].partyAAccumulatedUpnl += int256(
							accountLayout.partyBAllocatedBalances[quote.partyB][partyA]
						);
					}
				}
			}
		}
		if (
			quoteLayout.partyAPositionsCount[partyA] == 0 &&
			accountLayout.liquidationDetails[partyA].partyAAccumulatedUpnl != accountLayout.liquidationDetails[partyA].upnl
		) {
			accountLayout.liquidationDetails[partyA].disputed = true;
			return true;
		}
		return false;
	}

	function resolveLiquidationDispute(address partyA, address[] memory partyBs, int256[] memory amounts, bool disputed) internal {
		AccountStorage.layout().liquidationDetails[partyA].disputed = disputed;
		require(partyBs.length == amounts.length, "LiquidationFacet: Invalid length");
		for (uint256 i = 0; i < partyBs.length; i++) {
			AccountStorage.layout().settlementStates[partyA][partyBs[i]].actualAmount = amounts[i];
		}
	}

	function settlePartyALiquidation(address partyA, address[] memory partyBs) internal returns (int256[] memory settleAmounts) {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		require(
			quoteLayout.partyAPositionsCount[partyA] == 0 && quoteLayout.partyAPendingQuotes[partyA].length == 0,
			"LiquidationFacet: PartyA has still open positions"
		);
		require(MAStorage.layout().liquidationStatus[partyA], "LiquidationFacet: PartyA is solvent");
		require(!accountLayout.liquidationDetails[partyA].disputed, "LiquidationFacet: PartyA liquidation process get disputed");
		settleAmounts = new int256[](partyBs.length);
		for (uint256 i = 0; i < partyBs.length; i++) {
			address partyB = partyBs[i];
			require(accountLayout.settlementStates[partyA][partyB].pending, "LiquidationFacet: PartyB is not in settlement");
			accountLayout.settlementStates[partyA][partyB].pending = false;
			accountLayout.liquidationDetails[partyA].involvedPartyBCounts -= 1;

			int256 settleAmount = accountLayout.settlementStates[partyA][partyB].actualAmount;
			accountLayout.partyBAllocatedBalances[partyB][partyA] += accountLayout.settlementStates[partyA][partyB].cva;
			if (settleAmount < 0) {
				accountLayout.partyBAllocatedBalances[partyB][partyA] += uint256(-settleAmount);
				settleAmounts[i] = settleAmount;
			} else {
				if (accountLayout.partyBAllocatedBalances[partyB][partyA] >= uint256(settleAmount)) {
					accountLayout.partyBAllocatedBalances[partyB][partyA] -= uint256(settleAmount);
					settleAmounts[i] = settleAmount;
				} else {
					settleAmounts[i] = int256(accountLayout.partyBAllocatedBalances[partyB][partyA]);
					accountLayout.partyBAllocatedBalances[partyB][partyA] = 0;
				}
			}
			delete accountLayout.settlementStates[partyA][partyB];
		}
		if (accountLayout.liquidationDetails[partyA].involvedPartyBCounts == 0) {
			accountLayout.allocatedBalances[partyA] = accountLayout.partyAReimbursement[partyA];
			accountLayout.partyAReimbursement[partyA] = 0;
			accountLayout.lockedBalances[partyA].makeZero();

			uint256 lf = accountLayout.liquidationDetails[partyA].liquidationFee;
			if (lf > 0) {
				accountLayout.allocatedBalances[accountLayout.liquidators[partyA][0]] += lf / 2;
				accountLayout.allocatedBalances[accountLayout.liquidators[partyA][1]] += lf / 2;
			}
			delete accountLayout.liquidators[partyA];
			delete accountLayout.liquidationDetails[partyA].liquidationType;
			MAStorage.layout().liquidationStatus[partyA] = false;
			accountLayout.partyANonces[partyA] += 1;
		}
	}

	function liquidatePartyB(address partyB, address partyA, SingleUpnlSig memory upnlSig) internal {
		LibMuon.verifyPartyBUpnl(upnlSig, partyB, partyA);
		LibLiquidation.liquidatePartyB(partyB, partyA, upnlSig.upnl, upnlSig.timestamp);
	}

	function liquidatePositionsPartyB(address partyB, address partyA, QuotePriceSig memory priceSig) internal {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();

		LibMuon.verifyQuotePrices(priceSig);
		require(
			priceSig.timestamp <= maLayout.partyBLiquidationTimestamp[partyB][partyA] + maLayout.liquidationTimeout,
			"LiquidationFacet: Invalid signature"
		);
		require(maLayout.partyBLiquidationStatus[partyB][partyA], "LiquidationFacet: PartyB is solvent");
		require(maLayout.partyBLiquidationTimestamp[partyB][partyA] <= priceSig.timestamp, "LiquidationFacet: Expired signature");
		for (uint256 index = 0; index < priceSig.quoteIds.length; index++) {
			Quote storage quote = quoteLayout.quotes[priceSig.quoteIds[index]];
			require(
				quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING,
				"LiquidationFacet: Invalid state"
			);
			require(quote.partyA == partyA && quote.partyB == partyB, "LiquidationFacet: Invalid party");

			quote.quoteStatus = QuoteStatus.LIQUIDATED;
			quote.statusModifyTimestamp = block.timestamp;

			accountLayout.lockedBalances[partyA].subQuote(quote);

			quote.avgClosedPrice =
				(quote.avgClosedPrice * quote.closedAmount + LibQuote.quoteOpenAmount(quote) * priceSig.prices[index]) /
				(quote.closedAmount + LibQuote.quoteOpenAmount(quote));
			quote.closedAmount = quote.quantity;

			LibQuote.removeFromOpenPositions(quote.id);
			quoteLayout.partyAPositionsCount[partyA] -= 1;
			quoteLayout.partyBPositionsCount[partyB][partyA] -= 1;
		}
		if (maLayout.partyBPositionLiquidatorsShare[partyB][partyA] > 0) {
			accountLayout.allocatedBalances[msg.sender] += maLayout.partyBPositionLiquidatorsShare[partyB][partyA] * priceSig.quoteIds.length;
		}

		if (quoteLayout.partyBPositionsCount[partyB][partyA] == 0) {
			maLayout.partyBLiquidationStatus[partyB][partyA] = false;
			maLayout.partyBLiquidationTimestamp[partyB][partyA] = 0;
			accountLayout.partyBNonces[partyB][partyA] += 1;
		}
	}
}
