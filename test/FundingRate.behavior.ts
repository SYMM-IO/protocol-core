import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"

import { initializeFixture } from "./Initialize.fixture"
import { Hedger } from "./models/Hedger"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { decimal, getBlockTimestamp, unDecimal } from "./utils/Common"
import { getDummyCrossLiquidationSig, getDummyPairUpnlSig } from "./utils/SignatureUtils"
import { expect } from "chai"
import { limitQuoteRequestBuilder } from "./models/requestModels/QuoteRequest"
import { PositionType } from "./models/Enums"
import { bigint } from "hardhat/internal/core/params/argumentTypes"

export function shouldBehaveLikeFundingRate(): void {
	let context: RunContext, user: User, hedger: Hedger, hedger2: Hedger

	const EightHourInSec = 28800
	const NineHourInSec = 32400

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(5000n), decimal(5000n), decimal(5000n))

		hedger = new Hedger(context, context.signers.hedger)
		await hedger.setBalances(decimal(5000n), decimal(5000n))

		await user.sendQuote()
		await hedger.lockQuote(1)
		await hedger.openPosition(1)

		await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
		await hedger.lockQuote(2)
		await hedger.openPosition(2)
		await user.requestToClosePosition(2)

		await user.sendQuote()
		await hedger.lockQuote(3)
		await hedger.openPosition(3)
		await user.requestToClosePosition(3)
		await hedger.fillCloseRequest(3)

		await user.sendQuote(limitQuoteRequestBuilder().maxFundingRate("30000000").build())
		await hedger.lockQuote(4)
		await hedger.openPosition(4)
	})

	it("Should fail on different length", async function () {
		await expect(hedger.chargeFundingRate(await context.signers.user.getAddress(), [1], [], await getDummyPairUpnlSig())).to.be.revertedWith(
			"ChargeFundingFacet: Length not match",
		)
	})

	it("Should fail on invalid quote for partyB", async function () {
		await expect(hedger.chargeFundingRate(await context.signers.user2.getAddress(), [1], [1], await getDummyPairUpnlSig())).to.be.revertedWith(
			"ChargeFundingFacet: Invalid quote",
		)
	})

	it("Should fail on invalid quote state", async function () {
		await expect(hedger.chargeFundingRate(await context.signers.user.getAddress(), [3], [1], await getDummyPairUpnlSig())).to.be.revertedWith(
			"ChargeFundingFacet: Invalid state",
		)
	})

	it("Should fail on out of window request", async function () {
		let symbol = await context.viewFacet.getSymbol(1)
		let duration = symbol.fundingRateEpochDuration
		let window = symbol.fundingRateWindowTime
		let currentEpoch = (BigInt(await time.latest()) / duration) * duration
		let targetTime = duration * 2n + window + 1n + currentEpoch

		await time.setNextBlockTimestamp(targetTime)
		await expect(hedger.chargeFundingRate(await context.signers.user.getAddress(), [1], [1], await getDummyPairUpnlSig())).to.be.revertedWith(
			"ChargeFundingFacet: Current timestamp is out of window",
		)
	})

	it("Should fail on high funding rate", async function () {
		let symbol = await context.viewFacet.getSymbol(1)
		let duration = symbol.fundingRateEpochDuration
		let window = symbol.fundingRateWindowTime
		let currentEpoch = (BigInt(await time.latest()) / duration) * duration
		let targetTime = duration * 2n + window - 1n + currentEpoch

		await time.setNextBlockTimestamp(targetTime)
		await expect(
			hedger.chargeFundingRate(await context.signers.user.getAddress(), [1], [decimal(3n, 16)], await getDummyPairUpnlSig()),
		).to.be.revertedWith("ChargeFundingFacet: High funding rate")
	})

	it("Should fail on insolvent partyA", async function () {
		let symbol = await context.viewFacet.getSymbol(1)
		let duration = symbol.fundingRateEpochDuration
		let window = symbol.fundingRateWindowTime
		let currentEpoch = (BigInt(await time.latest()) / duration) * duration
		let targetTime = duration * 2n + window - 1n + currentEpoch

		await time.setNextBlockTimestamp(targetTime)
		await expect(
			hedger.chargeFundingRate(await context.signers.user.getAddress(), [1], [decimal(1n, 16)], await getDummyPairUpnlSig(decimal(4970n) * -1n)),
		).to.be.revertedWith("ChargeFundingFacet: PartyA will be insolvent")
	})

	it("Should fail on insolvent partyB", async function () {
		let symbol = await context.viewFacet.getSymbol(1)
		let duration = symbol.fundingRateEpochDuration
		let window = symbol.fundingRateWindowTime
		let currentEpoch = (BigInt(await time.latest()) / duration) * duration
		let targetTime = duration * 2n + window - 1n + currentEpoch

		await time.setNextBlockTimestamp(targetTime)
		await expect(
			hedger.chargeFundingRate(
				await context.signers.user.getAddress(),
				[1],
				[decimal(1n, 15)],
				await getDummyPairUpnlSig(BigInt(0), decimal(4970n) * -1n),
			),
		).to.be.revertedWith("ChargeFundingFacet: PartyB will be insolvent")
	})

	it("Should run successfully for long", async function () {
		let symbol = await context.viewFacet.getSymbol(1)
		let duration = symbol.fundingRateEpochDuration
		let window = symbol.fundingRateWindowTime
		let currentEpoch = (BigInt(await time.latest()) / duration) * duration
		let targetTime = duration * 2n + window - 1n + currentEpoch

		let oldQuote = await context.viewFacet.getQuote(1)

		await time.setNextBlockTimestamp(targetTime)
		await hedger.chargeFundingRate(await context.signers.user.getAddress(), [1], [decimal(1n, 16)], await getDummyPairUpnlSig())

		let newQuote = await context.viewFacet.getQuote(1)
		expect(newQuote.openedPrice).to.be.equal(unDecimal(oldQuote.openedPrice * (decimal(1n) + decimal(1n, 16))))
	})

	it("Should run successfully for short", async function () {
		let symbol = await context.viewFacet.getSymbol(1)
		let duration = symbol.fundingRateEpochDuration
		let window = symbol.fundingRateWindowTime
		let currentEpoch = (BigInt(await time.latest()) / duration) * duration
		let targetTime = duration * 2n + window - 1n + currentEpoch

		let oldQuote = await context.viewFacet.getQuote(2)

		await time.setNextBlockTimestamp(targetTime)
		await hedger.chargeFundingRate(await context.signers.user.getAddress(), [2], [decimal(1n, 16)], await getDummyPairUpnlSig())

		let newQuote = await context.viewFacet.getQuote(2)
		expect(newQuote.openedPrice).to.be.equal(unDecimal(oldQuote.openedPrice * (decimal(1n) - decimal(1n, 16))))
	})

	describe.only("Accumulative Funding Rate Methods", function () {
		describe("setEpochDuration", function () {
			beforeEach(async () => {})

			it("should fail when partyB action paused", async () => {
				await context.controlFacet.pausePartyBActions()
				await expect(context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([], [])).to.revertedWith(
					"Pausable: PartyB actions paused",
				)
			})

			it("should fail when system globally paused", async () => {
				await context.controlFacet.pauseGlobal()
				await expect(context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([], [])).to.revertedWith("Pausable: Global paused")
			})

			it("should fail when non-partyB called", async () => {
				await expect(context.fundingRateFacet.connect(context.signers.user).setEpochDurations([], [])).to.revertedWith(
					"Accessibility: Should be partyB",
				)
			})

			it("should fail when input arrays length mismatch", async () => {
				await expect(context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [])).to.revertedWith(
					"FundingRateFacet: Invalid length",
				)
			})

			it("should fail when want to set duration zero", async () => {
				await expect(context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [0])).to.revertedWith(
					"FundingRateFacet: Zero epoch duration",
				)
			})

			it("should set epoch duration for first time correctly", async () => {
				await expect(context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [EightHourInSec])).to.not.reverted

				const blockTimestamp = await getBlockTimestamp()

				const fundingFee = await context.viewFacet.getFundingRate(1, context.signers.hedger)
				expect(fundingFee.epochDuration).to.equal(EightHourInSec)
				expect(fundingFee.lastUpdatedEpoch).to.approximately(blockTimestamp / BigInt(EightHourInSec), 120)
			})

			it("should set epoch duration correctly", async () => {
				await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [EightHourInSec])
				await expect(context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [NineHourInSec])).to.not.reverted

				const blockTimestamp = await getBlockTimestamp()

				const fundingFee = await context.viewFacet.getFundingRate(1, context.signers.hedger)
				expect(fundingFee.epochDuration).to.equal(NineHourInSec)
				expect(fundingFee.lastUpdatedEpoch).to.approximately(blockTimestamp / BigInt(NineHourInSec), 1)
				expect(fundingFee.startEpoch).to.equal(0)
			})
		})

		describe("updateAccumulatedFundingFee", () => {
			beforeEach(async () => {
				await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [EightHourInSec])
			})

			it("should fail when partyB action paused", async () => {
				await context.controlFacet.pausePartyBActions()
				await expect(context.fundingRateFacet.connect(context.signers.hedger).updateAccumulatedFundingFee([], [], [], [])).to.revertedWith(
					"Pausable: PartyB actions paused",
				)
			})

			it("should fail when system globally paused", async () => {
				await context.controlFacet.pauseGlobal()
				await expect(context.fundingRateFacet.connect(context.signers.hedger).updateAccumulatedFundingFee([], [], [], [])).to.revertedWith(
					"Pausable: Global paused",
				)
			})

			it("should fail when non-partyB called", async () => {
				await expect(context.fundingRateFacet.connect(context.signers.user).updateAccumulatedFundingFee([], [], [], [])).to.revertedWith(
					"Accessibility: Should be partyB",
				)
			})

			it("should fail when input arrays length mismatch", async () => {
				await expect(context.fundingRateFacet.connect(context.signers.hedger).updateAccumulatedFundingFee([1], [], [], [])).to.revertedWith(
					"FundingRateFacet: Invalid length",
				)
			})

			it("should fail when epoch duration not set", async () => {
				await expect(context.fundingRateFacet.connect(context.signers.hedger).updateAccumulatedFundingFee([2], [1], [1], [1])).to.revertedWith(
					"FundingRateFacet: Epoch duration not set",
				)
			})

			it("should update accumulated funding fee first time correctly", async () => {
				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.updateAccumulatedFundingFee([1], [decimal(1n, 14)], [-decimal(1n, 14)], [decimal(1n)]),
				).to.not.reverted

				const blockTimestamp = await getBlockTimestamp()

				const fundingFee = await context.viewFacet.getFundingRate(1, context.signers.hedger)
				expect(fundingFee.startEpoch).to.equal(blockTimestamp / BigInt(EightHourInSec))
				expect(fundingFee.lastUpdatedEpoch).to.equal(blockTimestamp / BigInt(EightHourInSec))
				expect(fundingFee.accumulatedLongRate).to.equal(0)
				expect(fundingFee.accumulatedShortRate).to.equal(0)
				expect(fundingFee.currentLongRate).to.equal((decimal(1n, 14) * decimal(1n)) / decimal(1n))
				expect(fundingFee.currentShortRate).to.equal((-decimal(1n, 14) * decimal(1n)) / decimal(1n))
			})

			it("should update accumulated funding fee correctly", async () => {
				console.log("first update")
				await context.fundingRateFacet
					.connect(context.signers.hedger)
					.updateAccumulatedFundingFee([1], [decimal(1n, 14)], [-decimal(1n, 14)], [decimal(1n)])

				await time.increase(NineHourInSec)

				console.log("second update")
				await context.fundingRateFacet
					.connect(context.signers.hedger)
					.updateAccumulatedFundingFee([1], [decimal(1n, 14)], [-decimal(1n, 14)], [decimal(1n)])

				await time.increase(NineHourInSec * 2)

				console.log("third update")
				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.updateAccumulatedFundingFee([1], [decimal(2n, 14)], [-decimal(2n, 14)], [decimal(1n)]),
				).to.not.reverted

				const fundingFee = await context.viewFacet.getFundingRate(1, context.signers.hedger)
				const blockTimestamp = BigInt(await time.latest())

				expect(fundingFee.lastUpdatedEpoch).to.equal(blockTimestamp / BigInt(EightHourInSec))
				expect(fundingFee.accumulatedLongRate).to.equal(100000000000000)
				expect(fundingFee.accumulatedShortRate).to.equal(-100000000000000)
				expect(fundingFee.currentLongRate).to.equal((decimal(2n, 14) * decimal(1n)) / decimal(1n))
				expect(fundingFee.currentShortRate).to.equal((-decimal(2n, 14) * decimal(1n)) / decimal(1n))
			})
		})

		describe("chargeAccumulatedFundingFee", () => {
			beforeEach(async () => {
				await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [EightHourInSec])
				await context.fundingRateFacet
					.connect(context.signers.hedger)
					.updateAccumulatedFundingFee([1], [decimal(1n, 14)], [-decimal(1n, 14)], [decimal(1n)])

				await time.increase(EightHourInSec * 5)
			})

			it("should fail when partyB action paused", async () => {
				await context.controlFacet.pausePartyBActions()
				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.revertedWith("Pausable: PartyB actions paused")
			})

			it("should fail when system globally paused", async () => {
				await context.controlFacet.pauseGlobal()
				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.revertedWith("Pausable: Global paused")
			})

			it("should fail when non-partyB called", async () => {
				await expect(
					context.fundingRateFacet
						.connect(context.signers.user)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.revertedWith("Accessibility: Should be partyB")
			})

			// TODO ::: test notLiquidatedPartyB(partyB, partyA) modifier

			it("should failed when quote has invalid party A", async () => {
				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user2.getAddress(),
							await context.signers.hedger.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.revertedWith("FundingRateFacet: Invalid quote")
			})

			it("should failed when quote has invalid party B", async () => {
				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger2.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.revertedWith("FundingRateFacet: Sender isn't partyB of quote")
			})

			it("should failed when quote has invalid state", async () => {
				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[3],
							await getDummyPairUpnlSig(),
						),
				).to.revertedWith("FundingRateFacet: Invalid state")
			})

			it("should charge accumulated funding fee for LONG position correctly", async () => {
				const beforePartyABalance = (await user.getBalanceInfo()).allocatedBalances
				const beforePartyBBalance = (await hedger.getBalanceInfo(await user.getAddress())).allocatedBalances

				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.not.reverted

				const afterPartyABalance = (await user.getBalanceInfo()).allocatedBalances
				const afterPartyBBalance = (await hedger.getBalanceInfo(await user.getAddress())).allocatedBalances

				const fundingFee = await context.viewFacet.getFundingRate(1, context.signers.hedger)
				const quote = await context.viewFacet.getQuote(1)

				expect(quote.accumulatedPaidFunding).to.equal(100000000000000)
				expect(quote.lastFundingPaymentTimestamp).to.equal(BigInt(await time.latest()))
				expect(afterPartyABalance - beforePartyABalance).to.equal((-1n * 5n * fundingFee.currentLongRate * quote.quantity) / decimal(1n))
				expect(afterPartyBBalance - beforePartyBBalance).to.equal((5n * fundingFee.currentLongRate * quote.quantity) / decimal(1n))
			})

			it("should charge accumulated funding fee for SHORT position correctly", async () => {
				const beforePartyABalance = (await user.getBalanceInfo()).allocatedBalances
				const beforePartyBBalance = (await hedger.getBalanceInfo(await user.getAddress())).allocatedBalances
				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[2],
							await getDummyPairUpnlSig(),
						),
				).to.not.reverted
				const afterPartyABalance = (await user.getBalanceInfo()).allocatedBalances
				const afterPartyBBalance = (await hedger.getBalanceInfo(await user.getAddress())).allocatedBalances
				const quote = await context.viewFacet.getQuote(2)
				expect(quote.accumulatedPaidFunding).to.equal(-100000000000000)
				expect(quote.lastFundingPaymentTimestamp).to.equal(BigInt(await time.latest()))

				const fundingFee = await context.viewFacet.getFundingRate(1, context.signers.hedger)
				expect(afterPartyABalance - beforePartyABalance).to.equal((5n * fundingFee.currentLongRate * quote.quantity) / decimal(1n))
				expect(afterPartyBBalance - beforePartyBBalance).to.equal((-1n * 5n * fundingFee.currentLongRate * quote.quantity) / decimal(1n))
			})

			it("should charge accumulated funding fee for quote max funding rate correctly", async () => {
				const beforePartyABalance = (await user.getBalanceInfo()).allocatedBalances
				const beforePartyBBalance = (await hedger.getBalanceInfo(await user.getAddress())).allocatedBalances
				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[4],
							await getDummyPairUpnlSig(),
						),
				).to.not.reverted
				const afterPartyABalance = (await user.getBalanceInfo()).allocatedBalances
				const afterPartyBBalance = (await hedger.getBalanceInfo(await user.getAddress())).allocatedBalances

				const q = await context.viewFacet.getQuote(4)
				expect(afterPartyABalance - beforePartyABalance).to.equal(-1n * 5n * q.maxFundingRate)
				expect(afterPartyBBalance - beforePartyBBalance).to.equal(5n * q.maxFundingRate)
			})
		})
	})
}
