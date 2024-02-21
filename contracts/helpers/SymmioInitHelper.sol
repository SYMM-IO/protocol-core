// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "../interfaces/ISymmio.sol";

contract SymmioInitHelper is AccessControlEnumerable {
	bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");

	address public symmioAddress;

	/**
	 * @dev Constructor that sets the `symmioAddress` and assigns the admin and setter roles.
	 * @param _symmioAddress Address to be set as `symmioAddress`.
	 * @param admin Address to be given all roles.
	 */
	constructor(address _symmioAddress, address admin) {
		symmioAddress = _symmioAddress;

		_setupRole(DEFAULT_ADMIN_ROLE, admin);
		_setupRole(SETTER_ROLE, admin);
	}

	function setSymmioAddress(address _symmioAddress) external {
		require(hasRole(SETTER_ROLE, msg.sender), "SymmioInitHelper: Caller is not a setter");
		symmioAddress = _symmioAddress;
	}

	function setCooldowns(
		uint256 deallocateCooldown,
		uint256 forceCancelCooldown,
		uint256 forceCancelCloseCooldown,
		uint256 forceCloseFirstCooldown,
		uint256 forceCloseSecondCooldown,
		uint256 forceClosePricePenalty,
		uint256 forceCloseMinSigPeriod,
		uint256 forceCloseGapRatio,
		uint256 liquidationTimeout
	) external onlyRole(SETTER_ROLE) {
		ISymmio(symmioAddress).setDeallocateCooldown(deallocateCooldown);
		ISymmio(symmioAddress).setForceCancelCooldown(forceCancelCooldown);
		ISymmio(symmioAddress).setForceCloseCooldowns(forceCloseFirstCooldown, forceCloseSecondCooldown);
		ISymmio(symmioAddress).setForceClosePricePenalty(forceClosePricePenalty);
		ISymmio(symmioAddress).setForceCancelCloseCooldown(forceCancelCloseCooldown);
		ISymmio(symmioAddress).setForceCloseMinSigPeriod(forceCloseMinSigPeriod);
		ISymmio(symmioAddress).setForceCloseGapRatio(forceCloseGapRatio);
		ISymmio(symmioAddress).setLiquidationTimeout(liquidationTimeout);
	}

	function setSymbolParameters(
		uint256 symbolId,
		bool isValid,
		uint256 maxLeverage,
		uint256 minAcceptableQuoteValue,
		uint256 minAcceptablePortionLF,
		uint256 tradingFee,
		uint256 fundingRateEpochDuration,
		uint256 fundingRateWindowTime
	) external onlyRole(SETTER_ROLE) {
		ISymmio(symmioAddress).setSymbolValidationState(symbolId, isValid);
		ISymmio(symmioAddress).setSymbolMaxLeverage(symbolId, maxLeverage);
		ISymmio(symmioAddress).setSymbolAcceptableValues(symbolId, minAcceptableQuoteValue, minAcceptablePortionLF);
		ISymmio(symmioAddress).setSymbolTradingFee(symbolId, tradingFee);
		ISymmio(symmioAddress).setSymbolFundingState(symbolId, fundingRateEpochDuration, fundingRateWindowTime);
	}

	function setPlatformParameters(
		address partyB,
		uint256 muonAppId,
		address validGateway,
		PublicKey memory publicKey,
		address collateral,
		uint256 liquidatorShare,
		uint256 pendingQuotesValidLength,
		address feeCollector,
		uint256 balanceLimitPerUser
	) external onlyRole(SETTER_ROLE) {
		ISymmio(symmioAddress).registerPartyB(partyB);
		ISymmio(symmioAddress).setMuonIds(muonAppId, validGateway, publicKey);
		ISymmio(symmioAddress).setCollateral(collateral);
		ISymmio(symmioAddress).setLiquidatorShare(liquidatorShare);
		ISymmio(symmioAddress).setPendingQuotesValidLength(pendingQuotesValidLength);
		ISymmio(symmioAddress).setFeeCollector(feeCollector);
		ISymmio(symmioAddress).setBalanceLimitPerUser(balanceLimitPerUser);
	}
}
