import {loadFixture} from "@nomicfoundation/hardhat-network-helpers"

import {initializeFixture} from "./Initialize.fixture"
import {PositionType} from "./models/Enums"
import {Hedger} from "./models/Hedger"
import {RunContext} from "./models/RunContext"
import {User} from "./models/User"
import {limitQuoteRequestBuilder} from "./models/requestModels/QuoteRequest"
import {decimal, unDecimal} from "./utils/Common"
import {expect} from "chai"
import {getDummySettlementSig, getDummySingleUpnlSig} from "./utils/SignatureUtils"
import {QuoteSettlementDataStructOutput} from "../src/types/contracts/facets/Settlement/ISettlementFacet"

export function shouldBehaveLikeSettlement(): void {
	let context: RunContext, user: User, user2: User, hedger: Hedger, hedger2: Hedger
	let longHedger1: bigint, shortHedger1: bigint, shortHedger2: bigint, shortClosePending: bigint,
		longClosed: bigint, longHedger1User2: bigint

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		this.user_allocated = decimal(700n)
		this.hedger_allocated = decimal(4000n)

		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(2000n), decimal(1000n), this.user_allocated)

		user2 = new User(context, context.signers.user2)
		await user2.setup()
		await user2.setBalances(decimal(2000n), decimal(1000n), this.user_allocated)

		hedger = new Hedger(context, context.signers.hedger)
		await hedger.setup()
		await hedger.setBalances(this.hedger_allocated, this.hedger_allocated)

		hedger2 = new Hedger(context, context.signers.hedger2)
		await hedger2.setup()
		await hedger2.setBalances(this.hedger_allocated, this.hedger_allocated)

		longHedger1 = await user.sendQuote()
		await hedger.lockQuote(longHedger1)
		await hedger.openPosition(longHedger1)

		longHedger1User2 = await user2.sendQuote()
		await hedger.lockQuote(longHedger1User2)
		await hedger.openPosition(longHedger1User2)

		shortHedger1 = await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
		await hedger.lockQuote(shortHedger1)
		await hedger.openPosition(shortHedger1)

		shortHedger2 = await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
		await hedger2.lockQuote(shortHedger2)
		await hedger2.openPosition(shortHedger2)

		shortClosePending = await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
		await hedger.lockQuote(shortClosePending)
		await hedger.openPosition(shortClosePending)
		await user.requestToClosePosition(shortClosePending)

		longClosed = await user.sendQuote()
		await hedger.lockQuote(longClosed)
		await hedger.openPosition(longClosed)
		await user.requestToClosePosition(longClosed)
		await hedger.fillCloseRequest(longClosed)
	})

	it("Should fail when partyB actions paused", async function () {
		await context.controlFacet.connect(context.signers.admin).pausePartyBActions()
		await expect(hedger.settleUpnl(await user.getAddress(), [])).to.be.revertedWith("Pausable: PartyB actions paused")
	})

	it("Should fail when partyA is liquidated", async function () {
		await user.liquidateAndSetSymbolPrices([1n], [decimal(10000000n)])
		await expect(hedger.settleUpnl(await user.getAddress(), [])).to.be.revertedWith("Accessibility: PartyA isn't solvent")
	})

	it("Should fail when settlementData.length != updatedPrices.length", async function () {
		await expect(hedger.settleUpnl(await user.getAddress(), [1n])).to.be.revertedWith("LibSettlement: Invalid length")
	})

	it("Should fail when when partyA is insolvent", async function () {
		await expect(hedger.settleUpnl(await user.getAddress(), [], getDummySettlementSig(decimal(600n) * -1n))).to.be.revertedWith("LibSettlement: PartyA is insolvent")
	})

	it("Should fail if sender doesn't have open position with user", async function () {
		await expect(hedger2.settleUpnl(await user2.getAddress(), [])).to.be.revertedWith("LibSettlement: Sender should have a position with partyA")
	})

	it("Should fail if one of quotes has different partyA than the one in parameter", async function () {
		await expect(hedger.settleUpnl(await user.getAddress(), [1n], getDummySettlementSig(0n, [0n], [
			{
				quoteId: longHedger1User2,
				currentPrice: 0n,
				partyBUpnlIndex: 0n
			} as QuoteSettlementDataStructOutput
		]))).to.be.revertedWith("LibSettlement: PartyA is invalid")
	})

	it("Should fail if the quoteStatus is neither OPENED/CLOSE_PENDING/CANCEL_CLOSE_PENDING", async function () {
		await expect(hedger.settleUpnl(await user.getAddress(), [1n], getDummySettlementSig(0n, [0n], [
			{
				quoteId: longClosed,
				currentPrice: 0n,
				partyBUpnlIndex: 0n
			} as QuoteSettlementDataStructOutput
		]))).to.be.revertedWith("LibSettlement: Invalid state")
	})

	it("Should fail if the newPrice hasn't move to the right direction (Both for short and long)", async function () {
		await expect(hedger.settleUpnl(await user.getAddress(), [decimal(0n)], getDummySettlementSig(0n, [0n], [
			{
				quoteId: longHedger1,
				currentPrice: decimal(2n),
				partyBUpnlIndex: decimal(0n)
			} as QuoteSettlementDataStructOutput
		]))).to.be.revertedWith("LibSettlement: Updated price is out of range")
		await expect(hedger.settleUpnl(await user.getAddress(), [decimal(2n)], getDummySettlementSig(0n, [0n], [
			{
				quoteId: shortHedger1,
				currentPrice: decimal(0n),
				partyBUpnlIndex: decimal(0n)
			} as QuoteSettlementDataStructOutput
		]))).to.be.revertedWith("LibSettlement: Updated price is out of range")
	})

	it("Should fail if partyB is in liquidation process", async function () {
		await hedger.liquidate(await user.getAddress(), await getDummySingleUpnlSig(decimal(10000n) * -1n) as any)
		await expect(hedger.settleUpnl(await user.getAddress(), [1n], getDummySettlementSig(0n, [0n], [
			{
				quoteId: longHedger1,
				currentPrice: 0n,
				partyBUpnlIndex: 0n
			} as QuoteSettlementDataStructOutput
		]))).to.be.revertedWith("LibSettlement: PartyB is in liquidation process")
	})

	it("Should fail if partyB is not solvent", async function () {
		await expect(hedger.settleUpnl(await user.getAddress(), [1n], getDummySettlementSig(0n, [decimal(10000n) * -1n], [
			{
				quoteId: shortHedger1,
				currentPrice: 0n,
				partyBUpnlIndex: 0n
			} as QuoteSettlementDataStructOutput
		]))).to.be.revertedWith("LibSettlement: PartyB should be solvent")
	})

	it("Should fail if partyB is settling too frequently for the relation of user with another partyB", async function () {
		await hedger.settleUpnl(await user.getAddress(), [decimal(5n, 17)], getDummySettlementSig(0n, [0n], [
			{
				quoteId: shortHedger2,
				currentPrice: 0n,
				partyBUpnlIndex: 0n
			} as QuoteSettlementDataStructOutput
		]))
		await expect(hedger.settleUpnl(await user.getAddress(), [decimal(2n, 17)], getDummySettlementSig(0n, [0n], [
			{
				quoteId: shortHedger2,
				currentPrice: 0n,
				partyBUpnlIndex: 0n
			} as QuoteSettlementDataStructOutput
		]))).to.be.revertedWith("LibSettlement: Cooldown should be passed")
	})

	it("Should fail on invalid partyBUpnlIndex in signature", async function () {
		await expect(hedger.settleUpnl(await user.getAddress(), [decimal(5n, 17)], getDummySettlementSig(0n, [0n], [
			{
				quoteId: shortHedger1,
				currentPrice: 0n,
				partyBUpnlIndex: 3n
			} as QuoteSettlementDataStructOutput,
		]))).to.be.revertedWith("LibSettlement: Invalid partyBUpnlIndex in signature")
	})


	it("Should fail on invalid upnlPartyBs list", async function () {
		await expect(hedger.settleUpnl(await user.getAddress(), [decimal(5n, 17), decimal(5n, 17)], getDummySettlementSig(0n, [0n], [
			{
				quoteId: shortHedger1,
				currentPrice: 0n,
				partyBUpnlIndex: 0n
			} as QuoteSettlementDataStructOutput,
			{
				quoteId: shortHedger2,
				currentPrice: 0n,
				partyBUpnlIndex: 0n
			} as QuoteSettlementDataStructOutput
		]))).to.be.revertedWith("LibSettlement: Invalid upnlPartyBs list")
	})

	it("Should run successfully", async function () {
		const beforeNoncePartyA = await context.viewFacet.nonceOfPartyA(await user.getAddress())
		const beforeNoncePartyB = await context.viewFacet.nonceOfPartyB(await hedger.getAddress(), await user.getAddress())
		const beforeNoncePartyB2 = await context.viewFacet.nonceOfPartyB(await hedger2.getAddress(), await user.getAddress())

		const beforeAllocatedPartyA = (await user.getBalanceInfo()).allocatedBalances
		const beforeAllocatedPartyB = (await hedger.getBalanceInfo(await user.getAddress())).allocatedBalances
		const beforeAllocatedPartyB2 = (await hedger2.getBalanceInfo(await user.getAddress())).allocatedBalances

		const quote1 = await context.viewFacet.getQuote(shortHedger1)
		const quote2 = await context.viewFacet.getQuote(shortHedger2)

		await hedger.settleUpnl(await user.getAddress(), [decimal(5n, 17), decimal(5n, 17)], getDummySettlementSig(0n, [0n, 0n], [
			{
				quoteId: shortHedger1,
				currentPrice: 0n,
				partyBUpnlIndex: 0n
			} as QuoteSettlementDataStructOutput,
			{
				quoteId: shortHedger2,
				currentPrice: 0n,
				partyBUpnlIndex: 1n
			} as QuoteSettlementDataStructOutput
		]))
		expect(await context.viewFacet.nonceOfPartyA(await user.getAddress())).to.be.eq(beforeNoncePartyA + 1n)
		expect(await context.viewFacet.nonceOfPartyB(await hedger.getAddress(), await user.getAddress())).to.be.eq(beforeNoncePartyB + 1n)
		expect(await context.viewFacet.nonceOfPartyB(await hedger2.getAddress(), await user.getAddress())).to.be.eq(beforeNoncePartyB2 + 1n)
		expect((await context.viewFacet.getQuote(shortHedger1)).openedPrice).to.be.eq(decimal(5n, 17).toString())
		expect((await context.viewFacet.getQuote(shortHedger2)).openedPrice).to.be.eq(decimal(5n, 17).toString())

		expect((await user.getBalanceInfo()).allocatedBalances).to.be.eq(beforeAllocatedPartyA + unDecimal((quote1.quantity + quote2.quantity) * decimal(5n, 17)))
		expect((await hedger.getBalanceInfo(await user.getAddress())).allocatedBalances).to.be.eq(beforeAllocatedPartyB - unDecimal(quote1.quantity * decimal(5n, 17)))
		expect((await hedger2.getBalanceInfo(await user.getAddress())).allocatedBalances).to.be.eq(beforeAllocatedPartyB2 - unDecimal(quote2.quantity * decimal(5n, 17)))
	})
}
