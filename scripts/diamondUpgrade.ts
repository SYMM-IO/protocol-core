import {ethers} from "hardhat"


// Main function
async function main() {
	const diamondAddress = ""
	const [deployer] = await ethers.getSigners()

	const diamondCutFacet = await ethers.getContractAt(
		"DiamondCutFacet",
		diamondAddress,
		deployer
	)
	// Prepare _init and _calldata (set to zero address and empty bytes for this example)
	const _init = ethers.ZeroAddress // Updated for ethers v6
	const _calldata = "0x"

	const diamondCut: any[] = []

	console.log(diamondCutFacet.interface.encodeFunctionData("diamondCut", [diamondCut, _init, _calldata]))
}

// Run the main function
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
