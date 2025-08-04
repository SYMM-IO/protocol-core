import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"

import { initializeFixture } from "./Initialize.fixture"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { Hedger } from "./models/Hedger"
import { PositionType, QuoteStatus } from "./models/Enums"
import { limitQuoteRequestBuilder, marketQuoteRequestBuilder } from "./models/requestModels/QuoteRequest"
import { limitCloseRequestBuilder } from "./models/requestModels/CloseRequest"
import { decimal, pausePartyB } from "./utils/Common"
import { getDummyPairUpnlAndPricesSig } from "./utils/SignatureUtils"

export function shouldBehaveLikePartyBBatchActionsFacet(): void {
	let context: RunContext, user: User, user2: User, hedger: Hedger, hedger2: Hedger

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		this.user_allocated = decimal(500n)
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
	})

	describe("openPositions", async function () {
		beforeEach(async function () {
			await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.LONG).build())
			await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
			await user.sendQuote(marketQuoteRequestBuilder().positionType(PositionType.LONG).build())

			await hedger.lockQuote(1)
			await hedger.lockQuote(2)
			await hedger.lockQuote(3)
		})

		it("Should fail when PartyB actions are paused", async function () {
			await pausePartyB(context)
			const quoteIds = [1n, 2n]
			const filledAmounts = [decimal(100n), decimal(100n)]
			const openedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("Pausable: PartyB actions paused")
		})

		it("Should fail with invalid array lengths", async function () {
			const quoteIds = [1n, 2n]
			const filledAmounts = [decimal(100n)]
			const openedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: Invalid length")
		})

		it("Should fail with empty arrays", async function () {
			const quoteIds: bigint[] = []
			const filledAmounts: bigint[] = []
			const openedPrices: bigint[] = []
			const upnlSig = await getDummyPairUpnlAndPricesSig([], [])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: Invalid length")
		})

		it("Should fail when sender is not partyB of quote", async function () {
			const quoteIds = [1n, 2n]
			const filledAmounts = [decimal(100n), decimal(100n)]
			const openedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger2).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: Sender should be the partyB")
		})

		it("Should fail when partyA is suspended", async function () {
			await context.controlFacet.connect(context.signers.admin).suspendedAddress(context.signers.hedger.address)

			const quoteIds = [1n, 2n]
			const filledAmounts = [decimal(100n), decimal(100n)]
			const openedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: Sender is Suspended")
		})

		it("Should fail when partyB is suspended", async function () {
			await context.controlFacet.connect(context.signers.admin).suspendedAddress(context.signers.hedger.address)

			const quoteIds = [1n, 2n]
			const filledAmounts = [decimal(100n), decimal(100n)]
			const openedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: Sender is Suspended")
		})

		it("Should fail when system is in emergency mode", async function () {
			await context.controlFacet.connect(context.signers.admin).activeEmergencyMode()

			const quoteIds = [1n, 2n]
			const filledAmounts = [decimal(100n), decimal(100n)]
			const openedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: System is in emergency mode")
		})

		it("Should fail when partyB is in emergency mode", async function () {
			await context.controlFacet.connect(context.signers.admin).setPartyBEmergencyStatus([context.signers.hedger.address], true)

			const quoteIds = [1n, 2n]
			const filledAmounts = [decimal(100n), decimal(100n)]
			const openedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: PartyB is in emergency mode")
		})

		it("Should fail when quotes belong to different partyAs", async function () {
			await user2.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.LONG).build())
			await hedger.lockQuote(4)

			const quoteIds = [1n, 4n]
			const filledAmounts = [decimal(100n), decimal(100n)]
			const openedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: All positions should belong to one partyA")
		})

		it("Should successfully open multiple positions", async function () {
			const quoteIds = [1n, 2n]
			const filledAmounts = [decimal(100n), decimal(100n)]
			const openedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig)).to
				.not.reverted
		})
	})

	describe("fillCloseRequests", async function () {
		beforeEach(async function () {
			await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.LONG).price(decimal(4n)).build())
			await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())

			await hedger.lockQuote(1)
			await hedger.lockQuote(2)
			await hedger.openPosition(1)
			await hedger.openPosition(2)

			await user.requestToClosePosition(1, limitCloseRequestBuilder().build())
			await user.requestToClosePosition(2, limitCloseRequestBuilder().build())
		})

		it("Should fail when PartyB actions are paused", async function () {
			await pausePartyB(context)
			const quoteIds = [1n, 2n]
			const filledAmounts = [decimal(50n), decimal(50n)]
			const closedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).fillCloseRequests(quoteIds, filledAmounts, closedPrices, upnlSig),
			).to.be.revertedWith("Pausable: PartyB actions paused")
		})

		it("Should fail with invalid array lengths", async function () {
			const quoteIds = [1n, 2n]
			const filledAmounts = [decimal(50n)]
			const closedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).fillCloseRequests(quoteIds, filledAmounts, closedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: Invalid length")
		})

		it("Should fail with empty arrays", async function () {
			const quoteIds: bigint[] = []
			const filledAmounts: bigint[] = []
			const closedPrices: bigint[] = []
			const upnlSig = await getDummyPairUpnlAndPricesSig([], [])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).fillCloseRequests(quoteIds, filledAmounts, closedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: Invalid length")
		})

		it("Should fail when quotes belong to different partyAs", async function () {
			await user2.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.LONG).build())
			await hedger.lockQuote(3)
			await hedger.openPosition(3)
			await user2.requestToClosePosition(3, limitCloseRequestBuilder().build())

			const quoteIds = [1n, 3n]
			const filledAmounts = [decimal(50n), decimal(50n)]
			const closedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).fillCloseRequests(quoteIds, filledAmounts, closedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: All positions should belong to one partyA")
		})

		it("Should successfully fill multiple close requests", async function () {
			const quoteIds = [1n, 2n]
			const filledAmounts = [decimal(50n), decimal(50n)]
			const closedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await expect(context.partyBBatchActionsFacet.connect(context.signers.hedger).fillCloseRequests(quoteIds, filledAmounts, closedPrices, upnlSig))
				.to.not.reverted
		})

		it("Should update nonces correctly", async function () {
			const partyANonceBefore = await context.viewFacet.nonceOfPartyA(context.signers.user.address)
			const partyBNonceBefore = await context.viewFacet.nonceOfPartyB(context.signers.hedger.address, context.signers.user.address)

			const quoteIds = [1n, 2n]
			const filledAmounts = [decimal(50n), decimal(50n)]
			const closedPrices = [decimal(1n), decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n), decimal(1n)], [1n, 1n])

			await context.partyBBatchActionsFacet.connect(context.signers.hedger).fillCloseRequests(quoteIds, filledAmounts, closedPrices, upnlSig)

			const partyANonceAfter = await context.viewFacet.nonceOfPartyA(context.signers.user.address)
			const partyBNonceAfter = await context.viewFacet.nonceOfPartyB(context.signers.hedger.address, context.signers.user.address)

			expect(partyANonceAfter).to.equal(partyANonceBefore + 1n)
			expect(partyBNonceAfter).to.equal(partyBNonceBefore + 1n)
		})
	})

	describe("Access Control and Security", async function () {
		beforeEach(async function () {
			await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.LONG).build())
			await hedger.lockQuote(1)
		})

		it("Should fail when called by non-partyB address", async function () {
			const quoteIds = [1n]
			const filledAmounts = [decimal(100n)]
			const openedPrices = [decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n)], [1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.user).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: Sender should be the partyB")
		})

		it("Should fail when global pause is active", async function () {
			await context.controlFacet.connect(context.signers.admin).pauseGlobal()

			const quoteIds = [1n]
			const filledAmounts = [decimal(100n)]
			const openedPrices = [decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n)], [1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("Pausable: Global paused")
		})

		it("Should handle invalid quote states", async function () {
			await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.LONG).build())
			// Dont lock quote 2

			const quoteIds = [2n]
			const filledAmounts = [decimal(100n)]
			const openedPrices = [decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n)], [1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: Sender should be the partyB")
		})

		it("Should validate quote expiration", async function () {
			await time.increase(86400) // 1 day

			const quoteIds = [1n]
			const filledAmounts = [decimal(100n)]
			const openedPrices = [decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n)], [1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: Quote is expired")
		})
	})

	describe("Edge Cases and Error Handling", async function () {
		beforeEach(async function () {
			await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.LONG).build())
			await hedger.lockQuote(1)
		})

		it("Should fail when opened price is invalid for LONG position", async function () {
			const quote = await context.viewFacet.getQuote(1n)
			const invalidPrice = quote.requestedOpenPrice + decimal(1n)

			const quoteIds = [1n]
			const filledAmounts = [decimal(100n)]
			const openedPrices = [invalidPrice]
			const upnlSig = await getDummyPairUpnlAndPricesSig([invalidPrice], [1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: Opened price isn't valid")
		})

		it("Should fail when opened price is invalid for SHORT position", async function () {
			await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
			await hedger.lockQuote(2)

			const quote = await context.viewFacet.getQuote(2n)
			const invalidPrice = quote.requestedOpenPrice - decimal(1n)

			const quoteIds = [2n]
			const filledAmounts = [decimal(100n)]
			const openedPrices = [invalidPrice]
			const upnlSig = await getDummyPairUpnlAndPricesSig([invalidPrice], [1n])

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("PartyBFacet: Opened price isn't valid")
		})

		it("Should fail when parties become insolvent after opening", async function () {
			const quoteIds = [1n]
			const filledAmounts = [decimal(100n)]
			const openedPrices = [decimal(1n)]
			const upnlSig = await getDummyPairUpnlAndPricesSig([decimal(1n)], [1n], -decimal(10000n), -decimal(10000n))

			await expect(
				context.partyBBatchActionsFacet.connect(context.signers.hedger).openPositions(quoteIds, filledAmounts, openedPrices, upnlSig),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
		})
	})
}
