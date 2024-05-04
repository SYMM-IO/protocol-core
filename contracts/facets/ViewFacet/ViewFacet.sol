// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../libraries/LibLockedValues.sol";
import "../../libraries/LibQuote.sol";
import "../../libraries/LibMuon.sol";
import "../../storages/AccountStorage.sol";
import "../../storages/MAStorage.sol";
import "../../storages/QuoteStorage.sol";
import "../../storages/GlobalAppStorage.sol";
import "../../storages/SymbolStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../libraries/LibLockedValues.sol";
import "../../storages/BridgeStorage.sol";
import "./IViewFacet.sol";

contract ViewFacet is IViewFacet {
	using LockedValuesOps for LockedValues;

	/**
	 * @notice Returns the balance of the specified user.
	 * @param user The address of the user.
	 * @return The balance of the user.
	 */
	function balanceOf(address user) external view returns (uint256) {
		return AccountStorage.layout().balances[user];
	}

	/**
	 * @notice Returns various values related to Party A.
	 * @param partyA The address of Party A.
	 * @return liquidationStatus The liquidation status of Party A.
	 * @return allocatedBalances The allocated balances of Party A.
	 * @return lockedBalances The locked balances of Party A.
	 * @return pendingLockedBalances The pending locked balances of Party A.
	 * @return partyAPositionsCount The number of positions held by Party A.
	 * @return partyAPendingQuotesCount The number of pending quotes submitted by Party A.
	 * @return partyANonces The nonces of Party A.
	 * @return quoteIdsOfPartyA The quote IDs associated with Party A.
	 */
	function partyAStats(
		address partyA
	)
		external
		view
		returns (bool, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256)
	{
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		MAStorage.Layout storage maLayout = MAStorage.layout();
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		return (
			maLayout.liquidationStatus[partyA],
			accountLayout.allocatedBalances[partyA],
			accountLayout.lockedBalances[partyA].cva,
			accountLayout.lockedBalances[partyA].lf,
			accountLayout.lockedBalances[partyA].partyAmm,
			accountLayout.lockedBalances[partyA].partyBmm,
			accountLayout.pendingLockedBalances[partyA].cva,
			accountLayout.pendingLockedBalances[partyA].lf,
			accountLayout.pendingLockedBalances[partyA].partyAmm,
			accountLayout.pendingLockedBalances[partyA].partyBmm,
			quoteLayout.partyAPositionsCount[partyA],
			quoteLayout.partyAPendingQuotes[partyA].length,
			accountLayout.partyANonces[partyA],
			quoteLayout.quoteIdsOf[partyA].length
		);
	}

	/**
	 * @notice Returns balance information of Party A.
	 * @param partyA The address of Party A.
	 * @return allocatedBalances The allocated balances of Party A.
	 * @return lockedBalances The locked balances of Party A.
	 * @return pendingLockedBalances The pending locked balances of Party A.
	 */
	function balanceInfoOfPartyA(
		address partyA
	) external view returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256) {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		return (
			accountLayout.allocatedBalances[partyA],
			accountLayout.lockedBalances[partyA].cva,
			accountLayout.lockedBalances[partyA].lf,
			accountLayout.lockedBalances[partyA].partyAmm,
			accountLayout.lockedBalances[partyA].partyBmm,
			accountLayout.pendingLockedBalances[partyA].cva,
			accountLayout.pendingLockedBalances[partyA].lf,
			accountLayout.pendingLockedBalances[partyA].partyAmm,
			accountLayout.pendingLockedBalances[partyA].partyBmm
		);
	}

	/**
	 * @notice Returns balance information of Party B for a specific Party A.
	 * @param partyB The address of Party B.
	 * @param partyA The address of Party A.
	 * @return allocatedBalances The allocated balances of Party B for Party A.
	 * @return lockedBalances The locked balances of Party B for Party A.
	 * @return pendingLockedBalances The pending locked balances of Party B for Party A.
	 */
	function balanceInfoOfPartyB(
		address partyB,
		address partyA
	) external view returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256) {
		AccountStorage.Layout storage accountLayout = AccountStorage.layout();
		return (
			accountLayout.partyBAllocatedBalances[partyB][partyA],
			accountLayout.partyBLockedBalances[partyB][partyA].cva,
			accountLayout.partyBLockedBalances[partyB][partyA].lf,
			accountLayout.partyBLockedBalances[partyB][partyA].partyAmm,
			accountLayout.partyBLockedBalances[partyB][partyA].partyBmm,
			accountLayout.partyBPendingLockedBalances[partyB][partyA].cva,
			accountLayout.partyBPendingLockedBalances[partyB][partyA].lf,
			accountLayout.partyBPendingLockedBalances[partyB][partyA].partyAmm,
			accountLayout.partyBPendingLockedBalances[partyB][partyA].partyBmm
		);
	}

	/**
	 * @notice Returns the allocated balance of Party A.
	 * @param partyA The address of Party A.
	 * @return The allocated balance of Party A.
	 */
	function allocatedBalanceOfPartyA(address partyA) external view returns (uint256) {
		return AccountStorage.layout().allocatedBalances[partyA];
	}

	/**
	 * @notice Returns the allocated balance of Party B for a specific Party A.
	 * @param partyB The address of Party B.
	 * @param partyA The address of Party A.
	 * @return The allocated balance of Party B for Party A.
	 */
	function allocatedBalanceOfPartyB(address partyB, address partyA) external view returns (uint256) {
		return AccountStorage.layout().partyBAllocatedBalances[partyB][partyA];
	}

	/**
	 * @notice Returns the allocated balances of Party Bs for a specific Party A.
	 * @param partyA The address of Party A.
	 * @param partyBs The addresses of Party Bs.
	 * @return allocatedBalances The allocated balances of Party Bs for Party A.
	 */
	function allocatedBalanceOfPartyBs(address partyA, address[] memory partyBs) external view returns (uint256[] memory) {
		uint256[] memory allocatedBalances = new uint256[](partyBs.length);
		for (uint256 i = 0; i < partyBs.length; i++) {
			allocatedBalances[i] = AccountStorage.layout().partyBAllocatedBalances[partyBs[i]][partyA];
		}
		return allocatedBalances;
	}

	/**
	 * @notice Returns the withdrawal cooldown of a user(indicating the most recent time the user executed a deallocation.).
	 * @param user The address of the user.
	 * @return The withdrawal cooldown of the user.
	 */
	function withdrawCooldownOf(address user) external view returns (uint256) {
		return AccountStorage.layout().withdrawCooldown[user];
	}

	/**
	 * @notice Returns the nonce of Party A.
	 * @param partyA The address of Party A.
	 * @return The nonce of Party A.
	 */
	function nonceOfPartyA(address partyA) external view returns (uint256) {
		return AccountStorage.layout().partyANonces[partyA];
	}

	/**
	 * @notice Returns the nonce of Party B for a specific Party A.
	 * @param partyB The address of Party B.
	 * @param partyA The address of Party A.
	 * @return The nonce of Party B for Party A.
	 */
	function nonceOfPartyB(address partyB, address partyA) external view returns (uint256) {
		return AccountStorage.layout().partyBNonces[partyB][partyA];
	}

	/**
	 * @notice Checks whether a user is suspended.
	 * @param user The address of the user.
	 * @return A boolean indicating whether the user is suspended.
	 */
	function isSuspended(address user) external view returns (bool) {
		return AccountStorage.layout().suspendedAddresses[user];
	}

	/**
	 * @notice Returns the liquidated state details of Party A.
	 * @param partyA The address of Party A.
	 * @return The liquidation details of Party A.
	 */
	function getLiquidatedStateOfPartyA(address partyA) external view returns (LiquidationDetail memory) {
		return AccountStorage.layout().liquidationDetails[partyA];
	}

	/**
	 * @notice Returns the deallocate debounce time.
	 * @return deallocateDebounceTime.
	 */
	function getDeallocateDebounceTime() external view returns (uint256) {
		return MAStorage.layout().deallocateDebounceTime;
	}

	/**
	 * @notice Returns the settlement states of Party B for a specific Party A.
	 * @param partyA The address of Party A.
	 * @param partyBs The addresses of Party Bs.
	 * @return states The settlement states of Party Bs for Party A.
	 */
	function getSettlementStates(address partyA, address[] memory partyBs) external view returns (SettlementState[] memory) {
		SettlementState[] memory states = new SettlementState[](partyBs.length);
		for (uint256 i = 0; i < partyBs.length; i++) {
			states[i] = AccountStorage.layout().settlementStates[partyA][partyBs[i]];
		}
		return states;
	}

	/**
	 * @notice Returns the details of a symbol by its ID.
	 * @param symbolId The ID of the symbol.
	 * @return The details of the symbol.
	 */
	function getSymbol(uint256 symbolId) external view returns (Symbol memory) {
		return SymbolStorage.layout().symbols[symbolId];
	}

	/**
	 * @notice Returns an array of symbols starting from a specific index.
	 * @param start The starting index.
	 * @param size The size of the array.
	 * @return An array of symbols.
	 */
	function getSymbols(uint256 start, uint256 size) external view returns (Symbol[] memory) {
		SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
		if (symbolLayout.lastId < start + size) {
			size = symbolLayout.lastId - start;
		}
		Symbol[] memory symbols = new Symbol[](size);
		for (uint256 i = start; i < start + size; i++) {
			symbols[i - start] = symbolLayout.symbols[i + 1];
		}
		return symbols;
	}

	/**
	 * @notice Returns an array of symbols associated with an array of quote IDs.
	 * @param quoteIds An array of quote IDs.
	 * @return An array of symbols.
	 */
	function symbolsByQuoteId(uint256[] memory quoteIds) external view returns (Symbol[] memory) {
		Symbol[] memory symbols = new Symbol[](quoteIds.length);
		for (uint256 i = 0; i < quoteIds.length; i++) {
			symbols[i] = SymbolStorage.layout().symbols[QuoteStorage.layout().quotes[quoteIds[i]].symbolId];
		}
		return symbols;
	}

	/**
	 * @notice Returns an array of symbol names associated with an array of quote IDs.
	 * @param quoteIds An array of quote IDs.
	 * @return An array of symbol names.
	 */
	function symbolNameByQuoteId(uint256[] memory quoteIds) external view returns (string[] memory) {
		string[] memory symbols = new string[](quoteIds.length);
		for (uint256 i = 0; i < quoteIds.length; i++) {
			symbols[i] = SymbolStorage.layout().symbols[QuoteStorage.layout().quotes[quoteIds[i]].symbolId].name;
		}
		return symbols;
	}

	/**
	 * @notice Returns an array of symbol names associated with an array of symbol IDs.
	 * @param symbolIds An array of symbol IDs.
	 * @return An array of symbol names.
	 */
	function symbolNameById(uint256[] memory symbolIds) external view returns (string[] memory) {
		string[] memory symbols = new string[](symbolIds.length);
		for (uint256 i = 0; i < symbolIds.length; i++) {
			symbols[i] = SymbolStorage.layout().symbols[symbolIds[i]].name;
		}
		return symbols;
	}

	/**
	 * @notice Returns the details of a quote by its ID.
	 * @param quoteId The ID of the quote.
	 * @return The details of the quote.
	 */
	function getQuote(uint256 quoteId) external view returns (Quote memory) {
		return QuoteStorage.layout().quotes[quoteId];
	}

	/**
	 * @notice Returns an array of quotes associated with a parent quote ID.
	 * @param quoteId The parent quote ID.
	 * @param size The size of the array.
	 * @return An array of quotes.
	 */
	function getQuotesByParent(uint256 quoteId, uint256 size) external view returns (Quote[] memory) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote[] memory quotes = new Quote[](size);
		Quote memory quote = quoteLayout.quotes[quoteId];
		quotes[0] = quote;
		for (uint256 i = 1; i < size; i++) {
			if (quote.parentId == 0) {
				break;
			}
			quote = quoteLayout.quotes[quote.parentId];
			quotes[i] = quote;
		}
		return quotes;
	}

	/**
	 * @notice Returns an array of quote IDs associated with a party A address.
	 * @param partyA The address of party A.
	 * @param start The starting index.
	 * @param size The size of the array.
	 * @return An array of quote IDs.
	 */
	function quoteIdsOf(address partyA, uint256 start, uint256 size) external view returns (uint256[] memory) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		if (quoteLayout.quoteIdsOf[partyA].length < start + size) {
			size = quoteLayout.quoteIdsOf[partyA].length - start;
		}
		uint256[] memory quoteIds = new uint256[](size);
		for (uint256 i = start; i < start + size; i++) {
			quoteIds[i - start] = quoteLayout.quoteIdsOf[partyA][i];
		}
		return quoteIds;
	}

	/**
	 * @notice Returns an array of quotes associated with a party A address.
	 * @param partyA The address of party A.
	 * @param start The starting index.
	 * @param size The size of the array.
	 * @return An array of quotes.
	 */
	function getQuotes(address partyA, uint256 start, uint256 size) external view returns (Quote[] memory) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		if (quoteLayout.quoteIdsOf[partyA].length < start + size) {
			size = quoteLayout.quoteIdsOf[partyA].length - start;
		}
		Quote[] memory quotes = new Quote[](size);
		for (uint256 i = start; i < start + size; i++) {
			quotes[i - start] = quoteLayout.quotes[quoteLayout.quoteIdsOf[partyA][i]];
		}
		return quotes;
	}

	/**
	 * @notice Returns the length of the quotes array associated with a user.
	 * @param user The address of the user.
	 * @return The length of the quotes array.
	 */
	function quotesLength(address user) external view returns (uint256) {
		return QuoteStorage.layout().quoteIdsOf[user].length;
	}

	/**
	 * @notice Returns the number of open positions associated with a party A address.
	 * @param partyA The address of party A.
	 * @return The number of open positions.
	 */
	function partyAPositionsCount(address partyA) external view returns (uint256) {
		return QuoteStorage.layout().partyAPositionsCount[partyA];
	}

	/**
	 * @notice Returns an array of open positions associated with a party A address.
	 * @param partyA The address of party A.
	 * @param start The starting index.
	 * @param size The size of the array.
	 * @return An array of open positions.
	 */
	function getPartyAOpenPositions(address partyA, uint256 start, uint256 size) external view returns (Quote[] memory) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		if (quoteLayout.partyAOpenPositions[partyA].length < start + size) {
			size = quoteLayout.partyAOpenPositions[partyA].length - start;
		}
		Quote[] memory quotes = new Quote[](size);
		for (uint256 i = start; i < start + size; i++) {
			quotes[i - start] = quoteLayout.quotes[quoteLayout.partyAOpenPositions[partyA][i]];
		}
		return quotes;
	}

	/**
	 * @notice Returns an array of open positions associated with a party B address and a specific party A address.
	 * @param partyB The address of party B.
	 * @param partyA The address of party A.
	 * @param start The starting index.
	 * @param size The size of the array.
	 * @return An array of open positions.
	 */
	function getPartyBOpenPositions(address partyB, address partyA, uint256 start, uint256 size) external view returns (Quote[] memory) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		if (quoteLayout.partyBOpenPositions[partyB][partyA].length < start + size) {
			size = quoteLayout.partyBOpenPositions[partyB][partyA].length - start;
		}
		Quote[] memory quotes = new Quote[](size);
		for (uint256 i = start; i < start + size; i++) {
			quotes[i - start] = quoteLayout.quotes[quoteLayout.partyBOpenPositions[partyB][partyA][i]];
		}
		return quotes;
	}

	/**
	 * @notice Returns an array of positions associated with a party B address.
	 * @param partyB The address of party B.
	 * @param start The starting index.
	 * @param size The size of the array.
	 * @return An array of positions.
	 */
	function getPositionsFilteredByPartyB(address partyB, uint256 start, uint256 size) external view returns (Quote[] memory) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote[] memory quotes = new Quote[](size);
		uint j = 0;
		for (uint256 i = start; i < start + size; i++) {
			Quote memory quote = quoteLayout.quotes[i];
			if (quote.partyB == partyB) {
				quotes[j] = quote;
				j += 1;
			}
		}
		return quotes;
	}

	/**
	 * @notice Returns an array of open positions associated with a party B address.
	 * @param partyB The address of party B.
	 * @param start The starting index.
	 * @param size The size of the array.
	 * @return An array of open positions.
	 */
	function getOpenPositionsFilteredByPartyB(address partyB, uint256 start, uint256 size) external view returns (Quote[] memory) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote[] memory quotes = new Quote[](size);
		uint j = 0;
		for (uint256 i = start; i < start + size; i++) {
			Quote memory quote = quoteLayout.quotes[i];
			if (
				quote.partyB == partyB &&
				(quote.quoteStatus == QuoteStatus.OPENED ||
					quote.quoteStatus == QuoteStatus.CLOSE_PENDING ||
					quote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING)
			) {
				quotes[j] = quote;
				j += 1;
			}
		}
		return quotes;
	}

	/**
	 * @notice Returns an array of active positions associated with a party B address.
	 * @param partyB The address of party B.
	 * @param start The starting index.
	 * @param size The size of the array.
	 * @return An array of active positions.
	 */
	function getActivePositionsFilteredByPartyB(address partyB, uint256 start, uint256 size) external view returns (Quote[] memory) {
		QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
		Quote[] memory quotes = new Quote[](size);
		uint j = 0;
		for (uint256 i = start; i < start + size; i++) {
			Quote memory quote = quoteLayout.quotes[i];
			if (
				quote.partyB == partyB &&
				quote.quoteStatus != QuoteStatus.CANCELED &&
				quote.quoteStatus != QuoteStatus.CLOSED &&
				quote.quoteStatus != QuoteStatus.EXPIRED &&
				quote.quoteStatus != QuoteStatus.LIQUIDATED
			) {
				quotes[j] = quote;
				j += 1;
			}
		}
		return quotes;
	}

	/**
	 * @notice Returns the number of positions associated with a party B address and a specific party A address.
	 * @param partyB The address of party B.
	 * @param partyA The address of party A.
	 * @return The number of positions.
	 */
	function partyBPositionsCount(address partyB, address partyA) external view returns (uint256) {
		return QuoteStorage.layout().partyBPositionsCount[partyB][partyA];
	}

	/**
	 * @notice Returns an array of pending quotes associated with a party A address.
	 * @param partyA The address of party A.
	 * @return An array of pending quotes.
	 */
	function getPartyAPendingQuotes(address partyA) external view returns (uint256[] memory) {
		return QuoteStorage.layout().partyAPendingQuotes[partyA];
	}

	/**
	 * @notice Returns an array of pending quotes associated with a party B address and a specific party A address.
	 * @param partyB The address of party B.
	 * @param partyA The address of party A.
	 * @return An array of pending quotes.
	 */
	function getPartyBPendingQuotes(address partyB, address partyA) external view returns (uint256[] memory) {
		return QuoteStorage.layout().partyBPendingQuotes[partyB][partyA];
	}

	/**
	 * @notice Retrieves a filtered list of quotes based on a bitmap. The method returns quotes only if sufficient gas remains.
	 * @param bitmap A structured data type representing a bitmap, used to indicate which quotes to retrieve based on their positions. The bitmap consists of multiple elements, each with an offset and a 256-bit integer representing selectable quotes.
	 * @param gasNeededForReturn The minimum gas required to complete the function execution and return the data. This ensures the function doesn't start a retrieval that it can't complete.
	 * @return quotes An array of `Quote` structures, each corresponding to a quote identified by the bitmap.
	 */
	function getQuotesWithBitmap(
		Bitmap calldata bitmap,
		uint256 gasNeededForReturn
	) external view returns (Quote[] memory quotes) {
		QuoteStorage.Layout storage qL = QuoteStorage.layout();

		quotes = new Quote[](bitmap.size);
		uint256 quoteIndex = 0;

		for (uint256 i = 0; i < bitmap.elements.length; ++i) {
			uint256 bits = bitmap.elements[i].bitmap;
			uint256 offset = bitmap.elements[i].offset;
			while (bits > 0 && gasleft() > gasNeededForReturn) {
				if ((bits & 1) > 0) {
					quotes[quoteIndex] = qL.quotes[offset];
					++quoteIndex;
				}
				++offset;
				bits >>= 1;
			}
		}
	}

	/**
	 * @notice Checks if a user has a specific role.
	 * @param user The address of the user.
	 * @param role The role to check.
	 * @return True if the user has the role, false otherwise.
	 */
	function hasRole(address user, bytes32 role) external view returns (bool) {
		return GlobalAppStorage.layout().hasRole[user][role];
	}

	/**
	 * @notice Returns the hash of a role string.
	 * @param str The role string.
	 * @return The hash of the role string.
	 */
	function getRoleHash(string memory str) external pure returns (bytes32) {
		return keccak256(abi.encodePacked(str));
	}

	/**
	 * @notice Returns the address of the collateral contract.
	 * @return The address of the collateral contract.
	 */
	function getCollateral() external view returns (address) {
		return GlobalAppStorage.layout().collateral;
	}

	/**
	 * @notice Returns the address of the fee collector.
	 * @return The address of the fee collector.
	 */
	function getFeeCollector() external view returns (address) {
		return GlobalAppStorage.layout().feeCollector;
	}

	/**
	 * @notice Checks if a party A is liquidated.
	 * @param partyA The address of party A.
	 * @return True if party A is liquidated, false otherwise.
	 */
	function isPartyALiquidated(address partyA) external view returns (bool) {
		return MAStorage.layout().liquidationStatus[partyA];
	}

	/**
	 * @notice Checks if a party B of a specific party A is liquidated.
	 * @param partyB The address of party B.
	 * @param partyA The address of party A.
	 * @return True if party B is liquidated for the given party A, false otherwise.
	 */
	function isPartyBLiquidated(address partyB, address partyA) external view returns (bool) {
		return MAStorage.layout().partyBLiquidationStatus[partyB][partyA];
	}

	/**
	 * @notice Checks if a user is a party B.
	 * @param user The address of the user.
	 * @return True if the user is a party B, false otherwise.
	 */
	function isPartyB(address user) external view returns (bool) {
		return MAStorage.layout().partyBStatus[user];
	}

	/**
	 * @notice Returns the length of the pending quotes valid length.
	 * @return The length of the pending quotes valid length.
	 */
	function pendingQuotesValidLength() external view returns (uint256) {
		return MAStorage.layout().pendingQuotesValidLength;
	}

	/**
	 * @notice Returns the force close gap ratio.
	 * @return The force close gap ratio.
	 */
	function forceCloseGapRatio() external view returns (uint256) {
		return MAStorage.layout().forceCloseGapRatio;
	}

	/**
	 * @notice Returns the force close price penalty.
	 * @return The force close price penalty.
	 */
	function forceClosePricePenalty() external view returns (uint256) {
		return MAStorage.layout().forceClosePricePenalty;
	}

	/**
	 * @notice Returns the force close minimum signature period.
	 * @return The force close minimum signature period.
	 */
	function forceCloseMinSigPeriod() external view returns (uint256) {
		return MAStorage.layout().forceCloseMinSigPeriod;
	}

	/**
	 * @notice Returns the liquidator share.
	 * @return The liquidator share.
	 */
	function liquidatorShare() external view returns (uint256) {
		return MAStorage.layout().liquidatorShare;
	}

	/**
	 * @notice Returns the liquidation timeout.
	 * @return The liquidation timeout.
	 */
	function liquidationTimeout() external view returns (uint256) {
		return MAStorage.layout().liquidationTimeout;
	}

	/**
	 * @notice Returns the liquidation timestamp of a party B for a given party A.
	 * @param partyB The address of party B.
	 * @param partyA The address of party A.
	 * @return The liquidation timestamp of party B for the given party A.
	 */
	function partyBLiquidationTimestamp(address partyB, address partyA) external view returns (uint256) {
		return MAStorage.layout().partyBLiquidationTimestamp[partyB][partyA];
	}

	/**
	 * @notice Returns the cooldowns of the MA.
	 * @return deallocateCooldown The deallocate cooldown.
	 * @return forceCancelCooldown The force cancel cooldown.
	 * @return forceCancelCloseCooldown The force cancel close cooldown.
	 * @return forceCloseFirstCooldown The force close first cooldown.
	 * @return forceCloseSecondCooldown The force close second cooldown.
	 */
	function coolDownsOfMA() external view returns (uint256, uint256, uint256, uint256, uint256) {
		return (
			MAStorage.layout().deallocateCooldown,
			MAStorage.layout().forceCancelCooldown,
			MAStorage.layout().forceCancelCloseCooldown,
			MAStorage.layout().forceCloseFirstCooldown,
			MAStorage.layout().forceCloseSecondCooldown
		);
	}


	/**
	 * @notice Returns the deallocateCooldown.
	 * @return deallocateCooldown The deallocate cooldown.
	 */
	function deallocateCooldown() external view returns (uint256) {
		return MAStorage.layout().deallocateCooldown;
	}

	/**
	 * @notice Retrieves the configuration parameters of the Muon system.
	 * @return upnlValidTime The validity period of UPNL.
	 * @return priceValidTime The validity period of price.
	 */
	function getMuonConfig() external view returns (uint256 upnlValidTime, uint256 priceValidTime) {
		upnlValidTime = MuonStorage.layout().upnlValidTime;
		priceValidTime = MuonStorage.layout().priceValidTime;
	}

	/**
	 * @notice Retrieves the IDs and configuration parameters of the Muon system.
	 * @return muonAppId The Muon application ID.
	 * @return muonPublicKey The public key used by the Muon system.
	 * @return validGateway The address of the valid Muon gateway.
	 */
	function getMuonIds() external view returns (uint256 muonAppId, PublicKey memory muonPublicKey, address validGateway) {
		muonAppId = MuonStorage.layout().muonAppId;
		muonPublicKey = MuonStorage.layout().muonPublicKey;
		validGateway = MuonStorage.layout().validGateway;
	}

	/**
	 * @notice Retrieves the current pause state of the system.
	 * @return globalPaused The global pause state.
	 * @return liquidationPaused The liquidation pause state.
	 * @return accountingPaused The accounting pause state.
	 * @return partyBActionsPaused The pause state for party B actions.
	 * @return partyAActionsPaused The pause state for party A actions.
	 * @return internalTransferPaused The internal transfer pause state.
	 * @return emergencyMode The emergency mode state.
	 */
	function pauseState()
		external
		view
		returns (
			bool globalPaused,
			bool liquidationPaused,
			bool accountingPaused,
			bool partyBActionsPaused,
			bool partyAActionsPaused,
			bool internalTransferPaused,
			bool emergencyMode
		)
	{
		GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();
		return (
			appLayout.globalPaused,
			appLayout.liquidationPaused,
			appLayout.accountingPaused,
			appLayout.partyBActionsPaused,
			appLayout.partyAActionsPaused,
			appLayout.internalTransferPaused,
			appLayout.emergencyMode
		);
	}

	/**
	 * @notice Retrieves the emergency status of a party B.
	 * @param partyB The address of the party B.
	 * @return isEmergency The emergency status of the party B.
	 */
	function getPartyBEmergencyStatus(address partyB) external view returns (bool isEmergency) {
		return GlobalAppStorage.layout().partyBEmergencyStatus[partyB];
	}

	/**
	 * @notice Retrieves the balance limit per user.
	 * @return The balance limit per user.
	 */
	function getBalanceLimitPerUser() external view returns (uint256) {
		return GlobalAppStorage.layout().balanceLimitPerUser;
	}

	/**
	 * @notice Verifies The Muon signature of the Muon TSS and gateway.
	 * @param hash The hash to verify.
	 * @param sign The Schnorr signature.
	 * @param gatewaySignature The Muon signature from the gateway.
	 */
	function verifyMuonTSSAndGateway(bytes32 hash, SchnorrSign memory sign, bytes memory gatewaySignature) external view {
		LibMuon.verifyTSSAndGateway(hash, sign, gatewaySignature);
	}

	/**
	 * @notice Retrieves the next available quote ID.
	 * @return The next available quote ID.
	 */
	function getNextQuoteId() external view returns (uint256) {
		return QuoteStorage.layout().lastId;
	}

	/**
	 * @notice Retrieves the bridge transaction information.
	 * @param transactionId The ID of the bridge transaction.
	 * @return The bridge transaction information.
	 */
	function getBridgeTransaction(uint256 transactionId) external view returns (BridgeTransaction memory) {
		return BridgeStorage.layout().bridgeTransactions[transactionId];
	}

	/**
	 * @notice Retrieves the next available bridge transaction ID.
	 * @return The next available bridge transaction ID.
	 */
	function getNextBridgeTransactionId() external view returns (uint256) {
		return QuoteStorage.layout().lastId;
	}

	/**
	 * @notice Retrieves the close ID of a quote.
	 * @param quoteId The ID of the quote.
	 * @return The close ID of the quote.
	 */
	function getQuoteCloseId(uint256 quoteId) external view returns (uint256) {
		return QuoteStorage.layout().closeIds[quoteId];
	}
}
