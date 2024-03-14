import { ethers } from "hardhat"

async function main() {
	let symmioAddress = ""
	let ViewFacet = await ethers.getContractAt("ViewFacet", symmioAddress)
	console.log(await ViewFacet.getQuote(564))
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
