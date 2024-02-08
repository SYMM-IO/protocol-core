#!/bin/bash -ex

time npx hardhat run scripts/Initialize.ts --network docker
time npx hardhat run scripts/deployPartyB.ts --network docker
time npx hardhat run scripts/deployMultiAccount.ts --network docker
