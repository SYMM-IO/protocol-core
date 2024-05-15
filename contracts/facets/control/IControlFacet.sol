// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "./IControlEvents.sol";
import "../../storages/SymbolStorage.sol";
import "../../storages/MuonStorage.sol";

interface IControlFacet is IControlEvents {
	function transferOwnership(address owner) external;

	function setAdmin(address user) external;

	function grantRole(address user, bytes32 role) external;

	function revokeRole(address user, bytes32 role) external;

	function registerPartyB(address partyB) external;

	function deregisterPartyB(address partyB, uint256 index) external;

	function registerAffiliate(address affiliate) external;

	function deregisterAffiliate(address affiliate) external;

	function setMuonConfig(uint256 upnlValidTime, uint256 priceValidTime) external;

	function setMuonIds(uint256 muonAppId, address validGateway, PublicKey memory publicKey) external;

	function setCollateral(address collateral) external;

	// Symbol State

	function addSymbol(
		string memory name,
		uint256 minAcceptableQuoteValue,
		uint256 minAcceptablePortionLF,
		uint256 tradingFee,
		uint256 maxLeverage,
		uint256 fundingRateEpochDuration,
		uint256 fundingRateWindowTime
	) external;

	function addSymbols(Symbol[] memory symbols) external;

	function setSymbolFundingState(uint256 symbolId, uint256 fundingRateEpochDuration, uint256 fundingRateWindowTime) external;

	function setSymbolValidationState(uint256 symbolId, bool isValid) external;

	function setSymbolMaxLeverage(uint256 symbolId, uint256 maxLeverage) external;

	function setSymbolAcceptableValues(uint256 symbolId, uint256 minAcceptableQuoteValue, uint256 minAcceptablePortionLF) external;

	function setSymbolTradingFee(uint256 symbolId, uint256 tradingFee) external;

	/////////////////////////////////////

	// CoolDowns

	function setDeallocateCooldown(uint256 deallocateCooldown) external;

	function setForceCancelCooldown(uint256 forceCancelCooldown) external;

	function setForceCloseCooldowns(uint256 forceCloseFirstCooldown, uint256 forceCloseSecondCooldown) external;

	function setForceClosePricePenalty(uint256 forceClosePricePenalty) external;

	function setForceCloseMinSigPeriod(uint256 forceCloseMinSigPeriod) external;

	function setForceCancelCloseCooldown(uint256 forceCancelCloseCooldown) external;

	function setLiquidatorShare(uint256 liquidatorShare) external;

	function setForceCloseGapRatio(uint256 forceCloseGapRatio) external;

	function setPendingQuotesValidLength(uint256 pendingQuotesValidLength) external;

	function setDeallocateDebounceTime(uint256 deallocateDebounceTime) external;

	// Pause State
	function setFeeCollector(address affiliate, address feeCollector) external;

	function pauseGlobal() external;

	function pauseLiquidation() external;

	function pauseAccounting() external;

	function pausePartyAActions() external;

	function pausePartyBActions() external;

	function activeEmergencyMode() external;

	function unpauseGlobal() external;

	function unpauseLiquidation() external;

	function unpauseAccounting() external;

	function unpausePartyAActions() external;

	function unpausePartyBActions() external;

	function setLiquidationTimeout(uint256 liquidationTimeout) external;

	function suspendedAddress(address user) external;

	function unsuspendedAddress(address user) external;

	function deactiveEmergencyMode() external;

	function setBalanceLimitPerUser(uint256 balanceLimitPerUser) external;

	function setPartyBEmergencyStatus(address[] memory partyBs, bool status) external;

	function addBridge(address bridge) external;

	function removeBridge(address bridge) external;
}
