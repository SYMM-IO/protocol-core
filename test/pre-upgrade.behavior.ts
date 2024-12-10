import { ethers } from "hardhat"
import * as helpers from "@nomicfoundation/hardhat-network-helpers"
import { DiamondCutFacet, ViewFacet } from "../src/types"
import { UpgradeMockData } from "./upgradeMock"
import { ZeroAddress } from "ethers"
import { expect } from "chai"
import { QuoteStructOutput, SymbolStructOutput } from "../src/types/contracts/interfaces/ISymmio"
import _ from "lodash"
import { decimal } from "./utils/Common"

const DIAMOND_ADDRESS = "0x91Cf2D8Ed503EC52768999aA6D8DBeA6e52dbe43"
const MAIN_MULTISIG = "0x5146C35725d9b8F11A84ebD4a3abe9845698Ada9"

interface State {
	nextQuoteId: string
	bridgeTransaction: string
	internalTransferPaused: boolean
	settlementCooldown: string
	symbol: SymbolStructOutput
	quote: QuoteStructOutput
}

export function shouldBehaveLikePreUpgradeTest() {
	let diamondCut: DiamondCutFacet
	let viewFacet: ViewFacet

	let preUpgradeState: State
	let postUpgradeState: State

	before(async function () {
		await helpers.mine()
	})

	beforeEach(async function () {
		diamondCut = await ethers.getContractAt("DiamondCutFacet", DIAMOND_ADDRESS)
		viewFacet = await ethers.getContractAt("ViewFacet", DIAMOND_ADDRESS)
	})

	async function captureContractState(): Promise<State> {
		return {
			nextQuoteId: (await viewFacet.getNextQuoteId()).toString(),
			bridgeTransaction: (await viewFacet.getNextBridgeTransactionId()).toString(),
			internalTransferPaused: (await viewFacet.pauseState()).internalTransferPaused,
			settlementCooldown: (await viewFacet.getDeallocateDebounceTime()).toString(),
			symbol: await viewFacet.getSymbol(10),
			quote: await viewFacet.getQuote(100)
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
		const impersonatedSigner = await ethers.getImpersonatedSigner(MAIN_MULTISIG)
		await helpers.setBalance(MAIN_MULTISIG, decimal(1n))

		// Perform upgrade
		await diamondCut.connect(impersonatedSigner).diamondCut(UpgradeMockData, ZeroAddress, "0x")

		// Capture post-upgrade state
		postUpgradeState = await captureContractState()

		// Assert states are equal
		assertStatesAreEqual(preUpgradeState, postUpgradeState)
	})
}
