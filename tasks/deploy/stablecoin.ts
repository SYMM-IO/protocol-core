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
	console.log("using addressx: " + JSON.stringify(owner));
	await new Promise(r => setTimeout(r, 2000));
	console.log("with balance: " + await owner.getBalance());
	console.log('get balance done');
	await new Promise(r => setTimeout(r, 2000));
	console.log('wait done');

	const StablecoinFactory = await ethers.getContractFactory("FakeStablecoin");
	console.log('factory created');
	const stablecoin = await StablecoinFactory.connect(owner).deploy();
	console.log('deploy done');
	await stablecoin.deployed();
	console.log('deployed done');

	await stablecoin.deployTransaction.wait();
	console.log("FakeStablecoin deployed:", stablecoin.address);

	return stablecoin;
});
