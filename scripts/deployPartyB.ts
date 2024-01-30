import { ethers, run, upgrades } from "hardhat"
import { Addresses, loadAddresses, saveAddresses } from "./utils/file"

async function main() {
	const [deployer] = await ethers.getSigners()

	console.log("Deploying contracts with the account:", deployer.address)
	let deployedAddresses: Addresses = loadAddresses()

	// Deploy SymmioPartyB as upgradeable
	const SymmioPartyBFactory = await ethers.getContractFactory("SymmioPartyB")
	const admin = "0x6ba58CD30014A861b11eD429200Bd1DD8277DCf7"
	const symmioPartyB = await upgrades.deployProxy(SymmioPartyBFactory, [
		admin, deployedAddresses.symmioAddress,
	], { initializer: "initialize" })
	await symmioPartyB.deployed()

	const addresses = {
		proxy: symmioPartyB.address,
		admin: await upgrades.erc1967.getAdminAddress(symmioPartyB.address),
		implementation: await upgrades.erc1967.getImplementationAddress(
		  symmioPartyB.address,
		),
	}
	console.log(addresses)

	deployedAddresses.multiAccountAddress = symmioPartyB.address
	saveAddresses(deployedAddresses)

	try {
		console.log("Verifying contract...")
		await new Promise((r) => setTimeout(r, 15000))
		await run("verify:verify", { address: addresses.implementation })
		console.log("Contract verified!")
	} catch (e) {
		console.log(e)
	}
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
	  console.error(error)
	  process.exit(1)
  })