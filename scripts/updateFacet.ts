import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";

export enum FacetCutAction {
  Add,
  Replace,
  Remove,
}

// Get function selectors from ABI
export function getSelectors(contract: Contract | ContractFactory) {
  const signatures = Object.keys(contract.interface.functions);

  const selectors = signatures.reduce((acc, val) => {
    if (val !== "init(bytes)") {
      acc.push(contract.interface.getSighash(val));
    }
    return acc;
  }, [] as string[]);

  const remove = (functionNames: string[]) => {
    return selectors.filter(val => {
      for (const functionName of functionNames) {
        if (val === contract.interface.getSighash(functionName)) {
          return false;
        }
      }
      return true;
    });
  };

  const get = (functionNames: string[]) => {
    return selectors.filter(val => {
      for (const functionName of functionNames) {
        if (val === contract.interface.getSighash(functionName)) {
          return true;
        }
      }
      return false;
    });
  };

  return {
    selectors,
    remove,
    get,
  };
}

async function main() {
  // let addr = "0x52e2230cdb80edebdadafcf24033608c9a636d7d"; // bsc testnet
  let addr = "0x762407bEd807184F90F3eDcF2D7Ac9CB9d8901c6"; // ftm
  let facetAddr = "0x9aB86B1063e19EFE722068B84bf325D62500fce7";
  const diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", addr);
  const NewFacet = await ethers.getContractFactory("PartyAFacet");
  const selectors = getSelectors(NewFacet).selectors;
  console.log(selectors);
  // const selectors = ["0xf09a4016"];
  await diamondCutFacet.diamondCut(
    [
      {
        facetAddress: facetAddr,
        action: FacetCutAction.Replace,
        functionSelectors: selectors,
      },
    ],
    ethers.constants.AddressZero,
    "0x",
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
