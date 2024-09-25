import {run} from "hardhat"
import {Addresses, loadAddresses} from "./utils/file"

async function main() {
	let deployedAddresses: Addresses = loadAddresses()
	const symmioAddress = deployedAddresses.symmioAddress
	const admin = process.env.ADMIN_PUBLIC_KEY
	const symmioShare = ""
	const symmioShareReceiver = ""

	// Run the deploy:feeDistributor task
	const contract = await run("deploy:feeDistributor", {
		symmioAddress,
		admin,
		symmioShare,
		symmioShareReceiver
	})
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
