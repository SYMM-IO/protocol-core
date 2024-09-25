import {task} from "hardhat/config"

task("deploy:feeDistributor", "Deploys the SymmioFeeDistributor")
	.addParam("symmioAddress", "The address of the Symmio contract")
	.addParam("admin", "The admin address")
	.addParam("symmioShare", "The symmio share")
	.addParam("symmioShareReceiver", "The symmio share receiver")
	.setAction(async ({symmioAddress, admin, symmioShareReceiver, symmioShare}, {ethers, upgrades, run}) => {
		console.log("Running deploy:feeDistributor")

		const [deployer] = await ethers.getSigners()

		console.log("Deploying contracts with the account:", deployer.address)

		// Deploy SymmioFeeDistributor as upgradeable
		const factory = await ethers.getContractFactory("SymmioFeeDistributor")
		const contract = await upgrades.deployProxy(factory, [admin, symmioAddress, symmioShareReceiver, symmioShare], {initializer: "initialize"})
		await contract.deployed()

		const addresses = {
			proxy: contract.address,
			admin: await upgrades.erc1967.getAdminAddress(await contract.getAddress()),
			implementation: await upgrades.erc1967.getImplementationAddress(await contract.getAddress()),
		}
		console.log("SymmioFeeDistributor deployed to", addresses)

		return contract
	})
