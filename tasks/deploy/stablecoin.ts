import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { task } from "hardhat/config";

task("verify:stablecoin", "Verifies contract on Etherscan")
	.addParam("address", "The address of the contract to verify")
	.setAction(async ({ address }, { run }) => {
		await run("verify:verify", {
			address,
		});
	});

task("deploy:stablecoin", "Deploys the FakeStablecoin", async (_, { ethers, run }) => {
	console.log("Running deploy:stablecoin");

	const signers: SignerWithAddress[] = await ethers.getSigners();
	const owner: SignerWithAddress = signers[0];

	const StablecoinFactory = await ethers.getContractFactory("FakeStablecoin");
	const stablecoin = await StablecoinFactory.connect(owner).deploy();
	await stablecoin.deployed();

	await stablecoin.deployTransaction.wait();
	console.log("FakeStablecoin deployed:", stablecoin.address);

	return stablecoin;
});
