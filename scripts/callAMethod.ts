import { ethers } from "hardhat";


async function main() {
  let v3Address = "0x762407bEd807184F90F3eDcF2D7Ac9CB9d8901c6";
  let ViewFacet = await ethers.getContractAt("ViewFacet", v3Address);
  console.log(await ViewFacet.getQuote(3049));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
