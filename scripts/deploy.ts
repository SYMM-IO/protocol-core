import {ethers} from "hardhat"

async function main() {
	const facetName = ""
	const Facet = await ethers.getContractFactory(facetName)
	const facet = await Facet.deploy()

	await facet.waitForDeployment()

	console.log(`${facetName} deployed: ${await facet.getAddress()}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
