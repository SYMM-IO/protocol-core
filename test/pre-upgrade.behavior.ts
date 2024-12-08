import { ethers, network } from "hardhat"
import * as helpers from "@nomicfoundation/hardhat-network-helpers"
import { BridgeFacet, DiamondCutFacet, ViewFacet } from "../src/types"
import { UpgradeMockData } from "./upgradeMock"
import { ZeroAddress } from "ethers"
import { expect } from "chai"
import { SymbolStructOutput } from "../src/types/contracts/interfaces/ISymmio"
import _ from "lodash"

export function shouldBehaveLikePreUpgradeTest() {
	const diamondAddress = "0x91Cf2D8Ed503EC52768999aA6D8DBeA6e52dbe43"
	let diamondCut: DiamondCutFacet
	let viewFacet: ViewFacet

	interface State {
		nextQuoteId: string
		bridgeTransaction: string
		internalTransferPaused: boolean
		settlementCooldown: string
		symbol: SymbolStructOutput
	}

	let preUpgradeState: State
	let postUpgradeState: State

	beforeEach(async function () {
		await helpers.mine()

		diamondCut = await ethers.getContractAt("DiamondCutFacet", diamondAddress)
		viewFacet = await ethers.getContractAt("ViewFacet", diamondAddress)
	})

	async function captureState(): Promise<State> {
		const nextQuoteId = (await viewFacet.getNextQuoteId()).toString()
		const bridgeTransaction = (await viewFacet.getNextBridgeTransactionId()).toString()
		const internalTransferPaused = (await viewFacet.pauseState()).internalTransferPaused
		const settlementCooldown = (await viewFacet.getDeallocateDebounceTime()).toString()
		const symbol = await viewFacet.getSymbol(10)

		return {
			nextQuoteId,
			bridgeTransaction,
			internalTransferPaused,
			settlementCooldown,
			symbol,
		}
	}

	function compareStates(pre: State, post: State) {
		Object.keys(pre).forEach(key => {
			const preValue = pre[key as keyof State]
			const postValue = post[key as keyof State]

			if (typeof preValue === "object" && typeof postValue === "object") {
				expect(_.isEqual(preValue, postValue)).to.be.true
			} else {
				expect(preValue).to.equal(postValue)
			}
		})
	}

	it("should verify contract states before and after upgrade", async function () {
		preUpgradeState = await captureState()

		await diamondCut.diamondCut(UpgradeMockData, ZeroAddress, "0x")

		postUpgradeState = await captureState()

		compareStates(preUpgradeState, postUpgradeState)
	})

	it("should deposit correctly", async function () {})
}
