import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { task } from "hardhat/config";

task("deploy:hedger_proxy", "Deploys the HedgerProxy", async (_, { ethers, run }) => {
  console.log("Running deploy:hedger_proxy");

  const signers: SignerWithAddress[] = await ethers.getSigners();
  const owner: SignerWithAddress = signers[0];

  const Factory = await ethers.getContractFactory("SymmioPartyB");
  const hedger_proxy = await Factory.connect(owner).deploy();
  await hedger_proxy.deployed();

  await hedger_proxy.deployTransaction.wait();
  console.log("HedgerProxy deployed:", hedger_proxy.address);

  return hedger_proxy;
});
