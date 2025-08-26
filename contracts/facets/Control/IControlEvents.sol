// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

interface IControlEvents {
	event RoleGranted(bytes32 role, address user);
	event RoleRevoked(bytes32 role, address user);
	event SetMuonConfig(uint256 upnlValidTime, uint256 priceValidTime);
	event SetMuonIds(uint256 muonAppId);
	event SetCollateral(address collateral);
	event AddSymbol(
		uint256 symbolId,
		string name,
		uint256 minAcceptableQuoteValue,
		uint256 minAcceptablePortionLF,
		uint256 tradingFee,
		uint256 maxLeverage,
		uint256 fundingRateEpochDuration,
		uint256 fundingRateWindowTime
	);
	event SetFeeCollector(address affiliate, address oldFeeCollector, address newFeeCollector);
	event SetDefaultFeeCollector(address oldDefaultFeeCollector, address newDefaultFeeCollector);
	event SetSymbolValidationState(uint256 symbolId, bool oldState, bool isValid);
	event SetSymbolFundingState(uint256 symbolId, uint256 fundingRateEpochDuration, uint256 fundingRateWindowTime);
	event SetSymbolAcceptableValues(
		uint256 symbolId,
		uint256 oldMinAcceptableQuoteValue,
		uint256 oldMinAcceptablePortionLF,
		uint256 minAcceptableQuoteValue,
		uint256 minAcceptablePortionLF
	);
	event SetSymbolTradingFee(uint256 symbolId, uint256 oldTradingFee, uint256 tradingFee);
	event SetSymbolMaxSlippage(uint256 symbolId, uint256 oldMaxSlippage, uint256 maxSlippage);
	event SetSymbolMaxLeverage(uint256 symbolId, uint256 oldMaxLeverage, uint256 maxLeverage);
	event SetDeallocateCooldown(uint256 oldDeallocateCooldown, uint256 newDeallocateCooldown);
	event SetForceCancelCooldown(uint256 oldForceCancelCooldown, uint256 newForceCancelCooldown);
	event SetForceCloseCooldowns(
		uint256 oldForceCloseFirstCooldown,
		uint256 newForceCloseFirstCooldown,
		uint256 oldForceCloseSecondCooldown,
		uint256 newForceCloseSecondCooldown
	);
	event SetSymbolType(uint256 symbolIds, uint256 symbolTypes);
	event SetForceClosePricePenalty(uint256 oldPricePenalty, uint256 newPricePenalty);
	event SetForceCloseMinSigPeriod(uint256 oldCloseMinSigPeriod, uint256 newCloseMinSigPeriod);
	event SetForceCancelCloseCooldown(uint256 oldForceCancelCloseCooldown, uint256 newForceCancelCloseCooldown);
	event SetSettlementCooldown(uint256 oldSettlementCooldown, uint256 newSettlementCooldown);
	event SetUnbindCooldown(uint256 oldUnbindCooldown, uint256 newUnbindCooldown);
	event SetLiquidatorShare(uint256 oldLiquidatorShare, uint256 newLiquidatorShare);
	event SetForceCloseGapRatio(uint256 symbolId, uint256 oldForceCloseGapRatio, uint256 newForceCloseGapRatio);
	event SetPendingQuotesValidLength(uint256 oldPendingQuotesValidLength, uint256 newPendingQuotesValidLength);
	event SetDeallocateDebounceTime(uint256 oldDeallocateDebounceTime, uint256 newDeallocateDebounceTime);
	event SetInvalidBridgedAmountsPool(address oldInvalidBridgedAmountsPool, address newInvalidBridgedAmountsPool);
	event PauseGlobal();
	event PauseLiquidation();
	event PauseAccounting();
	event PausePartyAActions();
	event PausePartyBActions();
	event PauseInternalTransfer();
	event PauseExternalTransfer();
	event ActiveEmergencyMode();
	event UnpauseGlobal();
	event UnpauseLiquidation();
	event UnpauseAccounting();
	event UnpausePartyAActions();
	event UnpausePartyBActions();
	event UnpauseInternalTransfer();
	event UnpauseExternalTransfer();
	event DeactiveEmergencyMode();
	event SetLiquidationTimeout(uint256 oldLiquidationTimeout, uint256 newLiquidationTimeout);
	event SetSuspendedAddress(address user, bool isSuspended);
	event SetPartyBEmergencyStatus(address partyB, bool status);
	event SetBalanceLimitPerUser(uint256 balanceLimitPerUser);
	event RegisterPartyB(address partyB);
	event DeregisterPartyB(address partyB, uint256 index);
	event RegisterAffiliate(address affilate);
	event DeregisterAffiliate(address affilate);
	event AddBridge(address bridge);
	event RemoveBridge(address bridge);
	event AddVirtualBridge(address bridge);
	event RemoveVirtualBridge(address bridge);
	event SetLiquidationInsuranceVaultParams(address insuranceVault, uint256 maxLiquidationProfit);
	event SetPartyBWhitelistedSymbolTypeStatus(address partyB, uint256 symbolType, bool isWhiteList);
	event SetSignatureVerifierAddress(address SignatureVerifier);
	event AddRelayerForExternalTransferTarget(address target, address relayer);
	event RemoveRelayerForExternalTransferTarget(address target);
	event RegisterHook(address affiliate, address hook);
}
