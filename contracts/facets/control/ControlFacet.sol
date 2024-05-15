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
	/// @param user The address of the user to whom the role will be granted.
	/// @param role The role to be granted
	function grantRole(address user, bytes32 role) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		require(user != address(0), "ControlFacet: Zero address");
		GlobalAppStorage.layout().hasRole[user][role] = true;
		emit RoleGranted(role, user);
	}

	/// @notice Revokes a specified role from a user.
	/// @param user The address of the user from whom the role will be revoked.
	/// @param role The role to be revoked
	function revokeRole(address user, bytes32 role) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		GlobalAppStorage.layout().hasRole[user][role] = false;
		emit RoleRevoked(role, user);
	}

	/// @notice Registers a Party B into the system.
	/// @param partyB The address of the Party B to be registered.
	function registerPartyB(address partyB) external onlyRole(LibAccessibility.PARTY_B_MANAGER_ROLE) {
		require(partyB != address(0), "ControlFacet: Zero address");
		require(!MAStorage.layout().partyBStatus[partyB], "ControlFacet: Address is already registered");
		MAStorage.layout().partyBStatus[partyB] = true;
		MAStorage.layout().partyBList.push(partyB);
		emit RegisterPartyB(partyB);
	}

	/// @notice Deregisters a Party B from the system.
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

	/// @notice Registers an affiliate into the system.
	/// @param affiliate The address of the affiliate to be registered.
	function registerAffiliate(address affiliate) external onlyRole(LibAccessibility.AFFILIATE_MANAGER_ROLE) {
		require(affiliate != address(0), "ControlFacet: Zero address");
		require(!MAStorage.layout().affiliateStatus[affiliate], "ControlFacet: Address is already registered");
		MAStorage.layout().affiliateStatus[affiliate] = true;
		emit RegisterAffiliate(affiliate);
	}

	/// @notice Deregisters an affiliate from the system.
	/// @param affiliate The address of the affiliate to be deregistered.
	function deregisterAffiliate(address affiliate) external onlyRole(LibAccessibility.AFFILIATE_MANAGER_ROLE) {
		require(affiliate != address(0), "ControlFacet: Zero address");
		require(MAStorage.layout().affiliateStatus[affiliate], "ControlFacet: Address is not registered");
		MAStorage.layout().affiliateStatus[affiliate] = false;
		emit DeregisterAffiliate(affiliate);
	}

	/// @notice Sets the configuration parameters for Muon.
	/// @param upnlValidTime The validity duration for upnl.
	/// @param priceValidTime The validity duration for price.
	function setMuonConfig(uint256 upnlValidTime, uint256 priceValidTime) external onlyRole(LibAccessibility.MUON_SETTER_ROLE) {
		emit SetMuonConfig(upnlValidTime, priceValidTime);
		MuonStorage.Layout storage muonLayout = MuonStorage.layout();
		muonLayout.upnlValidTime = upnlValidTime;
		muonLayout.priceValidTime = priceValidTime;
	}

	/// @notice Sets the Muon application ID, valid gateway address, and public key.
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

	/// @notice Sets number of allowed pending qutoes per user.
	/// @param pendingQuotesValidLength The number of pending quotes allowd.
	function setPendingQuotesValidLength(uint256 pendingQuotesValidLength) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetPendingQuotesValidLength(MAStorage.layout().pendingQuotesValidLength, pendingQuotesValidLength);
		MAStorage.layout().pendingQuotesValidLength = pendingQuotesValidLength;
	}

	/// @notice Sets the address which protocol fees for an specific affiliate are being transferred to in the system.
	/// @param affiliate The address of affiliate.
	/// @param feeCollector The address of fee collector.
	function setFeeCollector(address affiliate, address feeCollector) external onlyRole(LibAccessibility.AFFILIATE_MANAGER_ROLE) {
		require(feeCollector != address(0), "ControlFacet: Zero address");
		require(MAStorage.layout().affiliateStatus[affiliate], "ControlFacet: Invalid affiliate");
		emit SetFeeCollector(affiliate, GlobalAppStorage.layout().affiliateFeeCollector[affiliate], feeCollector);
		GlobalAppStorage.layout().affiliateFeeCollector[affiliate] = feeCollector;
	}

	/// @notice Sets the deallocate debounce time. User can't deallocate more than once in this window
	/// @param deallocateDebounceTime in seconds.
	function setDeallocateDebounceTime(uint256 deallocateDebounceTime) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetDeallocateDebounceTime(MAStorage.layout().deallocateDebounceTime, deallocateDebounceTime);
		MAStorage.layout().deallocateDebounceTime = deallocateDebounceTime;
	}

	// Symbol State //////////////////////////////////////////////////////////////////

	/// @notice Adds a new trading symbol.
	/// @param name The name of the trading symbol.
	/// @param minAcceptableQuoteValue The minimum acceptable quote value for the symbol.
	/// @param minAcceptablePortionLF The minimum acceptable portion of liquidation fee in quote.
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

	/// @notice Adds multiple symbols in one call.
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

	/// @notice Sets the funding rate params for a specific symbol.
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

	/// @notice Validates or invalidates a symbol.
	/// @param symbolId The ID of the symbol whose validation state is to be set.
	/// @param isValid The new validation state for the symbol.
	function setSymbolValidationState(uint256 symbolId, bool isValid) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
		SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
		require(symbolId >= 1 && symbolId <= symbolLayout.lastId, "ControlFacet: Invalid id");
		emit SetSymbolValidationState(symbolId, symbolLayout.symbols[symbolId].isValid, isValid);
		symbolLayout.symbols[symbolId].isValid = isValid;
	}

	/// @notice Sets the maximum leverage for a specific symbol.
	/// @param symbolId The ID of the symbol whose maximum leverage is to be set.
	/// @param maxLeverage The new maximum leverage for the symbol.
	function setSymbolMaxLeverage(uint256 symbolId, uint256 maxLeverage) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
		SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
		require(symbolId >= 1 && symbolId <= symbolLayout.lastId, "ControlFacet: Invalid id");
		emit SetSymbolMaxLeverage(symbolId, symbolLayout.symbols[symbolId].maxLeverage, maxLeverage);
		symbolLayout.symbols[symbolId].maxLeverage = maxLeverage;
	}

	/// @notice Sets the minimum acceptable values for a specific symbol.
	/// @param symbolId The ID of the symbol whose acceptable values are to be set.
	/// @param minAcceptableQuoteValue The new minimum acceptable quote value for the symbol.
	/// @param minAcceptablePortionLF The new minimum acceptable LF portion of a quote for the symbol.
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
	/// @param symbolId The ID of the symbol whose trading fee is to be set.
	/// @param tradingFee The new trading fee for the symbol.
	function setSymbolTradingFee(uint256 symbolId, uint256 tradingFee) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
		SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
		require(symbolId >= 1 && symbolId <= symbolLayout.lastId, "ControlFacet: Invalid id");
		emit SetSymbolTradingFee(symbolId, symbolLayout.symbols[symbolId].tradingFee, tradingFee);
		symbolLayout.symbols[symbolId].tradingFee = tradingFee;
	}

	// CoolDowns //////////////////////////////////////////////////

	/// @notice Sets the cooldown period for deallocation, requiring users to wait before they can proceed with withdrawals.
	/// @param deallocateCooldown The new cooldown period for deallocation, specified in seconds.
	function setDeallocateCooldown(uint256 deallocateCooldown) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetDeallocateCooldown(MAStorage.layout().deallocateCooldown, deallocateCooldown);
		MAStorage.layout().deallocateCooldown = deallocateCooldown;
	}

	/// @notice Sets the cooldown period for force cancellation, mandating that users wait after submitting a cancellation request before they are permitted to initiate a force cancellation.
	/// @param forceCancelCooldown The new cooldown period for force cancellation, specified in seconds.
	function setForceCancelCooldown(uint256 forceCancelCooldown) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetForceCancelCooldown(MAStorage.layout().forceCancelCooldown, forceCancelCooldown);
		MAStorage.layout().forceCancelCooldown = forceCancelCooldown;
	}

	/// @notice Sets the cooldown periods for force closing positions.These parameters define the minimum time frames: one is for before the target price is reached, and the other one is for after that.
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

	/// @notice Sets the penalty applied to partyB during force closing of positions.
	/// @param forceClosePricePenalty The new penalty applied during force closing of positions based on price.
	function setForceClosePricePenalty(uint256 forceClosePricePenalty) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetForceClosePricePenalty(MAStorage.layout().forceClosePricePenalty, forceClosePricePenalty);
		MAStorage.layout().forceClosePricePenalty = forceClosePricePenalty;
	}

	/// @notice Sets the minimum signature period required for force closing of positions.
	/// @param forceCloseMinSigPeriod The new minimum signature period required for force closing of positions.
	function setForceCloseMinSigPeriod(uint256 forceCloseMinSigPeriod) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetForceCloseMinSigPeriod(MAStorage.layout().forceCloseMinSigPeriod, forceCloseMinSigPeriod);
		MAStorage.layout().forceCloseMinSigPeriod = forceCloseMinSigPeriod;
	}

	/// @notice Sets the cooldown period for force canceling of close requests. Requiring users to observe a waiting period before they can forcefully cancel their closure requests.
	/// @param forceCancelCloseCooldown The new cooldown period for force canceling of close requests, specified in seconds.
	function setForceCancelCloseCooldown(uint256 forceCancelCloseCooldown) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetForceCancelCloseCooldown(MAStorage.layout().forceCancelCloseCooldown, forceCancelCloseCooldown);
		MAStorage.layout().forceCancelCloseCooldown = forceCancelCloseCooldown;
	}

	/// @notice Sets the percentage of funds distributed to liquidators from liquidated positions.
	/// @param liquidatorShare The new percentage of funds distributed to liquidators from liquidated positions.
	function setLiquidatorShare(uint256 liquidatorShare) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetLiquidatorShare(MAStorage.layout().liquidatorShare, liquidatorShare);
		MAStorage.layout().liquidatorShare = liquidatorShare;
	}

	/// @notice Sets the gap ratio used in force closing of positions.
	/// @param forceCloseGapRatio The new gap ratio used in force closing of positions.
	function setForceCloseGapRatio(uint256 forceCloseGapRatio) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetForceCloseGapRatio(MAStorage.layout().forceCloseGapRatio, forceCloseGapRatio);
		MAStorage.layout().forceCloseGapRatio = forceCloseGapRatio;
	}

	// Pause State //////////////////////////////////////////////////

	/// @notice Pauses global operations.
	function pauseGlobal() external onlyRole(LibAccessibility.PAUSER_ROLE) {
		GlobalAppStorage.layout().globalPaused = true;
		emit PauseGlobal();
	}

	/// @notice Pauses liquidation operations.
	function pauseLiquidation() external onlyRole(LibAccessibility.PAUSER_ROLE) {
		GlobalAppStorage.layout().liquidationPaused = true;
		emit PauseLiquidation();
	}

	/// @notice Pauses accounting operations.
	function pauseAccounting() external onlyRole(LibAccessibility.PAUSER_ROLE) {
		GlobalAppStorage.layout().accountingPaused = true;
		emit PauseAccounting();
	}

	/// @notice Pauses Party A actions.
	function pausePartyAActions() external onlyRole(LibAccessibility.PAUSER_ROLE) {
		GlobalAppStorage.layout().partyAActionsPaused = true;
		emit PausePartyAActions();
	}

	/// @notice Pauses Party B actions.
	function pausePartyBActions() external onlyRole(LibAccessibility.PAUSER_ROLE) {
		GlobalAppStorage.layout().partyBActionsPaused = true;
		emit PausePartyBActions();
	}

	/// @notice Pauses internal transfers.
	function pauseInternalTransfer() external onlyRole(LibAccessibility.PAUSER_ROLE) {
		GlobalAppStorage.layout().internalTransferPaused = true;
		emit PauseInternalTransfer();
	}

	/// @notice Activates emergency mode.
	function activeEmergencyMode() external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		GlobalAppStorage.layout().emergencyMode = true;
		emit ActiveEmergencyMode();
	}

	/// @notice Unpauses global operations.
	function unpauseGlobal() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
		GlobalAppStorage.layout().globalPaused = false;
		emit UnpauseGlobal();
	}

	/// @notice Unpauses liquidation operations.
	function unpauseLiquidation() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
		GlobalAppStorage.layout().liquidationPaused = false;
		emit UnpauseLiquidation();
	}

	/// @notice Unpauses accounting operations.
	function unpauseAccounting() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
		GlobalAppStorage.layout().accountingPaused = false;
		emit UnpauseAccounting();
	}

	/// @notice Unpauses Party A actions.
	function unpausePartyAActions() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
		GlobalAppStorage.layout().partyAActionsPaused = false;
		emit UnpausePartyAActions();
	}

	/// @notice Unpauses Party B actions.
	function unpausePartyBActions() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
		GlobalAppStorage.layout().partyBActionsPaused = false;
		emit UnpausePartyBActions();
	}

	/// @notice Unpauses internal transfers.
	function unpauseInternalTransfer() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
		GlobalAppStorage.layout().internalTransferPaused = false;
		emit UnpauseInternalTransfer();
	}

	/// @notice Sets the timeout duration for liquidation.
	/// @param liquidationTimeout The new timeout duration for liquidation, specified in seconds.
	function setLiquidationTimeout(uint256 liquidationTimeout) external onlyRole(LibAccessibility.SETTER_ROLE) {
		emit SetLiquidationTimeout(MAStorage.layout().liquidationTimeout, liquidationTimeout);
		MAStorage.layout().liquidationTimeout = liquidationTimeout;
	}

	/// @notice Suspends a user's address.
	/// @param user The address of the user to be suspended.
	function suspendedAddress(address user) external onlyRole(LibAccessibility.SUSPENDER_ROLE) {
		require(user != address(0), "ControlFacet: Zero address");
		emit SetSuspendedAddress(user, true);
		AccountStorage.layout().suspendedAddresses[user] = true;
	}

	/// @notice Unsuspends a user's address.
	/// @param user The address of the user to be unsuspended.
	function unsuspendedAddress(address user) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		require(user != address(0), "ControlFacet: Zero address");
		emit SetSuspendedAddress(user, false);
		AccountStorage.layout().suspendedAddresses[user] = false;
	}

	/// @notice Deactivates emergency mode.
	function deactiveEmergencyMode() external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		GlobalAppStorage.layout().emergencyMode = false;
		emit DeactiveEmergencyMode();
	}

	/// @notice Sets the balance limit per user.
	/// @param balanceLimitPerUser The new balance limit per user.
	function setBalanceLimitPerUser(uint256 balanceLimitPerUser) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		emit SetBalanceLimitPerUser(balanceLimitPerUser);
		GlobalAppStorage.layout().balanceLimitPerUser = balanceLimitPerUser;
	}

	/// @notice Sets the emergency status for Party B addresses.
	/// @param partyBs The addresses of Party B users.
	/// @param status The emergency status to be set.
	function setPartyBEmergencyStatus(address[] memory partyBs, bool status) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		for (uint8 i; i < partyBs.length; i++) {
			require(partyBs[i] != address(0), "ControlFacet: Zero address");
			GlobalAppStorage.layout().partyBEmergencyStatus[partyBs[i]] = status;
			emit SetPartyBEmergencyStatus(partyBs[i], status);
		}
	}

	/// @notice Adds a bridge.
	/// @param bridge The address of the bridge to be added.
	function addBridge(address bridge) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		emit AddBridge(bridge);
		BridgeStorage.layout().bridges[bridge] = true;
	}

	/// @notice Removes a bridge.
	/// @param bridge The address of the bridge to be removed.
	function removeBridge(address bridge) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
		emit RemoveBridge(bridge);
		BridgeStorage.layout().bridges[bridge] = false;
	}
}
