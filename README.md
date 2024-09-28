# SYMMIO: Decentralized Derivatives Protocol

SYMMIO is a trustless hybrid clearing house (combining on-chain and off-chain components) acting as a communication,
settlement, and clearing layer for permissionless derivatives. At its core, SYMMIO is an intent-centric,
meta-derivatives engine, with its first use case being a new type of hyper-efficient perpetuals trading technology.

## Code Architecture

This project utilizes the Diamond Proxy pattern ([EIP-2535](https://eips.ethereum.org/EIPS/eip-2535)) for upgradability
and modularity. Currently, we have 13 facets:

1. **AccountFacet**
2. **ControlFacet**
3. **DiamondLoupeFacet**
4. **LiquidationFacet**
5. **PartyAFacet**
6. **BridgeFacet**
7. **ViewFacet**
8. **FundingRateFacet**
9. **ForceActionsFacet**
10. **SettlementFacet**
11. **PartyBPositionActionsFacet**
12. **PartyBQuoteActionsFacet**
13. **PartyBGroupActionsFacet**

There are also some additional second-layer contracts required by hedgers and frontends:

1. **MultiAccount**:  
   This contract allows each wallet to have multiple accounts within the system. Features like instant open/close and
   stop-loss bots require the `delegateAccess` feature provided by this contract.

2. **SymmioPartyB**:  
   This contract enables hedgers to have multiple private keys (PKs) behind their bots.

## Getting Started

This project uses [Hardhat](https://hardhat.org/). You can compile the code with:

```bash
npx hardhat compile
```

And you can run tests like this:

```bash
./utils/runTests.sh
```

The reason we cannot simply use `npx hardhat test` is that there are some Muon signature verification parts in the code
that need to be commented out for the tests to run without issues. This script automates that task.

## Documentation

For detailed technical documentation, visit:

[https://docs.symm.io/protocol-architecture/technical-documentation](https://docs.symm.io/protocol-architecture/technical-documentation)

## License

SYMM-Core-Business-Source-License-1.1

For more information, see https://docs.symm.io/legal-disclaimer/license