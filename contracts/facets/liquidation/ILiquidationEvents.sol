// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.8.18;

interface ILiquidationEvents {
    event LiquidatePartyA(address liquidator, address partyA);
    event LiquidatePositionsPartyA(address liquidator, address partyA, uint256[] quoteIds);
    event LiquidatePendingPositionsPartyA(address liquidator, address partyA);
    event FullyLiquidatedPartyA(address partyA);
    event LiquidatePartyB(address liquidator, address partyB, address partyA);
    event LiquidatePositionsPartyB(
        address liquidator,
        address partyB,
        address partyA,
        uint256[] quoteIds
    );
    event FullyLiquidatedPartyB(address partyB, address partyA);
    event SetSymbolsPrices(address liquidator, address partyA, uint256[] symbolIds, uint256[] prices);
    event DisputeForLiquidation(address liquidator, address partyA);
}
