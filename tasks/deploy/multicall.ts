import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { task } from "hardhat/config";

task("deploy:multicall", "Deploys the Multicall", async (_, { ethers, run }) => {
  console.log("Running deploy:multicall");

  const signers: SignerWithAddress[] = await ethers.getSigners();
  const owner: SignerWithAddress = signers[0];

  const Factory = await ethers.getContractFactory("Multicall3");
  const multicall = await Factory.connect(owner).deploy();
  await multicall.deployed();

  await multicall.deployTransaction.wait();
  console.log("Multicall3 deployed:", multicall.address);

  return multicall;
});
