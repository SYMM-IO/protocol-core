import { ethers } from "hardhat"
import { FacetCutAction, getSelectors } from "../../tasks/utils/diamondCut"

interface FacetConfig {
	name: string
	address: string
}

interface DiamondCutConfig {
	diamondAddress: string
	facets: FacetConfig[]
	ignoreSelectors: {
		adding: string[]
		removing: string[]
		replacing: string[]
	}
}

export async function generateDiamondCut(config: DiamondCutConfig) {
	const [deployer] = await ethers.getSigners()

	// Build new facets mapping
	const newFacets: {
		[facetName: string]: { address: string; selectors: string[] }
	} = {}

	for (const facet of config.facets) {
		const facetFactory = await ethers.getContractFactory(facet.name)
		const selectors = getSelectors(ethers, facetFactory).selectors
		newFacets[facet.name] = {
			address: facet.address,
			selectors: selectors,
		}
	}

	// Get current facets and their selectors from the diamond
	const diamondLoupeFacet = await ethers.getContractAt("DiamondLoupeFacet", config.diamondAddress, deployer)

	const facets = await diamondLoupeFacet.facets()

	// Build a map of current selectors to facet addresses
	const currentSelectorsMap: Map<string, string> = new Map()
	for (const facet of facets) {
		const facetAddress = facet.facetAddress
		for (const selector of facet.functionSelectors) {
			currentSelectorsMap.set(selector, facetAddress)
		}
	}

	// Build new selectors mapping
	const newSelectorsMap: Map<string, string> = new Map()
	for (const [facetName, facetInfo] of Object.entries(newFacets)) {
		const facetAddress = facetInfo.address
		const selectors = facetInfo.selectors
		for (const selector of selectors) {
			newSelectorsMap.set(selector, facetAddress)
		}
	}

	// Determine actions for each selector
	const actions: {
		[selector: string]: { action: FacetCutAction; facetAddress: string }
	} = {}

	// Process selectors to determine add, replace, or remove
	for (const [selector, _] of currentSelectorsMap) {
		if (newSelectorsMap.has(selector)) {
			// Selector is in both current and new: Replace
			if (!config.ignoreSelectors.replacing.includes(selector)) {
				actions[selector] = {
					action: FacetCutAction.Replace,
					facetAddress: newSelectorsMap.get(selector)!,
				}
			}
			newSelectorsMap.delete(selector)
		} else {
			// Selector only in current: Remove
			if (!config.ignoreSelectors.removing.includes(selector)) {
				actions[selector] = {
					action: FacetCutAction.Remove,
					facetAddress: ethers.ZeroAddress,
				}
			}
		}
	}

	// Remaining selectors in newSelectorsMapping are additions
	for (const [selector, facetAddress] of newSelectorsMap) {
		if (!config.ignoreSelectors.adding.includes(selector)) {
			actions[selector] = {
				action: FacetCutAction.Add,
				facetAddress: facetAddress,
			}
		}
	}

	// Group selectors by facetAddress and action
	const facetCutsMap: {
		[key: string]: { facetAddress: string; action: FacetCutAction; selectors: string[] }
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

	// Prepare the diamond cut parameter
	const diamondCut = []
	for (const facetCut of Object.values(facetCutsMap)) {
		if (facetCut.selectors.length > 0) {
			diamondCut.push({
				facetAddress: facetCut.facetAddress,
				action: facetCut.action,
				functionSelectors: facetCut.selectors,
			})
		}
	}

	return diamondCut
}
