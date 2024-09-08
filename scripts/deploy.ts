import { ethers } from "hardhat"

async function main() {
	const facetName = "PartyAFacet"
	const Facet = await ethers.getContractFactory(facetName)
	const facet = await Facet.deploy()

	await facet.deployed()

	console.log(`${facetName} deployed: ${facet.address}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
