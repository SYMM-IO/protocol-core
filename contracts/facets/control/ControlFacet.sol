// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../../utils/Ownable.sol";
import "../../utils/Accessibility.sol";
import "../../storages/MAStorage.sol";
import "../../storages/MuonStorage.sol";
import "../../storages/GlobalAppStorage.sol";
import "../../storages/SymbolStorage.sol";
import "./IControlFacet.sol";
import "../../libraries/LibDiamond.sol";
import "../../storages/BridgeStorage.sol";

contract ControlFacet is Accessibility, Ownable, IControlFacet {
	/// @notice Transfers ownership of the contract to a new address.
	/// @dev This function can only be called by the current owner of the contract.
	/// @param owner The address of the new owner.
	function transferOwnership(address owner) external onlyOwner {
		require(owner != address(0), "ControlFacet: Zero address");
		LibDiamond.setContractOwner(owner);
	}

	/// @notice Grants admin role to a specified user.
	/// @dev This function can only be called by the current owner of the contract.
	/// @param user The address of the user to be granted admin role.
	function setAdmin(address user) external onlyOwner {
		require(user != address(0), "ControlFacet: Zero address");
		GlobalAppStorage.layout().hasRole[user][LibAccessibility.DEFAULT_ADMIN_ROLE] = true;
		emit RoleGranted(LibAccessibility.DEFAULT_ADMIN_ROLE, user);
	}

	/// @notice Grants a specified role to a user.
	/// @dev This function can only be called by users with the specified role.
	/// @param user The address of the user to whom the role will be granted.
	/// @param role The role to be granted(LibAccessibility)
	function grantRole(address user, bytes32 role) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		require(user != address(0), "ControlFacet: Zero address");
		GlobalAppStorage.layout().hasRole[user][role] = true;
		emit RoleGranted(role, user);
	}

	/// @notice Revokes a specified role from a user.
	/// @dev This function can only be called by users with the specified role.
	/// @param user The address of the user from whom the role will be revoked.
	/// @param role The role to be revoked(LibAccessibility)
	function revokeRole(address user, bytes32 role) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		GlobalAppStorage.layout().hasRole[user][role] = false;
		emit RoleRevoked(role, user);
	}

	/// @notice Registers a Party B address.
	/// @dev This function can only be called by users with the PARTY_B_MANAGER_ROLE.
	/// @param partyB The address of the Party B to be registered.
	function registerPartyB(address partyB) external onlyRole(LibAccessibility.PARTY_B_MANAGER_ROLE) {
		require(partyB != address(0), "ControlFacet: Zero address");
		require(!MAStorage.layout().partyBStatus[partyB], "ControlFacet: Address is already registered");
		MAStorage.layout().partyBStatus[partyB] = true;
		MAStorage.layout().partyBList.push(partyB);
		emit RegisterPartyB(partyB);
	}

	/// @notice Deregisters a Party B address.
	/// @dev This function can only be called by users with the PARTY_B_MANAGER_ROLE.
	/// @param partyB The address of the Party B to be deregistered.
	/// @param index The index of the Party B address in the partyBList.
	function deregisterPartyB(address partyB, uint256 index) external onlyRole(LibAccessibility.PARTY_B_MANAGER_ROLE) {
		require(partyB != address(0), "ControlFacet: Zero address");
		require(MAStorage.layout().partyBStatus[partyB], "ControlFacet: Address is not registered");
		require(MAStorage.layout().partyBList[index] == partyB, "ControlFacet: Invalid index");
		uint256 lastIndex = MAStorage.layout().partyBList.length - 1;
		require(index <= lastIndex, "ControlFacet: Invalid index");
		MAStorage.layout().partyBStatus[partyB] = false;
		MAStorage.layout().partyBList[index] = MAStorage.layout().partyBList[lastIndex];
		MAStorage.layout().partyBList.pop();
		emit DeregisterPartyB(partyB, index);
	}

	/// @notice Sets the configuration parameters for Muon.
	/// @dev This function can only be called by users with the MUON_SETTER_ROLE.
	/// @param upnlValidTime The validity duration for upnl.
	/// @param priceValidTime The validity duration for price.
	/// @param priceQuantityValidTime The validity duration for price and quantity.
	function setMuonConfig(
		uint256 upnlValidTime,
		uint256 priceValidTime,
		uint256 priceQuantityValidTime
	) external onlyRole(LibAccessibility.MUON_SETTER_ROLE) {
		emit SetMuonConfig(upnlValidTime, priceValidTime, priceQuantityValidTime);
		MuonStorage.Layout storage muonLayout = MuonStorage.layout();
		muonLayout.upnlValidTime = upnlValidTime;
		muonLayout.priceValidTime = priceValidTime;
		muonLayout.priceQuantityValidTime = priceQuantityValidTime;
	}

	/// @notice Sets the Muon application ID, valid gateway address, and public key.
	/// @dev This function can only be called by users with the MUON_SETTER_ROLE.
	/// @param muonAppId The Muon application ID.
	/// @param validGateway The address of the valid gateway.
	/// @param publicKey The public key for Muon
	function setMuonIds(uint256 muonAppId, address validGateway, PublicKey memory publicKey) external onlyRole(LibAccessibility.MUON_SETTER_ROLE) {
		MuonStorage.Layout storage muonLayout = MuonStorage.layout();
		muonLayout.muonAppId = muonAppId;
		muonLayout.validGateway = validGateway;
		muonLayout.muonPublicKey = publicKey;
		emit SetMuonIds(muonAppId, validGateway, publicKey.x, publicKey.parity);
	}

	/// @notice Sets the address of the collateral token.
	/// @dev This function can only be called by users with the DEFAULT_ADMIN_ROLE.
	/// @param collateral The address of the collateral token.
	function setCollateral(address collateral) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		require(collateral != address(0), "ControlFacet: Zero address");
		require(IERC20Metadata(collateral).decimals() <= 18, "ControlFacet: Token with more than 18 decimals not allowed");
		if (GlobalAppStorage.layout().collateral != address(0)) {
			require(
				IERC20Metadata(GlobalAppStorage.layout().collateral).balanceOf(address(this)) == 0,
				"ControlFacet: There is still collateral in the contract"
			);
		}
		GlobalAppStorage.layout().collateral = collateral;
		emit SetCollateral(collateral);
	}

	// Symbol State

	/// @notice Adds a new trading symbol with specified parameters.
	/// @dev This function can only be called by users with the SYMBOL_MANAGER_ROLE.
	/// @param name The name of the trading symbol.
	/// @param minAcceptableQuoteValue The minimum acceptable quote value for the symbol.
	/// @param minAcceptablePortionLF The minimum acceptable portion of liquidation fee.
	/// @param tradingFee The trading fee for the symbol.
	/// @param maxLeverage The maximum leverage allowed for the symbol.
	/// @param fundingRateEpochDuration The duration of each funding rate epoch for the symbol.
	/// @param fundingRateWindowTime The window time for calculating the funding rate.
	function addSymbol(
		string memory name,
		uint256 minAcceptableQuoteValue,
		uint256 minAcceptablePortionLF,
		uint256 tradingFee,
		uint256 maxLeverage,
		uint256 fundingRateEpochDuration,
		uint256 fundingRateWindowTime
	) public onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
		require(fundingRateWindowTime < fundingRateEpochDuration / 2, "ControlFacet: High window time");
		require(tradingFee <= 1e18, "ControlFacet: High trading fee");
		uint256 lastId = ++SymbolStorage.layout().lastId;
		Symbol memory symbol = Symbol(
			lastId,
			name,
			true,
			minAcceptableQuoteValue,
			minAcceptablePortionLF,
			tradingFee,
			maxLeverage,
			fundingRateEpochDuration,
			fundingRateWindowTime
		);
		SymbolStorage.layout().symbols[lastId] = symbol;
		emit AddSymbol(
			lastId,
			name,
			minAcceptableQuoteValue,
			minAcceptablePortionLF,
			tradingFee,
			maxLeverage,
			fundingRateEpochDuration,
			fundingRateWindowTime
		);
	}

	/// @notice Adds multiple symbols with specified parameters.
	/// @dev This function can only be called by users with the SYMBOL_MANAGER_ROLE.
	/// @param symbols An array of Symbol structs containing details of each symbol to be added.
	function addSymbols(Symbol[] memory symbols) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
		for (uint8 i; i < symbols.length; i++) {
			addSymbol(
				symbols[i].name,
				symbols[i].minAcceptableQuoteValue,
				symbols[i].minAcceptablePortionLF,
				symbols[i].tradingFee,
				symbols[i].maxLeverage,
				symbols[i].fundingRateEpochDuration,
				symbols[i].fundingRateWindowTime
			);
		}
	}

	/// @notice Sets the funding rate state for a specific symbol.
	/// @dev This function can only be called by users with the SYMBOL_MANAGER_ROLE.
	/// @param symbolId The ID of the symbol whose funding rate state is to be set.
	/// @param fundingRateEpochDuration The new duration of each funding rate epoch for the symbol.
	/// @param fundingRateWindowTime The new window time for calculating the funding rate.
	function setSymbolFundingState(
		uint256 symbolId,
		uint256 fundingRateEpochDuration,
		uint256 fundingRateWindowTime
	) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
		SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
		require(symbolId >= 1 && symbolId <= symbolLayout.lastId, "ControlFacet: Invalid id");
		require(fundingRateWindowTime < fundingRateEpochDuration / 2, "ControlFacet: High window time");
		symbolLayout.symbols[symbolId].fundingRateEpochDuration = fundingRateEpochDuration;
		symbolLayout.symbols[symbolId].fundingRateWindowTime = fundingRateWindowTime;
		emit SetSymbolFundingState(symbolId, fundingRateEpochDuration, fundingRateWindowTime);
	}

	/// @notice Sets the validation state of a specific symbol.
	/// @dev This function can only be called by users with the SYMBOL_MANAGER_ROLE.
	/// @param symbolId The ID of the symbol whose validation state is to be set.
	/// @param isValid The new validation state for the symbol.
	function setSymbolValidationState(uint256 symbolId, bool isValid) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
		SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
		require(symbolId >= 1 && symbolId <= symbolLayout.lastId, "ControlFacet: Invalid id");
		emit SetSymbolValidationState(symbolId, symbolLayout.symbols[symbolId].isValid, isValid);
		symbolLayout.symbols[symbolId].isValid = isValid;
	}

	/// @notice Sets the maximum leverage for a specific symbol.
	/// @dev This function can only be called by users with the SYMBOL_MANAGER_ROLE.
	/// @param symbolId The ID of the symbol whose maximum leverage is to be set.
	/// @param maxLeverage The new maximum leverage for the symbol.
	function setSymbolMaxLeverage(uint256 symbolId, uint256 maxLeverage) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
		SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
		require(symbolId >= 1 && symbolId <= symbolLayout.lastId, "ControlFacet: Invalid id");
		emit SetSymbolMaxLeverage(symbolId, symbolLayout.symbols[symbolId].maxLeverage, maxLeverage);
		symbolLayout.symbols[symbolId].maxLeverage = maxLeverage;
	}

	/// @notice Sets the acceptable values for a specific symbol.
	/// @dev This function can only be called by users with the SYMBOL_MANAGER_ROLE.
	/// @param symbolId The ID of the symbol whose acceptable values are to be set.
	/// @param minAcceptableQuoteValue The new minimum acceptable quote value for the symbol.
	/// @param minAcceptablePortionLF The new minimum acceptable portion of LF for the symbol.
	function setSymbolAcceptableValues(
		uint256 symbolId,
		uint256 minAcceptableQuoteValue,
		uint256 minAcceptablePortionLF
	) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
		SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
		require(symbolId >= 1 && symbolId <= symbolLayout.lastId, "ControlFacet: Invalid id");
		emit SetSymbolAcceptableValues(
			symbolId,
			symbolLayout.symbols[symbolId].minAcceptableQuoteValue,
			symbolLayout.symbols[symbolId].minAcceptablePortionLF,
			minAcceptableQuoteValue,
			minAcceptablePortionLF
		);
		symbolLayout.symbols[symbolId].minAcceptableQuoteValue = minAcceptableQuoteValue;
		symbolLayout.symbols[symbolId].minAcceptablePortionLF = minAcceptablePortionLF;
	}

	/// @notice Sets the trading fee for a specific symbol.
	/// @dev This function can only be called by users with the SYMBOL_MANAGER_ROLE.
	/// @param symbolId The ID of the symbol whose trading fee is to be set.
	/// @param tradingFee The new trading fee for the symbol.
	function setSymbolTradingFee(uint256 symbolId, uint256 tradingFee) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
		SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
		require(symbolId >= 1 && symbolId <= symbolLayout.lastId, "ControlFacet: Invalid id");
		emit SetSymbolTradingFee(symbolId, symbolLayout.symbols[symbolId].tradingFee, tradingFee);
		symbolLayout.symbols[symbolId].tradingFee = tradingFee;
	}

	/////////////////////////////////////

	// CoolDowns

	/// @notice Sets the cooldown period for deallocation.
	/// @dev This function can only be called by users with the SETTER_ROLE.
	/// @param deallocateCooldown The new cooldown period for deallocation, specified in seconds.
	function setDeallocateCooldown(uint256 deallocateCooldown) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetDeallocateCooldown(MAStorage.layout().deallocateCooldown, deallocateCooldown);
		MAStorage.layout().deallocateCooldown = deallocateCooldown;
	}

	/// @notice Sets the cooldown period for force cancellation.
	/// @dev This function can only be called by users with the SETTER_ROLE.
	/// @param forceCancelCooldown The new cooldown period for force cancellation, specified in seconds.
	function setForceCancelCooldown(uint256 forceCancelCooldown) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetForceCancelCooldown(MAStorage.layout().forceCancelCooldown, forceCancelCooldown);
		MAStorage.layout().forceCancelCooldown = forceCancelCooldown;
	}

	/// @notice Sets the cooldown periods for force closing positions.
	/// @dev This function can only be called by users with the SETTER_ROLE.
	/// @param forceCloseFirstCooldown The first new cooldown period, specified in seconds.
	/// @param forceCloseSecondCooldown The second new cooldown period, specified in seconds.
	function setForceCloseCooldowns(
		uint256 forceCloseFirstCooldown,
		uint256 forceCloseSecondCooldown
	) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetForceCloseCooldowns(
			MAStorage.layout().forceCloseFirstCooldown,
			forceCloseFirstCooldown,
			MAStorage.layout().forceCloseSecondCooldown,
			forceCloseSecondCooldown
		);
		MAStorage.layout().forceCloseFirstCooldown = forceCloseFirstCooldown;
		MAStorage.layout().forceCloseSecondCooldown = forceCloseSecondCooldown;
	}

	/// @notice Sets the penalty applied during force closing of positions based on price.
	/// @dev This function can only be called by users with the SETTER_ROLE.
	/// @param forceClosePricePenalty The new penalty applied during force closing of positions based on price.
	function setForceClosePricePenalty(uint256 forceClosePricePenalty) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetForceClosePricePenalty(MAStorage.layout().forceClosePricePenalty, forceClosePricePenalty);
		MAStorage.layout().forceClosePricePenalty = forceClosePricePenalty;
	}

	/// @notice Sets the minimum signature period required for force closing of positions.
	/// @dev This function can only be called by users with the SETTER_ROLE.
	/// @param forceCloseMinSigPeriod The new minimum signature period required for force closing of positions.
	function setForceCloseMinSigPeriod(uint256 forceCloseMinSigPeriod) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetForceCloseMinSigPeriod(MAStorage.layout().forceCloseMinSigPeriod, forceCloseMinSigPeriod);
		MAStorage.layout().forceCloseMinSigPeriod = forceCloseMinSigPeriod;
	}

	/// @notice Sets the cooldown period for force canceling of close requests.
	/// @dev This function can only be called by users with the SETTER_ROLE.
	/// @param forceCancelCloseCooldown The new cooldown period for force canceling of close requests, specified in seconds.
	function setForceCancelCloseCooldown(uint256 forceCancelCloseCooldown) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetForceCancelCloseCooldown(MAStorage.layout().forceCancelCloseCooldown, forceCancelCloseCooldown);
		MAStorage.layout().forceCancelCloseCooldown = forceCancelCloseCooldown;
	}

	/// @notice Sets the percentage of funds distributed to liquidators from liquidated positions.
	/// @dev This function can only be called by users with the SETTER_ROLE.
	/// @param liquidatorShare The new percentage of funds distributed to liquidators from liquidated positions.
	function setLiquidatorShare(uint256 liquidatorShare) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetLiquidatorShare(MAStorage.layout().liquidatorShare, liquidatorShare);
		MAStorage.layout().liquidatorShare = liquidatorShare;
	}

	/// @notice Sets the gap ratio used in force closing of positions.
	/// @dev This function can only be called by users with the SETTER_ROLE.
	/// @param forceCloseGapRatio The new gap ratio used in force closing of positions.
	function setForceCloseGapRatio(uint256 forceCloseGapRatio) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetForceCloseGapRatio(MAStorage.layout().forceCloseGapRatio, forceCloseGapRatio);
		MAStorage.layout().forceCloseGapRatio = forceCloseGapRatio;
	}

	/// @notice Sets the length of time for which pending quotes remain valid.
	/// @dev This function can only be called by users with the SETTER_ROLE.
	/// @param pendingQuotesValidLength The new length of time for which pending quotes remain valid, specified in seconds.
	function setPendingQuotesValidLength(uint256 pendingQuotesValidLength) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetPendingQuotesValidLength(MAStorage.layout().pendingQuotesValidLength, pendingQuotesValidLength);
		MAStorage.layout().pendingQuotesValidLength = pendingQuotesValidLength;
	}

	// Pause State

	/// @notice Sets the address responsible for collecting fees.
	/// @dev This function can only be called by users with the DEFAULT_ADMIN_ROLE.
	/// @param feeCollector The address responsible for collecting fees.
	function setFeeCollector(address feeCollector) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		require(feeCollector != address(0), "ControlFacet: Zero address");
		emit SetFeeCollector(GlobalAppStorage.layout().feeCollector, feeCollector);
		GlobalAppStorage.layout().feeCollector = feeCollector;
	}

	/// @notice Pauses global operations.
	/// @dev This function can only be called by users with the PAUSER_ROLE.
	function pauseGlobal() external onlyRole(LibAccessibility.PAUSER_ROLE) {
		GlobalAppStorage.layout().globalPaused = true;
		emit PauseGlobal();
	}

	/// @notice Pauses liquidation operations.
	/// @dev This function can only be called by users with the PAUSER_ROLE.
	function pauseLiquidation() external onlyRole(LibAccessibility.PAUSER_ROLE) {
		GlobalAppStorage.layout().liquidationPaused = true;
		emit PauseLiquidation();
	}

	/// @notice Pauses accounting operations.
	/// @dev This function can only be called by users with the PAUSER_ROLE.
	function pauseAccounting() external onlyRole(LibAccessibility.PAUSER_ROLE) {
		GlobalAppStorage.layout().accountingPaused = true;
		emit PauseAccounting();
	}

	/// @notice Pauses Party A actions.
	/// @dev This function can only be called by users with the PAUSER_ROLE.
	function pausePartyAActions() external onlyRole(LibAccessibility.PAUSER_ROLE) {
		GlobalAppStorage.layout().partyAActionsPaused = true;
		emit PausePartyAActions();
	}

	/// @notice Pauses Party B actions.
	/// @dev This function can only be called by users with the PAUSER_ROLE.
	function pausePartyBActions() external onlyRole(LibAccessibility.PAUSER_ROLE) {
		GlobalAppStorage.layout().partyBActionsPaused = true;
		emit PausePartyBActions();
	}

	/// @notice Pauses internal transfers.
	/// @dev This function can only be called by users with the PAUSER_ROLE.
	function pauseInternalTransfer() external onlyRole(LibAccessibility.PAUSER_ROLE) {
		GlobalAppStorage.layout().internalTransferPaused = true;
		emit PauseInternalTransfer();
	}

	/// @notice Activates emergency mode.
	/// @dev This function can only be called by users with the DEFAULT_ADMIN_ROLE.
	function activeEmergencyMode() external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		GlobalAppStorage.layout().emergencyMode = true;
		emit ActiveEmergencyMode();
	}

	/// @notice Unpauses global operations.
	/// @dev This function can only be called by users with the UNPAUSER_ROLE.
	function unpauseGlobal() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
		GlobalAppStorage.layout().globalPaused = false;
		emit UnpauseGlobal();
	}

	/// @notice Unpauses liquidation operations.
	/// @dev This function can only be called by users with the UNPAUSER_ROLE.
	function unpauseLiquidation() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
		GlobalAppStorage.layout().liquidationPaused = false;
		emit UnpauseLiquidation();
	}

	/// @notice Unpauses accounting operations.
	/// @dev This function can only be called by users with the UNPAUSER_ROLE.
	function unpauseAccounting() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
		GlobalAppStorage.layout().accountingPaused = false;
		emit UnpauseAccounting();
	}

	/// @notice Unpauses Party A actions.
	/// @dev This function can only be called by users with the UNPAUSER_ROLE.
	function unpausePartyAActions() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
		GlobalAppStorage.layout().partyAActionsPaused = false;
		emit UnpausePartyAActions();
	}

	/// @notice Unpauses Party B actions.
	/// @dev This function can only be called by users with the UNPAUSER_ROLE.
	function unpausePartyBActions() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
		GlobalAppStorage.layout().partyBActionsPaused = false;
		emit UnpausePartyBActions();
	}

	/// @notice Unpauses internal transfers.
	/// @dev This function can only be called by users with the UNPAUSER_ROLE.
	function unpauseInternalTransfer() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
		GlobalAppStorage.layout().internalTransferPaused = false;
		emit UnpauseInternalTransfer();
	}

	/// @notice Sets the timeout duration for liquidation.
	/// @dev This function can only be called by users with the SETTER_ROLE.
	/// @param liquidationTimeout The new timeout duration for liquidation, specified in seconds.
	function setLiquidationTimeout(uint256 liquidationTimeout) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetLiquidationTimeout(MAStorage.layout().liquidationTimeout, liquidationTimeout);
		MAStorage.layout().liquidationTimeout = liquidationTimeout;
	}

	/// @notice Suspends a user's address.
	/// @dev This function can only be called by users with the SUSPENDER_ROLE.
	/// @param user The address of the user to be suspended.
	function suspendedAddress(address user) external onlyRole(LibAccessibility.SUSPENDER_ROLE) {
		require(user != address(0), "ControlFacet: Zero address");
		emit SetSuspendedAddress(user, true);
		AccountStorage.layout().suspendedAddresses[user] = true;
	}

	/// @notice Unsuspends a user's address.
	/// @dev This function can only be called by users with the DEFAULT_ADMIN_ROLE.
	/// @param user The address of the user to be unsuspended.
	function unsuspendedAddress(address user) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		require(user != address(0), "ControlFacet: Zero address");
		emit SetSuspendedAddress(user, false);
		AccountStorage.layout().suspendedAddresses[user] = false;
	}

	/// @notice Deactivates emergency mode.
	/// @dev This function can only be called by users with the DEFAULT_ADMIN_ROLE.
	function deactiveEmergencyMode() external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		GlobalAppStorage.layout().emergencyMode = false;
		emit DeactiveEmergencyMode();
	}

	/// @notice Sets the balance limit per user.
	/// @dev This function can only be called by users with the DEFAULT_ADMIN_ROLE.
	/// @param balanceLimitPerUser The new balance limit per user.
	function setBalanceLimitPerUser(uint256 balanceLimitPerUser) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		emit SetBalanceLimitPerUser(balanceLimitPerUser);
		GlobalAppStorage.layout().balanceLimitPerUser = balanceLimitPerUser;
	}

	/// @notice Sets the emergency status for Party B addresses.
	/// @dev This function can only be called by users with the DEFAULT_ADMIN_ROLE.
	/// @param partyBs The addresses of Party B users.
	/// @param status The emergency status to be set.
	function setPartyBEmergencyStatus(address[] memory partyBs, bool status) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		for (uint8 i; i < partyBs.length; i++) {
			require(partyBs[i] != address(0), "ControlFacet: Zero address");
			GlobalAppStorage.layout().partyBEmergencyStatus[partyBs[i]] = status;
			emit SetPartyBEmergencyStatus(partyBs[i], status);
		}
	}

	/// @notice Adds a bridge contract address.
	/// @dev This function can only be called by users with the DEFAULT_ADMIN_ROLE.
	/// @param bridge The address of the bridge contract to be added.
	function addBridge(address bridge) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		emit AddBridge(bridge);
		BridgeStorage.layout().bridges[bridge] = true;
	}

	/// @notice Removes a bridge contract address.
	/// @dev This function can only be called by users with the DEFAULT_ADMIN_ROLE.
	/// @param bridge The address of the bridge contract to be removed.
	function removeBridge(address bridge) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		emit RemoveBridge(bridge);
		BridgeStorage.layout().bridges[bridge] = false;
	}
}
