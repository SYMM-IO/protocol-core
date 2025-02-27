import * as helpers from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { ZeroAddress } from "ethers"
import { ethers } from "hardhat"
import _ from "lodash"
import { generateDiamondCut } from "../scripts/utils/diamondUtils"
import { DiamondCutFacet, ViewFacet } from "../src/types"
import { QuoteStructOutput, SymbolStructOutput } from "../src/types/contracts/interfaces/ISymmio"
import { FacetCutAction } from "../tasks/utils/diamondCut"
import { decimal } from "./utils/Common"

const updateConfig = {
	diamondAddress: "",
	diamondOwner: "",
	facets: [
		{ name: "AccountFacet", address: "" },
		{ name: "ControlFacet", address: "" },
		{ name: "LiquidationFacet", address: "" },
		{ name: "PartyAFacet", address: "" },
		{ name: "BridgeFacet", address: "" },
		{ name: "ViewFacet", address: "" },
		{ name: "FundingRateFacet", address: "" },
		{ name: "ForceActionsFacet", address: "" },
		{ name: "SettlementFacet", address: "" },
		{ name: "PartyBPositionActionsFacet", address: "" },
		{ name: "PartyBQuoteActionsFacet", address: "" },
		{ name: "PartyBGroupActionsFacet", address: "" },
	],
	ignoreSelectors: {
		adding: [
			"0x56129889", // forceClosePosition(new)
			"0x3bc98be1", // settleAndForceClosePosition
		],
		removing: [
			"0x1f931c1c", // diamondCut
			"0xea4f9efd", // forceClosePosition(old)
		],
		replacing: [
			"0xcdffacc6", // facetAddress
			"0x52ef6b2c", // facetAddress
			"0xadfca15e", // facetFunctionSelectors
			"0x7a0ed627", // facets
			"0x01ffc9a7", // supportsInterface
		],
	},
}

interface State {
	nextQuoteId: string
	bridgeTransaction: string
	internalTransferPaused: boolean
	settlementCooldown: string
	symbol: SymbolStructOutput
	quote: QuoteStructOutput
}

export function shouldBehaveLikePreUpgradeTest(): void {
	let diamondCut: DiamondCutFacet
	let viewFacet: ViewFacet

	let preUpgradeState: State
	let postUpgradeState: State

	let diamondCutInput: {
		facetAddress: string
		action: FacetCutAction
		functionSelectors: string[]
	}[]

	before(async function () {
		await helpers.mine()
		diamondCutInput = await generateDiamondCut(updateConfig)
	})

	beforeEach(async function () {
		diamondCut = await ethers.getContractAt("DiamondCutFacet", updateConfig.diamondAddress)
		viewFacet = await ethers.getContractAt("ViewFacet", updateConfig.diamondAddress)
	})

	async function captureContractState(): Promise<State> {
		return {
			nextQuoteId: (await viewFacet.getNextQuoteId()).toString(),
			bridgeTransaction: (await viewFacet.getNextBridgeTransactionId()).toString(),
			internalTransferPaused: (await viewFacet.pauseState()).internalTransferPaused,
			settlementCooldown: (await viewFacet.getDeallocateDebounceTime()).toString(),
			symbol: await viewFacet.getSymbol(10),
			quote: await viewFacet.getQuote(100),
		}
	}

	function assertStatesAreEqual(pre: State, post: State) {
		Object.keys(pre).forEach(key => {
			const preValue = pre[key as keyof State]

			const postValue = post[key as keyof State]

			if (_.isObject(preValue) && _.isObject(postValue)) {
				expect(_.isEqual(preValue, postValue), `${key} mismatch`).to.be.true
			} else {
				expect(preValue, `${key} mismatch`).to.equal(postValue)
			}
		})
	}

	it("should verify contract states before and after upgrade", async function () {
		// Capture pre-upgrade state
		preUpgradeState = await captureContractState()

		// Impersonate multisig wallet and fund it
		const impersonatedSigner = await ethers.getImpersonatedSigner(updateConfig.diamondOwner)
		await helpers.setBalance(updateConfig.diamondOwner, decimal(1n))

		// Perform upgrade
		await diamondCut.connect(impersonatedSigner).diamondCut(diamondCutInput, ZeroAddress, "0x")

		// Capture post-upgrade state
		postUpgradeState = await captureContractState()

		// Assert states are equal
		assertStatesAreEqual(preUpgradeState, postUpgradeState)
	})
}
