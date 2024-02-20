import { run } from "hardhat"

async function main() {
	let facets = {
		AccountFacet: "",
		ControlFacet: "",
		DiamondLoupeFacet: "",
		LiquidationFacet: "",
		PartyAFacet: "",
		PartyBFacet: "",
		ViewFacet: "",
		FundingRateFacet: "",
	}
	for (const facet in facets) {
		if (!facets.hasOwnProperty(facet)) continue
		const facetAddr = (facets as any)[facet]
		console.log(`Verifying ${facet} with impl in ${facetAddr}`)
		await run("verify:verify", {
			address: facetAddr,
			constructorArguments: [],
		})
	}
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
