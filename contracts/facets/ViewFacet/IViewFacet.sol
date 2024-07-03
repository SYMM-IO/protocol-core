// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../storages/AccountStorage.sol";
import "../../storages/SymbolStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../storages/BridgeStorage.sol";

interface IViewFacet {
	struct Bitmap {
		uint256 size;
		BitmapElement[] elements;
	}

	struct BitmapElement {
		uint256 offset;
		uint256 bitmap;
	}

	// Account
	function balanceOf(address user) external view returns (uint256);

	function partyAStats(
		address partyA
	)
		external
		view
		returns (bool, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256);

	function balanceInfoOfPartyA(
		address partyA
	) external view returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256);

	function balanceInfoOfPartyB(
		address partyB,
		address partyA
	) external view returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256);

	function allocatedBalanceOfPartyA(address partyA) external view returns (uint256);

	function allocatedBalanceOfPartyB(address partyB, address partyA) external view returns (uint256);

	function allocatedBalanceOfPartyBs(address partyA, address[] memory partyBs) external view returns (uint256[] memory);

	function withdrawCooldownOf(address user) external view returns (uint256);

	function nonceOfPartyA(address partyA) external view returns (uint256);

	function nonceOfPartyB(address partyB, address partyA) external view returns (uint256);

	function isSuspended(address user) external view returns (bool);

	function getLiquidatedStateOfPartyA(address partyA) external view returns (LiquidationDetail memory);

	function getDeallocateDebounceTime() external view returns (uint256);

	function getInvalidBridgedAmountsPool() external view returns (address);

	function getSettlementStates(address partyA, address[] memory partyBs) external view returns (SettlementState[] memory);

	///////////////////////////////////////////

	// Symbols
	function getSymbol(uint256 symbolId) external view returns (Symbol memory);

	function getSymbols(uint256 start, uint256 size) external view returns (Symbol[] memory);

	function symbolsByQuoteId(uint256[] memory quoteIds) external view returns (Symbol[] memory);

	function symbolNameByQuoteId(uint256[] memory quoteIds) external view returns (string[] memory);

	function symbolNameById(uint256[] memory symbolIds) external view returns (string[] memory);

	////////////////////////////////////

	// Quotes
	function getQuote(uint256 quoteId) external view returns (Quote memory);

	function getQuotesByParent(uint256 quoteId, uint256 size) external view returns (Quote[] memory);

	function quoteIdsOf(address partyA, uint256 start, uint256 size) external view returns (uint256[] memory);

	function getQuotes(address partyA, uint256 start, uint256 size) external view returns (Quote[] memory);

	function quotesLength(address user) external view returns (uint256);

	function partyAPositionsCount(address partyA) external view returns (uint256);

	function getBridgeTransactions(address bridge, uint256 start, uint256 size) external view returns (BridgeTransaction[] memory);

	function getPartyAOpenPositions(address partyA, uint256 start, uint256 size) external view returns (Quote[] memory);

	function getPartyBOpenPositions(address partyB, address partyA, uint256 start, uint256 size) external view returns (Quote[] memory);

	function getPositionsFilteredByPartyB(address partyB, uint256 start, uint256 size) external view returns (Quote[] memory);

	function getOpenPositionsFilteredByPartyB(address partyB, uint256 start, uint256 size) external view returns (Quote[] memory);

	function getActivePositionsFilteredByPartyB(address partyB, uint256 start, uint256 size) external view returns (Quote[] memory);

	function partyBPositionsCount(address partyB, address partyA) external view returns (uint256);

	function getPartyAPendingQuotes(address partyA) external view returns (uint256[] memory);

	function getPartyBPendingQuotes(address partyB, address partyA) external view returns (uint256[] memory);

	function getQuotesWithBitmap(Bitmap calldata bitmap, uint256 gasNeededForReturn) external view returns (Quote[] memory quotes);

	/////////////////////////////////////

	// Role
	function hasRole(address user, bytes32 role) external view returns (bool);

	function getRoleHash(string memory str) external pure returns (bytes32);

	//////////////////////////////////////

	// MA
	function getCollateral() external view returns (address);

	function getFeeCollector(address affiliate) external view returns (address);

	function isPartyALiquidated(address partyA) external view returns (bool);

	function isPartyBLiquidated(address partyB, address partyA) external view returns (bool);

	function isPartyB(address user) external view returns (bool);

	function isAffiliate(address affiliate) external view returns (bool);

	function pendingQuotesValidLength() external view returns (uint256);

	function forceCloseGapRatio(uint256 symbolId) external view returns (uint256);

	function forceClosePricePenalty() external view returns (uint256);

	function forceCloseMinSigPeriod() external view returns (uint256);

	function liquidatorShare() external view returns (uint256);

	function liquidationTimeout() external view returns (uint256);

	function partyBLiquidationTimestamp(address partyB, address partyA) external view returns (uint256);

	function coolDownsOfMA() external view returns (uint256, uint256, uint256, uint256);

	///////////////////////////////////////////

	function getMuonConfig() external view returns (uint256 upnlValidTime, uint256 priceValidTime);

	function getMuonIds() external view returns (uint256 muonAppId, PublicKey memory muonPublicKey, address validGateway);

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
		);

	function getPartyBEmergencyStatus(address partyB) external view returns (bool isEmergency);

	function getBalanceLimitPerUser() external view returns (uint256);

	function verifyMuonTSSAndGateway(bytes32 hash, SchnorrSign memory sign, bytes memory gatewaySignature) external view;

	function getNextQuoteId() external view returns (uint256);

	function getBridgeTransaction(uint256 transactionId) external view returns (BridgeTransaction memory);

	function getNextBridgeTransactionId() external view returns (uint256);
}
