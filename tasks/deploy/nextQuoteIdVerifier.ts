import { task, types } from "hardhat/config"
import { readData, writeData } from "../utils/fs"
import { DEPLOYMENT_LOG_FILE } from "./constants"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers"

task("deploy:next-quote-id-verifier", "Deploys the Next Quote Id Verifier")
	.addParam("symmioAddress", "The address of the Symmio contract")
	.addOptionalParam("logData", "Write the deployed addresses to a data file", true, types.boolean)
	.setAction(async ({ symmioAddress, logData }, { ethers, run }) => {
		console.log("Running deploy:next-quote-id-verifier")

		const signers: SignerWithAddress[] = await ethers.getSigners()
		const owner: SignerWithAddress = signers[0]
		console.log("using address: " + JSON.stringify(owner))

		const factory = await ethers.getContractFactory("NextQuoteIDVerifier")
		const contract = await factory.connect(owner).deploy(symmioAddress)
		await contract.waitForDeployment()

		await contract.deploymentTransaction()!.wait()
		console.log("NextQuoteIDVerifier deployed:", await contract.getAddress())

		if (logData) {
			// Read existing data
			let deployedData = []
			try {
				deployedData = readData(DEPLOYMENT_LOG_FILE)
			} catch (err) {}

			// Append new data
			deployedData.push({
				name: "NextQuoteIDVerifier",
				address: await contract.getAddress(),
				constructorArguments: [symmioAddress],
			})

			// Write updated data back to JSON file
			writeData(DEPLOYMENT_LOG_FILE, deployedData)
			console.log("Deployed addresses written to JSON file")
		}

		return contract
	})
