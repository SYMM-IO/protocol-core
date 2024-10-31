import {ethers, run} from "hardhat"
import {sleep} from "@nomicfoundation/hardhat-verify/internal/utilities"

async function main() {
	const facetNames = [
		"AccountFacet",
		"ControlFacet",
		"DiamondLoupeFacet",
		"LiquidationFacet",
		"PartyAFacet",
		"BridgeFacet",
		"ViewFacet",
		"FundingRateFacet",
		"ForceActionsFacet",
		"SettlementFacet",
		"PartyBPositionActionsFacet",
		"PartyBQuoteActionsFacet",
		"PartyBGroupActionsFacet",
	]
	for (const facetName of facetNames) {
		const Facet = await ethers.getContractFactory(facetName)
		const facet = await Facet.deploy()

		await facet.waitForDeployment()

		let addr = await facet.getAddress()
		console.log(`${facetName} deployed: ${addr}`)

		await sleep(10000)

		try {
			await run("verify:verify", {
				address: addr,
				constructorArguments: [],
			})
		} catch (e) {
			console.log("Failed to verify contract", e)
		}
	}
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
