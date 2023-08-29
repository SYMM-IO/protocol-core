// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../libraries/LibLockedValues.sol";
import "../libraries/LibQuote.sol";
import "../libraries/LibMuon.sol";
import "../storages/AccountStorage.sol";
import "../storages/MAStorage.sol";
import "../storages/QuoteStorage.sol";
import "../storages/GlobalAppStorage.sol";
import "../storages/SymbolStorage.sol";
import "../storages/MuonStorage.sol";
import "../libraries/LibLockedValues.sol";

contract ViewFacet {
    using LockedValuesOps for LockedValues;

    // Account
    function balanceOf(address user) external view returns (uint256) {
        return AccountStorage.layout().balances[user];
    }

    function partyAStats(
        address partyA
    )
        external
        view
        returns (
            bool,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        MAStorage.Layout storage maLayout = MAStorage.layout();
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        return (
            maLayout.liquidationStatus[partyA],
            accountLayout.allocatedBalances[partyA],
            accountLayout.lockedBalances[partyA].cva,
            accountLayout.lockedBalances[partyA].mm,
            accountLayout.lockedBalances[partyA].lf,
            accountLayout.lockedBalances[partyA].total(),
            accountLayout.pendingLockedBalances[partyA].cva,
            accountLayout.pendingLockedBalances[partyA].mm,
            accountLayout.pendingLockedBalances[partyA].lf,
            accountLayout.pendingLockedBalances[partyA].total(),
            quoteLayout.partyAPositionsCount[partyA],
            quoteLayout.partyAPendingQuotes[partyA].length,
            accountLayout.partyANonces[partyA],
            quoteLayout.quoteIdsOf[partyA].length
        );
    }

    function balanceInfoOfPartyA(
        address partyA
    )
        external
        view
        returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256)
    {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        return (
            accountLayout.allocatedBalances[partyA],
            accountLayout.lockedBalances[partyA].cva,
            accountLayout.lockedBalances[partyA].mm,
            accountLayout.lockedBalances[partyA].lf,
            accountLayout.lockedBalances[partyA].total(),
            accountLayout.pendingLockedBalances[partyA].cva,
            accountLayout.pendingLockedBalances[partyA].mm,
            accountLayout.pendingLockedBalances[partyA].lf,
            accountLayout.pendingLockedBalances[partyA].total()
        );
    }

    function balanceInfoOfPartyB(
        address partyB,
        address partyA
    )
        external
        view
        returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256)
    {
        AccountStorage.Layout storage accountLayout = AccountStorage.layout();
        return (
            accountLayout.partyBAllocatedBalances[partyB][partyA],
            accountLayout.partyBLockedBalances[partyB][partyA].cva,
            accountLayout.partyBLockedBalances[partyB][partyA].mm,
            accountLayout.partyBLockedBalances[partyB][partyA].lf,
            accountLayout.partyBLockedBalances[partyB][partyA].total(),
            accountLayout.partyBPendingLockedBalances[partyB][partyA].cva,
            accountLayout.partyBPendingLockedBalances[partyB][partyA].mm,
            accountLayout.partyBPendingLockedBalances[partyB][partyA].lf,
            accountLayout.partyBPendingLockedBalances[partyB][partyA].total()
        );
    }

    function allocatedBalanceOfPartyA(address partyA) external view returns (uint256) {
        return AccountStorage.layout().allocatedBalances[partyA];
    }

    function allocatedBalanceOfPartyB(
        address partyB,
        address partyA
    ) external view returns (uint256) {
        return AccountStorage.layout().partyBAllocatedBalances[partyB][partyA];
    }

    function allocatedBalanceOfPartyBs(
        address partyA,
        address[] memory partyBs
    ) external view returns (uint256[] memory) {
        uint256[] memory allocatedBalances = new uint256[](partyBs.length);
        for (uint256 i = 0; i < partyBs.length; i++) {
            allocatedBalances[i] = AccountStorage.layout().partyBAllocatedBalances[partyBs[i]][partyA];
        }
        return allocatedBalances;
    }

    function withdrawCooldownOf(address user) external view returns (uint256) {
        return AccountStorage.layout().withdrawCooldown[user];
    }

    function nonceOfPartyA(address partyA) external view returns (uint256) {
        return AccountStorage.layout().partyANonces[partyA];
    }

    function nonceOfPartyB(address partyB, address partyA) external view returns (uint256) {
        return AccountStorage.layout().partyBNonces[partyB][partyA];
    }

    function isSuspended(address user) external view returns (bool) {
        return AccountStorage.layout().suspendedAddresses[user];
    }

    function getLiquidatedStateOfPartyA(address partyA) external view returns (LiquidationDetail memory){
        return AccountStorage.layout().liquidationDetails[partyA];
    }

    ///////////////////////////////////////////

    // Symbols
    function getSymbol(uint256 symbolId) external view returns (Symbol memory) {
        return SymbolStorage.layout().symbols[symbolId];
    }

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

    function symbolsByQuoteId(uint256[] memory quoteIds) external view returns (Symbol[] memory) {
        Symbol[] memory symbols = new Symbol[](quoteIds.length);
        for (uint256 i = 0; i < quoteIds.length; i++) {
            symbols[i] = SymbolStorage.layout().symbols[
                QuoteStorage.layout().quotes[quoteIds[i]].symbolId
            ];
        }
        return symbols;
    }

    function symbolNameByQuoteId(
        uint256[] memory quoteIds
    ) external view returns (string[] memory) {
        string[] memory symbols = new string[](quoteIds.length);
        for (uint256 i = 0; i < quoteIds.length; i++) {
            symbols[i] = SymbolStorage
                .layout()
                .symbols[QuoteStorage.layout().quotes[quoteIds[i]].symbolId]
                .name;
        }
        return symbols;
    }

    function symbolNameById(uint256[] memory symbolIds) external view returns (string[] memory) {
        string[] memory symbols = new string[](symbolIds.length);
        for (uint256 i = 0; i < symbolIds.length; i++) {
            symbols[i] = SymbolStorage.layout().symbols[symbolIds[i]].name;
        }
        return symbols;
    }

    ////////////////////////////////////

    // Quotes
    function getQuote(uint256 quoteId) external view returns (Quote memory) {
        return QuoteStorage.layout().quotes[quoteId];
    }

    function getQuotesByParent(
        uint256 quoteId,
        uint256 size
    ) external view returns (Quote[] memory) {
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

    function quoteIdsOf(
        address partyA,
        uint256 start,
        uint256 size
    ) external view returns (uint256[] memory) {
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

    function getQuotes(
        address partyA,
        uint256 start,
        uint256 size
    ) external view returns (Quote[] memory) {
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

    function quotesLength(address user) external view returns (uint256) {
        return QuoteStorage.layout().quoteIdsOf[user].length;
    }

    function partyAPositionsCount(address partyA) external view returns (uint256) {
        return QuoteStorage.layout().partyAPositionsCount[partyA];
    }

    function getPartyAOpenPositions(
        address partyA,
        uint256 start,
        uint256 size
    ) external view returns (Quote[] memory) {
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

    function getPartyBOpenPositions(
        address partyB,
        address partyA,
        uint256 start,
        uint256 size
    ) external view returns (Quote[] memory) {
        QuoteStorage.Layout storage quoteLayout = QuoteStorage.layout();
        if (quoteLayout.partyBOpenPositions[partyB][partyA].length < start + size) {
            size = quoteLayout.partyBOpenPositions[partyB][partyA].length - start;
        }
        Quote[] memory quotes = new Quote[](size);
        for (uint256 i = start; i < start + size; i++) {
            quotes[i - start] = quoteLayout.quotes[
                quoteLayout.partyBOpenPositions[partyB][partyA][i]
            ];
        }
        return quotes;
    }

    function partyBPositionsCount(address partyB, address partyA) external view returns (uint256) {
        return QuoteStorage.layout().partyBPositionsCount[partyB][partyA];
    }

    function getPartyAPendingQuotes(address partyA) external view returns (uint256[] memory) {
        return QuoteStorage.layout().partyAPendingQuotes[partyA];
    }

    function getPartyBPendingQuotes(
        address partyB,
        address partyA
    ) external view returns (uint256[] memory) {
        return QuoteStorage.layout().partyBPendingQuotes[partyB][partyA];
    }

    /////////////////////////////////////

    // Role
    function hasRole(address user, bytes32 role) external view returns (bool) {
        return GlobalAppStorage.layout().hasRole[user][role];
    }

    function getRoleHash(string memory str) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(str));
    }

    //////////////////////////////////////

    // MA
    function getCollateral() external view returns (address) {
        return GlobalAppStorage.layout().collateral;
    }

    function getFeeCollector() external view returns (address) {
        return GlobalAppStorage.layout().feeCollector;
    }

    function isPartyALiquidated(address partyA) external view returns (bool) {
        return MAStorage.layout().liquidationStatus[partyA];
    }

    function isPartyBLiquidated(address partyB, address partyA) external view returns (bool) {
        return MAStorage.layout().partyBLiquidationStatus[partyB][partyA];
    }

    function isPartyB(address user) external view returns (bool) {
        return MAStorage.layout().partyBStatus[user];
    }

    function pendingQuotesValidLength() external view returns (uint256) {
        return MAStorage.layout().pendingQuotesValidLength;
    }

    function forceCloseGapRatio() external view returns (uint256) {
        return MAStorage.layout().forceCloseGapRatio;
    }

    function liquidatorShare() external view returns (uint256) {
        return MAStorage.layout().liquidatorShare;
    }

    function liquidationTimeout() external view returns (uint256) {
        return MAStorage.layout().liquidationTimeout;
    }

    function partyBLiquidationTimestamp(
        address partyB,
        address partyA
    ) external view returns (uint256) {
        return MAStorage.layout().partyBLiquidationTimestamp[partyB][partyA];
    }

    function coolDownsOfMA() external view returns (uint256, uint256, uint256, uint256) {
        return (
            MAStorage.layout().deallocateCooldown,
            MAStorage.layout().forceCancelCooldown,
            MAStorage.layout().forceCancelCloseCooldown,
            MAStorage.layout().forceCloseCooldown
        );
    }

    ///////////////////////////////////////////

    function getMuonConfig()
        external
        view
        returns (uint256 upnlValidTime, uint256 priceValidTime, uint256 priceQuantityValidTime)
    {
        upnlValidTime = MuonStorage.layout().upnlValidTime;
        priceValidTime = MuonStorage.layout().priceValidTime;
        priceQuantityValidTime = MuonStorage.layout().priceQuantityValidTime;
    }

    function getMuonIds()
        external
        view
        returns (uint256 muonAppId, PublicKey memory muonPublicKey, address validGateway)
    {
        muonAppId = MuonStorage.layout().muonAppId;
        muonPublicKey = MuonStorage.layout().muonPublicKey;
        validGateway = MuonStorage.layout().validGateway;
    }

    function pauseState()
        external
        view
        returns (
            bool globalPaused,
            bool liquidationPaused,
            bool accountingPaused,
            bool partyBActionsPaused,
            bool partyAActionsPaused,
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
            appLayout.emergencyMode
        );
    }

    function getPartyBEmergencyStatus(address partyB) external view returns (bool isEmergency) {
        return GlobalAppStorage.layout().partyBEmergencyStatus[partyB];
    }

    function getBalanceLimitPerUser() external view returns (uint256) {
        return GlobalAppStorage.layout().balanceLimitPerUser;
    }

    function verifyMuonTSSAndGateway(
        bytes32 hash,
        SchnorrSign memory sign,
        bytes memory gatewaySignature
    ) external view {
        LibMuon.verifyTSSAndGateway(hash, sign, gatewaySignature);
    }
}
