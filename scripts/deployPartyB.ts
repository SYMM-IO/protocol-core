import {run} from "hardhat"
import {Addresses, loadAddresses, saveAddresses} from "./utils/file"

async function main() {
	let deployedAddresses: Addresses = loadAddresses()
	const symmioAddress = deployedAddresses.symmioAddress
	const admin = process.env.ADMIN_PUBLIC_KEY

	// Run the deploy:symmioPartyB task
	const contract = await run("deploy:symmioPartyB", {
		symmioAddress: symmioAddress,
		admin: admin,
		logData: true,
	})

	deployedAddresses.hedgerProxyAddress = await contract.getAddress()
	saveAddresses(deployedAddresses)
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
