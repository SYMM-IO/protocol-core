import {ethers} from "hardhat"
import {FacetNames} from "../tasks/deploy/constants"
import {FacetCutAction, getSelectors} from "../tasks/utils/diamondCut"


// Main function
async function main() {
	const diamondAddress = ""
	const facetAddresses = new Map<string, string>()
	facetAddresses.set("AccountFacet", "0x1")
	facetAddresses.set("ControlFacet", "0x2")
	facetAddresses.set("DiamondLoupeFacet", "0x3")
	facetAddresses.set("LiquidationFacet", "0x4")
	facetAddresses.set("PartyAFacet", "0x5")
	facetAddresses.set("BridgeFacet", "0x6")
	facetAddresses.set("ViewFacet", "0x7")
	facetAddresses.set("FundingRateFacet", "0x8")
	facetAddresses.set("ForceActionsFacet", "0x9")
	facetAddresses.set("SettlementFacet", "0x10")
	facetAddresses.set("PartyBPositionActionsFacet", "0x11")
	facetAddresses.set("PartyBQuoteActionsFacet", "0x12")
	facetAddresses.set("PartyBGroupActionsFacet", "0x13")

	const [deployer] = await ethers.getSigners()

	const diamondCutFacet = await ethers.getContractAt(
		"DiamondCutFacet",
		diamondAddress,
		deployer
	)

	const newFacets: {
		[facetName: string]: { address: string; selectors: string[] };
	} = {}
	for (const facetName of FacetNames) {
		const facetFactory = await ethers.getContractFactory(facetName)
		const selectors = getSelectors(ethers, facetFactory).selectors
		newFacets[facetName] = {
			address: facetAddresses.get(facetName)!,
			selectors: selectors,
		}
	}

	// Get current facets and their selectors from the diamond
	const diamondLoupeFacet = await ethers.getContractAt(
		"DiamondLoupeFacet",
		diamondAddress,
		deployer
	)

	const facets = await diamondLoupeFacet.facets()

	// Build a map of current selectors to facet addresses
	const currentSelectors: { [selector: string]: string } = {}
	for (const facet of facets) {
		const facetAddress = facet.facetAddress
		for (const selector of facet.functionSelectors) {
			currentSelectors[selector] = facetAddress
		}
	}

	// Build new selectors mapping
	const newSelectorsMapping: { [selector: string]: string } = {}
	for (const [facetName, facetInfo] of Object.entries(newFacets)) {
		const facetAddress = facetInfo.address
		const selectors = facetInfo.selectors
		for (const selector of selectors) {
			newSelectorsMapping[selector] = facetAddress
		}
	}

	// Determine actions for each selector
	const actions: {
		[selector: string]: { action: FacetCutAction; facetAddress: string };
	} = {}

	// Process selectors to determine add, replace, or remove
	for (const selector in currentSelectors) {
		if (newSelectorsMapping[selector]) {
			// Selector is in both current and new: Replace
			actions[selector] = {
				action: FacetCutAction.Replace,
				facetAddress: newSelectorsMapping[selector],
			}
			// Remove from newSelectorsMapping to prevent duplicate processing
			delete newSelectorsMapping[selector]
		} else {
			// Selector only in current: Remove
			actions[selector] = {
				action: FacetCutAction.Remove,
				facetAddress: ethers.ZeroAddress,
			}
		}
	}

	// Remaining selectors in newSelectorsMapping are additions
	for (const selector in newSelectorsMapping) {
		actions[selector] = {
			action: FacetCutAction.Add,
			facetAddress: newSelectorsMapping[selector],
		}
	}

	// Group selectors by facetAddress and action
	const facetCutsMap: {
		[key: string]: { facetAddress: string; action: FacetCutAction; selectors: string[] };
	} = {}

	for (const [selector, info] of Object.entries(actions)) {
		const key = `${info.facetAddress}-${info.action}`
		if (!facetCutsMap[key]) {
			facetCutsMap[key] = {
				facetAddress: info.facetAddress,
				action: info.action,
				selectors: [],
			}
		}
		facetCutsMap[key].selectors.push(selector)
	}

	// Prepare the _diamondCut parameter
	const diamondCut = []
	for (const facetCut of Object.values(facetCutsMap)) {
		diamondCut.push({
			facetAddress: facetCut.facetAddress,
			action: facetCut.action,
			functionSelectors: facetCut.selectors,
		})
	}

	console.log(diamondCut)

	// Prepare _init and _calldata (set to zero address and empty bytes for this example)
	const _init = ethers.ZeroAddress // Updated for ethers v6
	const _calldata = "0x"

	// Execute the diamondCut function
	const tx = await diamondCutFacet.diamondCut(diamondCut, _init, _calldata)
	console.log("Diamond cut tx hash:", tx.hash)
	const receipt = await tx.wait()
	console.log("Diamond cut transaction mined:", (await receipt!.getTransaction()).hash)
}

// Run the main function
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
