import { sleep } from "@nomicfoundation/hardhat-verify/internal/utilities"
import { task } from "hardhat/config"

task("deploy:callProxy", "Deploys the CallProxy")
	.addParam("admin", "The admin address")
	.addParam("whitelist", "The whitelisted target address")
	.addParam("operators", "The addresses that can be behind this proxy")
	.setAction(async ({ admin, whitelist, operators }, { ethers, upgrades, run }) => {
		console.log("Running deploy:callProxy")

		const [deployer] = await ethers.getSigners()
		console.log("Deploying contracts with the account:", deployer.address)

		// Get the contract factory and deploy the proxy
		const factory = await ethers.getContractFactory("CallProxy")
		const contract = await upgrades.deployProxy(factory, [admin], { initializer: "initialize" })
		await contract.waitForDeployment()

		// Retrieve contract addresses for logging
		const proxyAddress = await contract.getAddress()
		const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress)
		const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress)
		const addresses = {
			proxy: proxyAddress,
			admin: adminAddress,
			implementation: implementationAddress,
		}
		console.log("CallProxy deployed to", addresses)

		await sleep(10000)

		// Update whitelist if provided, and wait for the transaction to be mined
		if (whitelist) {
			const whitelistTx = await contract.setCallWhitelist(whitelist, true)
			await whitelistTx.wait()
			console.log("Address whitelisted:", whitelist)
		}

		// Grant trusted roles to operators if provided
		if (operators) {
			const operatorsArray = operators.split(",")
			const trustedRole = await contract.TRUSTED_ROLE()
			for (const operator of operatorsArray) {
				const grantTx = await contract.grantRole(trustedRole, operator.trim())
				await grantTx.wait()
				console.log("Granted trusted role to", operator.trim())
			}
		}

		// Verify the deployed contract
		await run("verify:verify", {
			address: proxyAddress,
			constructorArguments: [],
		})

		return contract
	})
