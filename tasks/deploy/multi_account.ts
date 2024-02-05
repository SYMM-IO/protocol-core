import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { task } from "hardhat/config";

task("deploy:multiaccount", "Deploys the MultiAccount", async (_, { ethers, run }) => {
  console.log("Running deploy:multiaccount");

  const signers: SignerWithAddress[] = await ethers.getSigners();
  const owner: SignerWithAddress = signers[0];

  const Factory = await ethers.getContractFactory("SymmioPartyA");
  const multiaccount = await Factory.connect(owner).deploy();
  await multiaccount.deployed();

  await multiaccount.deployTransaction.wait();
  console.log("MultiAccount deployed:", multiaccount.address);

  return multiaccount;
});
