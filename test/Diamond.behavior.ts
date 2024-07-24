import {loadFixture} from "@nomicfoundation/hardhat-network-helpers"
import {assert} from "chai"
import {ethers} from "hardhat"

import {FacetCutAction, getSelectors} from "../tasks/utils/diamondCut"
import {initializeFixture} from "./Initialize.fixture"
import {RunContext} from "./models/RunContext"

export function shouldBehaveLikeDiamond(): void {
	const addresses: string[] = []
	let selectors: string[] = []
	let result: string[] = []

	before(async function () {
		this.context = await loadFixture(initializeFixture)
	})

	it("should have 12 facets", async function () {
		const context: RunContext = this.context
		for (const address of await context.diamondLoupeFacet.facetAddresses()) {
			addresses.push(address)
		}
		assert.equal(addresses.length, 12)
	})

	it("facets should have the right function selectors -- call to facetFunctionSelectors function", async function () {
		const context: RunContext = this.context
		// DiamondLoupeFacet
		selectors = getSelectors(context.diamondLoupeFacet as any).selectors
		result = await context.diamondLoupeFacet.facetFunctionSelectors(addresses[3])
		assert.sameMembers(result, selectors)
	})

	it("should remove a function from ViewFacet -- getAccountBalance()", async function () {
		const context: RunContext = this.context
		const viewFacet = await ethers.getContractFactory("ViewFacet")
		const selectors = getSelectors(viewFacet as any).get(["balanceOf(address)"])
		const viewFacetAddress = addresses[8]

		const tx = await context.diamondCutFacet.diamondCut(
			[
				{
					facetAddress: ethers.ZeroAddress,
					action: FacetCutAction.Remove,
					functionSelectors: selectors,
				},
			],
			ethers.ZeroAddress,
			"0x",
			{gasLimit: 800000},
		)
		const receipt = await tx.wait()

		if (!receipt?.status) {
			throw new Error(`Diamond upgrade failed: ${tx.hash}`)
		}

		const result = await context.diamondLoupeFacet.facetFunctionSelectors(viewFacetAddress)
		assert.sameMembers(result, getSelectors(viewFacet as any).remove(["balanceOf(address)"]))
	})

	it("should add the getAccountBalance() function back", async function () {
		const context: RunContext = this.context
		const viewFacet = await ethers.getContractFactory("ViewFacet")
		const viewFacetAddress = addresses[8]

		const tx = await context.diamondCutFacet.diamondCut(
			[
				{
					facetAddress: viewFacetAddress,
					action: FacetCutAction.Add,
					functionSelectors: getSelectors(viewFacet as any).get(["balanceOf(address)"]),
				},
			],
			ethers.ZeroAddress,
			"0x",
			{gasLimit: 800000},
		)
		const receipt = await tx.wait()

		if (!receipt?.status) {
			throw new Error(`Diamond upgrade failed: ${tx.hash}`)
		}

		const result = await context.diamondLoupeFacet.facetFunctionSelectors(viewFacetAddress)
		assert.sameMembers(result, getSelectors(viewFacet as any).selectors)
	})
}
