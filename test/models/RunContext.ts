import {ethers} from "hardhat"

import {
	AccountFacet,
	BridgeFacet,
	ControlFacet,
	DiamondCutFacet,
	DiamondLoupeFacet,
	ForceActionsFacet,
	FundingRateFacet,
	LiquidationFacet,
	PartyAFacet,
	PartyBBatchActionsFacet,
	PartyBPositionActionsFacet,
	PartyBQuoteActionsFacet,
	SettlementFacet,
	ViewFacet,
} from "../../src/types"
import {TestManager} from "./TestManager"
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers"

export class RunContext {
	accountFacet!: AccountFacet
	diamondCutFacet!: DiamondCutFacet
	diamondLoupeFacet!: DiamondLoupeFacet
	partyAFacet!: PartyAFacet
	partyBBatchActionsFacet!: PartyBBatchActionsFacet
	partyBQuoteActionsFacet!: PartyBQuoteActionsFacet
	partyBPositionActionsFacet!: PartyBPositionActionsFacet
	bridgeFacet!: BridgeFacet
	viewFacet!: ViewFacet
	liquidationFacet!: LiquidationFacet
	controlFacet!: ControlFacet
	fundingRateFacet!: FundingRateFacet
	settlementFacet!: SettlementFacet
	forceActionsFacet!: ForceActionsFacet
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
	context.partyBBatchActionsFacet = await ethers.getContractAt("PartyBBatchActionsFacet", diamond)
	context.partyBQuoteActionsFacet = await ethers.getContractAt("PartyBQuoteActionsFacet", diamond)
	context.partyBPositionActionsFacet = await ethers.getContractAt("PartyBPositionActionsFacet", diamond)
	context.bridgeFacet = await ethers.getContractAt("BridgeFacet", diamond)
	context.viewFacet = await ethers.getContractAt("ViewFacet", diamond)
	context.liquidationFacet = await ethers.getContractAt("LiquidationFacet", diamond)
	context.controlFacet = await ethers.getContractAt("ControlFacet", diamond)
	context.fundingRateFacet = await ethers.getContractAt("FundingRateFacet", diamond)
	context.settlementFacet = await ethers.getContractAt("SettlementFacet", diamond)
	context.forceActionsFacet = await ethers.getContractAt("ForceActionsFacet", diamond)

	context.manager = new TestManager(context, onlyInitialize)
	if (!onlyInitialize) await context.manager.start()

	return context
}
