import {ethers, run} from "hardhat"


async function main() {
	const facetName = ""
	const Facet = await ethers.getContractFactory(facetName)
	const facet = await Facet.deploy()

	await facet.waitForDeployment()

	console.log(`${facetName} deployed: ${await facet.getAddress()}`)
	await run("verify:verify", {
		address: await facet.getAddress(),
		constructorArguments: [],
	})
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
