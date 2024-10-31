import {ethers} from "hardhat"
import {FacetCutAction, getSelectors} from "../tasks/utils/diamondCut"

async function main() {
	let addr = ""
	let facetAddr = ""
	const diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", addr)
	const NewFacet = await ethers.getContractFactory("PartyAFacet")
	const selectors = getSelectors(ethers, NewFacet).selectors
	await diamondCutFacet.diamondCut(
		[
			{
				facetAddress: facetAddr,
				action: FacetCutAction.Replace,
				functionSelectors: selectors,
			},
		],
		ethers.ZeroAddress,
		"0x",
	)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
