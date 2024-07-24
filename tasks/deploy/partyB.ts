import {task, types} from "hardhat/config"
import {readData, writeData} from "../utils/fs"
import {DEPLOYMENT_LOG_FILE} from "./constants"

task("deploy:symmioPartyB", "Deploys the SymmioPartyB")
	.addParam("symmioAddress", "The address of the Symmio contract")
	.addParam("admin", "The admin address")
	.addOptionalParam("logData", "Write the deployed addresses to a data file", true, types.boolean)
	.setAction(async ({symmioAddress, admin, logData}, {ethers, upgrades, run}) => {
		console.log("Running deploy:symmioPartyB")

		const [deployer] = await ethers.getSigners()

		console.log("Deploying contracts with the account:", deployer.address)

		// Deploy SymmioPartyB as upgradeable
		const SymmioPartyBFactory = await ethers.getContractFactory("SymmioPartyB")
		const symmioPartyB = await upgrades.deployProxy(SymmioPartyBFactory, [admin, symmioAddress], {initializer: "initialize"})
		await symmioPartyB.deployed()

		const addresses = {
			proxy: symmioPartyB.address,
			admin: await upgrades.erc1967.getAdminAddress(await symmioPartyB.getAddress()),
			implementation: await upgrades.erc1967.getImplementationAddress(await symmioPartyB.getAddress()),
		}
		console.log("SymmioPartyB deployed to", addresses)

		// Update the deployed addresses JSON file
		if (logData) {
			let deployedData = []
			try {
				deployedData = readData(DEPLOYMENT_LOG_FILE)
			} catch (err) {
				console.error(`Could not read existing JSON file: ${err}`)
			}

			// Append new data
			deployedData.push(
				{
					name: "SymmioPartyBProxy",
					address: await symmioPartyB.getAddress(),
					constructorArguments: [admin, symmioAddress],
				},
				{
					name: "SymmioPartyBAdmin",
					address: addresses.admin,
					constructorArguments: [],
				},
				{
					name: "SymmioPartyBImplementation",
					address: addresses.implementation,
					constructorArguments: [],
				}
			)

			// Write updated data back to JSON file
			writeData(DEPLOYMENT_LOG_FILE, deployedData)
			console.log("Deployed addresses written to JSON file")
		}

		return symmioPartyB
	})
