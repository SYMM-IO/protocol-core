import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ethers } from "hardhat"

import {
	AccountFacet,
	BridgeFacet,
	ControlFacet,
	DiamondCutFacet,
	DiamondLoupeFacet,
	FundingRateFacet,
	LiquidationFacet,
	PartyAFacet,
	PartyBFacet,
	ViewFacet,
} from "../../src/types"
import { TestManager } from "./TestManager"

export class RunContext {
	accountFacet!: AccountFacet
	diamondCutFacet!: DiamondCutFacet
	diamondLoupeFacet!: DiamondLoupeFacet
	partyAFacet!: PartyAFacet
	partyBFacet!: PartyBFacet
	bridgeFacet!: BridgeFacet
	viewFacet!: ViewFacet
	liquidationFacet!: LiquidationFacet
	controlFacet!: ControlFacet
	fundingRateFacet!: FundingRateFacet
	signers!: {
		admin: SignerWithAddress
		user: SignerWithAddress
		user2: SignerWithAddress
		liquidator: SignerWithAddress
		hedger: SignerWithAddress
		hedger2: SignerWithAddress
		bridge: SignerWithAddress
		bridge2: SignerWithAddress
		feeCollector: SignerWithAddress
		feeCollector2: SignerWithAddress
		others: SignerWithAddress[]
	}
	diamond!: string
	multiAccount!: string
	multiAccount2?: string
	collateral: any
	manager!: TestManager
}

export async function createRunContext(diamond: string, collateral: string, multiAccount: string, multiAccount2: string | undefined = undefined, onlyInitialize: boolean = false): Promise<RunContext> {
	let context = new RunContext()

	const signers: SignerWithAddress[] = await ethers.getSigners()
	context.signers = {
		admin: signers[0],
		user: signers[1],
		user2: signers[2],
		liquidator: signers[3],
		hedger: signers[4],
		hedger2: signers[5],
		bridge: signers[6],
		bridge2: signers[7],
		feeCollector: signers[8],
		feeCollector2: signers[9],
		others: [signers[10], signers[11]],
	}

	context.diamond = diamond
	context.multiAccount = multiAccount
	context.multiAccount2 = multiAccount2
	context.collateral = await ethers.getContractAt("FakeStablecoin", collateral)
	context.accountFacet = await ethers.getContractAt("AccountFacet", diamond)
	context.diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", diamond)
	context.diamondLoupeFacet = await ethers.getContractAt("DiamondLoupeFacet", diamond)
	context.partyAFacet = await ethers.getContractAt("PartyAFacet", diamond)
	context.partyBFacet = await ethers.getContractAt("PartyBFacet", diamond)
	context.bridgeFacet = await ethers.getContractAt("BridgeFacet", diamond)
	context.viewFacet = await ethers.getContractAt("ViewFacet", diamond)
	context.liquidationFacet = await ethers.getContractAt("LiquidationFacet", diamond)
	context.controlFacet = await ethers.getContractAt("ControlFacet", diamond)
	context.fundingRateFacet = await ethers.getContractAt("FundingRateFacet", diamond)

	context.manager = new TestManager(context, onlyInitialize)
	if (!onlyInitialize) await context.manager.start()

	return context
}
