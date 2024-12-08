import {ethers} from "hardhat"
import {FacetNames} from "../tasks/deploy/constants"
import {FacetCutAction, getSelectors} from "../tasks/utils/diamondCut"

async function main() {

	// ========================= CONFIGS ========================= 

	const diamondAddress = ""
	const newFacetAddresses = new Map<string, string>()
	newFacetAddresses.set("AccountFacet", "")
	newFacetAddresses.set("ControlFacet", "")
	newFacetAddresses.set("LiquidationFacet", "")
	newFacetAddresses.set("PartyAFacet", "")
	newFacetAddresses.set("BridgeFacet", "")
	newFacetAddresses.set("ViewFacet", "")
	newFacetAddresses.set("FundingRateFacet", "")
	newFacetAddresses.set("ForceActionsFacet", "")
	newFacetAddresses.set("SettlementFacet", "")
	newFacetAddresses.set("PartyBPositionActionsFacet", "")
	newFacetAddresses.set("PartyBQuoteActionsFacet", "")
	newFacetAddresses.set("PartyBGroupActionsFacet", "")

	const ignore_in_adding:string[] = [
		"0x56129889", // forceClosePosition(new) 
		"0x3bc98be1" // settleAndForceClosePosition
	]
	const ignore_in_removing:string[] = [
		"0x1f931c1c", // diamondCut
		"0xea4f9efd" // forceClosePosition(old)
	]
	const ignore_in_replacing:string[] = [
		"0xcdffacc6", // facetAddress
		"0x52ef6b2c", // facetAddress
		"0xadfca15e", // facetFunctionSelectors
		"0x7a0ed627", // facets
		"0x01ffc9a7"  // supportsInterface
	  ]

	// ========================= SCRIPT ========================= 

	const [deployer] = await ethers.getSigners()

	const newFacets: {
		[facetName: string]: { address: string; selectors: string[] };
	} = {}
	for (const facetName of FacetNames) {
		const facetFactory = await ethers.getContractFactory(facetName)
		const selectors = getSelectors(ethers, facetFactory).selectors
		newFacets[facetName] = {
			address: newFacetAddresses.get(facetName)!,
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
	const currentSelectorsMap: Map<string, string> = new Map();
	for (const facet of facets) {
		const facetAddress = facet.facetAddress
		for (const selector of facet.functionSelectors) {
			currentSelectorsMap.set(selector, facetAddress)
		}
	}

	// Build new selectors mapping
	const newSelectorsMap: Map<string, string> = new Map();
	for (const [facetName, facetInfo] of Object.entries(newFacets)) {
		const facetAddress = facetInfo.address
		const selectors = facetInfo.selectors
		for (const selector of selectors) {
			newSelectorsMap.set(selector,facetAddress)
		}
	}

	// Determine actions for each selector
	const actions: {
		[selector: string]: { action: FacetCutAction; facetAddress: string };
	} = {}

	// Process selectors to determine add, replace, or remove
	for (const [selector, _] of currentSelectorsMap) {
		if (newSelectorsMap.has(selector)) {
			// Selector is in both current and new: Replace
			// Skip if selector is in ignore_in_replacing
			if (!ignore_in_replacing.includes(selector)) {
				actions[selector] = {
					action: FacetCutAction.Replace,
					facetAddress: newSelectorsMap.get(selector)!,
				}
			}
			// Remove from newSelectorsMapping to prevent duplicate processing
			newSelectorsMap.delete(selector)
		} else {
			// Selector only in current: Remove
			// Skip if selector is in ignore_in_removing
			if (!ignore_in_removing.includes(selector)) {
				actions[selector] = {
					action: FacetCutAction.Remove,
					facetAddress: ethers.ZeroAddress,
				}
			}
		}
	}

	// Remaining selectors in newSelectorsMapping are additions
	// Skip selectors that are in ignore_in_adding
	for (const [selector, facetAddress] of newSelectorsMap) {
		if (!ignore_in_adding.includes(selector)) {
			actions[selector] = {
				action: FacetCutAction.Add,
				facetAddress: facetAddress,
			}
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
		// Only add the facet cut if it has selectors
		if (facetCut.selectors.length > 0) {
			diamondCut.push({
				facetAddress: facetCut.facetAddress,
				action: facetCut.action,
				functionSelectors: facetCut.selectors,
			})
		}
	}

	console.log("\nDiamond Cut:")
	console.log(diamondCut)
}

// Run the main function
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})