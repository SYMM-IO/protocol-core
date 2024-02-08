import { ethers, run, upgrades } from "hardhat"
import { Addresses, loadAddresses, saveAddresses } from "./utils/file"

async function main() {
	const [deployer] = await ethers.getSigners()

	console.log("Deploying contracts with the account:", deployer.address)
	let deployedAddresses: Addresses = loadAddresses()

	const SymmioPartyA = await ethers.getContractFactory("SymmioPartyA")

	// Deploy SymmioPartyB as upgradeable
	const Factory = await ethers.getContractFactory("MultiAccount")
	const admin = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
	const contract = await upgrades.deployProxy(Factory, [
		admin, deployedAddresses.symmioAddress,
		SymmioPartyA.bytecode,
	], { initializer: "initialize" })
	await contract.deployed()

	const addresses = {
		proxy: contract.address,
		admin: await upgrades.erc1967.getAdminAddress(contract.address),
		implementation: await upgrades.erc1967.getImplementationAddress(
		  contract.address,
		),
	}
	console.log(addresses)

	deployedAddresses.multiAccountAddress = contract.address
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
