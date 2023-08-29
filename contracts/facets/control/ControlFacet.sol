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
import "./IControlEvents.sol";

contract ControlFacet is Accessibility, Ownable, IControlEvents {
    // Just For Testnet
    function init(address user, address collateral, address feeCollector) external onlyOwner {
        MAStorage.Layout storage maLayout = MAStorage.layout();
        GlobalAppStorage.Layout storage appLayout = GlobalAppStorage.layout();

        appLayout.collateral = collateral;
        appLayout.balanceLimitPerUser = 500e18;
        appLayout.feeCollector = feeCollector;
        maLayout.deallocateCooldown = 300;
        maLayout.forceCancelCooldown = 3000000000000000;
        maLayout.forceCloseCooldown = 3000000000000000;
        maLayout.forceCancelCloseCooldown = 3000000000000000;
        maLayout.pendingQuotesValidLength = 15;
        maLayout.liquidatorShare = 80e16;
        maLayout.liquidationTimeout = 600;
        appLayout.hasRole[user][LibAccessibility.DEFAULT_ADMIN_ROLE] = true;
        appLayout.hasRole[user][LibAccessibility.SYMBOL_MANAGER_ROLE] = true;
        appLayout.hasRole[user][LibAccessibility.MUON_SETTER_ROLE] = true;
        appLayout.hasRole[user][LibAccessibility.SETTER_ROLE] = true;
        appLayout.hasRole[user][LibAccessibility.PARTY_B_MANAGER_ROLE] = true;
    }

    function setAdmin(address user) external onlyOwner {
        GlobalAppStorage.layout().hasRole[user][LibAccessibility.DEFAULT_ADMIN_ROLE] = true;
        emit RoleGranted(LibAccessibility.DEFAULT_ADMIN_ROLE, user);
    }

    function grantRole(
        address user,
        bytes32 role
    ) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        GlobalAppStorage.layout().hasRole[user][role] = true;
        emit RoleGranted(role, user);
    }

    function revokeRole(
        address user,
        bytes32 role
    ) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        GlobalAppStorage.layout().hasRole[user][role] = false;
        emit RoleRevoked(role, user);
    }

    function registerPartyB(
        address partyB
    ) external onlyRole(LibAccessibility.PARTY_B_MANAGER_ROLE) {
        require(partyB != address(0), "ControlFacet: Zero address");
        require(
            !MAStorage.layout().partyBStatus[partyB],
            "ControlFacet: Address is already registered"
        );
        MAStorage.layout().partyBStatus[partyB] = true;
        MAStorage.layout().partyBList.push(partyB);
        emit RegisterPartyB(partyB);
    }

    function deregisterPartyB(
        address partyB,
        uint256 index
    ) external onlyRole(LibAccessibility.PARTY_B_MANAGER_ROLE) {
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

    function setMuonIds(
        uint256 muonAppId,
        address validGateway,
        PublicKey memory publicKey
    ) external onlyRole(LibAccessibility.MUON_SETTER_ROLE) {
        MuonStorage.Layout storage muonLayout = MuonStorage.layout();
        muonLayout.muonAppId = muonAppId;
        muonLayout.validGateway = validGateway;
        muonLayout.muonPublicKey = publicKey;
        emit SetMuonIds(muonAppId, validGateway, publicKey.x, publicKey.parity);
    }

    function setCollateral(
        address collateral
    ) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        require(
            IERC20Metadata(collateral).decimals() <= 18,
            "ControlFacet: Token with more than 18 decimals not allowed"
        );
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

    function addSymbol(
        string memory name,
        uint256 minAcceptableQuoteValue,
        uint256 minAcceptablePortionLF,
        uint256 tradingFee,
        uint256 maxLeverage,
        uint256 fundingRateEpochDuration,
        uint256 fundingRateWindowTime
    ) public onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
        require(
            fundingRateWindowTime < fundingRateEpochDuration / 2,
            "ControlFacet: High window time"
        );
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

    function addSymbols(
        Symbol[] memory symbols
    ) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
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

    function setSymbolFundingState(
        uint256 symbolId,
        uint256 fundingRateEpochDuration,
        uint256 fundingRateWindowTime
    ) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
        SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
        require(symbolId >= 1 && symbolId <= symbolLayout.lastId, "ControlFacet: Invalid id");
        require(
            fundingRateWindowTime < fundingRateEpochDuration / 2,
            "ControlFacet: High window time"
        );
        symbolLayout.symbols[symbolId].fundingRateEpochDuration = fundingRateEpochDuration;
        symbolLayout.symbols[symbolId].fundingRateWindowTime = fundingRateWindowTime;
        emit SetSymbolFundingState(symbolId, fundingRateEpochDuration, fundingRateWindowTime);
    }

    function setSymbolValidationState(
        uint256 symbolId,
        bool isValid
    ) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
        SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
        require(symbolId >= 1 && symbolId <= symbolLayout.lastId, "ControlFacet: Invalid id");
        emit SetSymbolValidationState(symbolId, symbolLayout.symbols[symbolId].isValid, isValid);
        symbolLayout.symbols[symbolId].isValid = isValid;
    }

    function setSymbolMaxLeverage(
        uint256 symbolId,
        uint256 maxLeverage
    ) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
        SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
        require(symbolId >= 1 && symbolId <= symbolLayout.lastId, "ControlFacet: Invalid id");
        emit SetSymbolMaxLeverage(symbolId, symbolLayout.symbols[symbolId].maxLeverage, maxLeverage);
        symbolLayout.symbols[symbolId].maxLeverage = maxLeverage;
    }

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

    function setSymbolTradingFee(
        uint256 symbolId,
        uint256 tradingFee
    ) external onlyRole(LibAccessibility.SYMBOL_MANAGER_ROLE) {
        SymbolStorage.Layout storage symbolLayout = SymbolStorage.layout();
        require(symbolId >= 1 && symbolId <= symbolLayout.lastId, "ControlFacet: Invalid id");
        emit SetSymbolTradingFee(symbolId, symbolLayout.symbols[symbolId].tradingFee, tradingFee);
        symbolLayout.symbols[symbolId].tradingFee = tradingFee;
    }

    /////////////////////////////////////

    // CoolDowns

    function setDeallocateCooldown(
        uint256 deallocateCooldown
    ) external onlyRole(LibAccessibility.SETTER_ROLE) {
        emit SetDeallocateCooldown(MAStorage.layout().deallocateCooldown, deallocateCooldown);
        MAStorage.layout().deallocateCooldown = deallocateCooldown;
    }

    function setForceCancelCooldown(
        uint256 forceCancelCooldown
    ) external onlyRole(LibAccessibility.SETTER_ROLE) {
        emit SetForceCancelCooldown(MAStorage.layout().forceCancelCooldown, forceCancelCooldown);
        MAStorage.layout().forceCancelCooldown = forceCancelCooldown;
    }

    function setForceCloseCooldown(
        uint256 forceCloseCooldown
    ) external onlyRole(LibAccessibility.SETTER_ROLE) {
        emit SetForceCloseCooldown(MAStorage.layout().forceCloseCooldown, forceCloseCooldown);
        MAStorage.layout().forceCloseCooldown = forceCloseCooldown;
    }

    function setForceCancelCloseCooldown(
        uint256 forceCancelCloseCooldown
    ) external onlyRole(LibAccessibility.SETTER_ROLE) {
        emit SetForceCancelCloseCooldown(
            MAStorage.layout().forceCancelCloseCooldown,
            forceCancelCloseCooldown
        );
        MAStorage.layout().forceCancelCloseCooldown = forceCancelCloseCooldown;
    }

    function setLiquidatorShare(
        uint256 liquidatorShare
    ) external onlyRole(LibAccessibility.SETTER_ROLE) {
        emit SetLiquidatorShare(MAStorage.layout().liquidatorShare, liquidatorShare);
        MAStorage.layout().liquidatorShare = liquidatorShare;
    }

    function setForceCloseGapRatio(
        uint256 forceCloseGapRatio
    ) external onlyRole(LibAccessibility.SETTER_ROLE) {
        emit SetForceCloseGapRatio(MAStorage.layout().forceCloseGapRatio, forceCloseGapRatio);
        MAStorage.layout().forceCloseGapRatio = forceCloseGapRatio;
    }

    function setPendingQuotesValidLength(
        uint256 pendingQuotesValidLength
    ) external onlyRole(LibAccessibility.SETTER_ROLE) {
        emit SetPendingQuotesValidLength(
            MAStorage.layout().pendingQuotesValidLength,
            pendingQuotesValidLength
        );
        MAStorage.layout().pendingQuotesValidLength = pendingQuotesValidLength;
    }

    // Pause State

    function setFeeCollector(
        address feeCollector
    ) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        emit SetFeeCollector(GlobalAppStorage.layout().feeCollector, feeCollector);
        GlobalAppStorage.layout().feeCollector = feeCollector;
    }

    function pauseGlobal() external onlyRole(LibAccessibility.PAUSER_ROLE) {
        GlobalAppStorage.layout().globalPaused = true;
        emit PauseGlobal();
    }

    function pauseLiquidation() external onlyRole(LibAccessibility.PAUSER_ROLE) {
        GlobalAppStorage.layout().liquidationPaused = true;
        emit PauseLiquidation();
    }

    function pauseAccounting() external onlyRole(LibAccessibility.PAUSER_ROLE) {
        GlobalAppStorage.layout().accountingPaused = true;
        emit PauseAccounting();
    }

    function pausePartyAActions() external onlyRole(LibAccessibility.PAUSER_ROLE) {
        GlobalAppStorage.layout().partyAActionsPaused = true;
        emit PausePartyAActions();
    }

    function pausePartyBActions() external onlyRole(LibAccessibility.PAUSER_ROLE) {
        GlobalAppStorage.layout().partyBActionsPaused = true;
        emit PausePartyBActions();
    }

    function activeEmergencyMode() external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        GlobalAppStorage.layout().emergencyMode = true;
        emit ActiveEmergencyMode();
    }

    function unpauseGlobal() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
        GlobalAppStorage.layout().globalPaused = false;
        emit UnpauseGlobal();
    }

    function unpauseLiquidation() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
        GlobalAppStorage.layout().liquidationPaused = false;
        emit UnpauseLiquidation();
    }

    function unpauseAccounting() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
        GlobalAppStorage.layout().accountingPaused = false;
        emit UnpauseAccounting();
    }

    function unpausePartyAActions() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
        GlobalAppStorage.layout().partyAActionsPaused = false;
        emit UnpausePartyAActions();
    }

    function unpausePartyBActions() external onlyRole(LibAccessibility.UNPAUSER_ROLE) {
        GlobalAppStorage.layout().partyBActionsPaused = false;
        emit UnpausePartyBActions();
    }

    function setLiquidationTimeout(
        uint256 liquidationTimeout
    ) external onlyRole(LibAccessibility.SETTER_ROLE) {
        emit SetLiquidationTimeout(MAStorage.layout().liquidationTimeout, liquidationTimeout);
        MAStorage.layout().liquidationTimeout = liquidationTimeout;
    }

    function setSuspendedAddress(
        address user,
        bool isSuspended
    ) external onlyRole(LibAccessibility.SETTER_ROLE) {
        emit SetSuspendedAddress(user, isSuspended);
        AccountStorage.layout().suspendedAddresses[user] = isSuspended;
    }

    function deactiveEmergencyMode() external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        GlobalAppStorage.layout().emergencyMode = false;
        emit DeactiveEmergencyMode();
    }

    function setBalanceLimitPerUser(
        uint256 balanceLimitPerUser
    ) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        emit SetBalanceLimitPerUser(balanceLimitPerUser);
        GlobalAppStorage.layout().balanceLimitPerUser = balanceLimitPerUser;
    }

    function setPartyBEmergencyStatus(
        address[] memory partyBs,
        bool status
    ) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        for (uint8 i; i < partyBs.length; i++) {
            GlobalAppStorage.layout().partyBEmergencyStatus[partyBs[i]] = status;
            emit SetPartyBEmergencyStatus(partyBs[i], status);
        }
    }
}
