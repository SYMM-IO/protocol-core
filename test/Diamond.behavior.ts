import {loadFixture} from "@nomicfoundation/hardhat-network-helpers"
import {assert, expect} from "chai"
import {ethers} from "hardhat"

import {FacetCutAction, getSelectors} from "../tasks/utils/diamondCut"
import {initializeFixture} from "./Initialize.fixture"
import {RunContext} from "./models/RunContext"

function haveSameMembers(array1: any[], array2: any[]) {
	if (array1.length !== array2.length) {
		return false
	}

	const set1 = new Set(array1)
	const set2 = new Set(array2)

	if (set1.size !== set2.size) {
		return false
	}

	for (let item of set1) {
		if (!set2.has(item)) {
			return false
		}
	}

	return true
}

export function shouldBehaveLikeDiamond(): void {
	const addresses: string[] = []
	let selectors: string[] = []
	let result: string[] = []

	before(async function () {
		this.context = await loadFixture(initializeFixture)
	})

	it("should have 14 facets", async function () {
		const context: RunContext = this.context
		for (const address of await context.diamondLoupeFacet.facetAddresses()) {
			addresses.push(address)
		}
		assert.equal(addresses.length, 14)
	})

	it("facets should have the right function selectors -- call to facetFunctionSelectors function", async function () {
		const context: RunContext = this.context
		// DiamondLoupeFacet
		selectors = getSelectors(ethers, context.diamondLoupeFacet as any).selectors
		result = await context.diamondLoupeFacet.facetFunctionSelectors(addresses[3])
		expect(haveSameMembers(result, selectors)).to.be.true
	})

	it("should remove a function from ViewFacet -- getAccountBalance()", async function () {
		const context: RunContext = this.context
		const viewFacet = await ethers.getContractFactory("ViewFacet")
		const selectors = getSelectors(ethers, viewFacet as any).get(["balanceOf(address)"])
		const viewFacetAddress = addresses[7]

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
		expect(haveSameMembers(result, getSelectors(ethers, viewFacet as any).remove(["balanceOf(address)"]))).to.be.true
	})

	it("should add the getAccountBalance() function back", async function () {
		const context: RunContext = this.context
		const viewFacet = await ethers.getContractFactory("ViewFacet")
		const viewFacetAddress = addresses[7]

		const tx = await context.diamondCutFacet.diamondCut(
			[
				{
					facetAddress: viewFacetAddress,
					action: FacetCutAction.Add,
					functionSelectors: getSelectors(ethers, viewFacet as any).get(["balanceOf(address)"]),
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
		expect(haveSameMembers(result, getSelectors(ethers, viewFacet as any).selectors)).to.be.true
	})
}
