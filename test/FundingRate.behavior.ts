import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"

import { initializeFixture } from "./Initialize.fixture"
import { Hedger } from "./models/Hedger"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { decimal, getBlockTimestamp, unDecimal } from "./utils/Common"
import { getDummyPairUpnlSig } from "./utils/SignatureUtils"
import { expect } from "chai"
import { limitQuoteRequestBuilder } from "./models/requestModels/QuoteRequest"
import { PositionType } from "./models/Enums"
import { limitOpenRequestBuilder } from "./models/requestModels/OpenRequest"

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

	it("should check sig when not bound", async function () {
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

	it("should skip check sig when bound", async function () {
		await context.accountFacet.connect(context.signers.user).bindToPartyB(context.signers.hedger.address)

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
		).not.reverted
	})

	describe("Accumulative Funding Rate Methods", function () {
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

				const fundingFee = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)
				expect(fundingFee.epochDuration).to.equal(EightHourInSec)
				expect(fundingFee.lastUpdatedEpoch).to.approximately(blockTimestamp / BigInt(EightHourInSec), 120)
			})

			it("should set epoch duration correctly", async () => {
				await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [EightHourInSec])
				await expect(context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [NineHourInSec])).to.not.reverted

				const blockTimestamp = await getBlockTimestamp()

				const fundingFee = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)
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

				const fundingFee = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)
				expect(fundingFee.startEpoch).to.equal(blockTimestamp / BigInt(EightHourInSec))
				expect(fundingFee.lastUpdatedEpoch).to.equal(blockTimestamp / BigInt(EightHourInSec))
				expect(fundingFee.accumulatedLongRate).to.equal(0)
				expect(fundingFee.accumulatedShortRate).to.equal(0)
				expect(fundingFee.currentLongRate).to.equal((decimal(1n, 14) * decimal(1n)) / decimal(1n))
				expect(fundingFee.currentShortRate).to.equal((-decimal(1n, 14) * decimal(1n)) / decimal(1n))
			})

			it("should update accumulated funding fee correctly", async () => {
				await context.fundingRateFacet
					.connect(context.signers.hedger)
					.updateAccumulatedFundingFee([1], [decimal(1n, 14)], [-decimal(1n, 14)], [decimal(1n)])

				await time.increase(NineHourInSec)

				await context.fundingRateFacet
					.connect(context.signers.hedger)
					.updateAccumulatedFundingFee([1], [decimal(1n, 14)], [-decimal(1n, 14)], [decimal(1n)])

				await time.increase(NineHourInSec * 2)

				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.updateAccumulatedFundingFee([1], [decimal(2n, 14)], [-decimal(2n, 14)], [decimal(1n)]),
				).to.not.reverted

				const fundingFee = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)
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
		})

		describe("funding rate accumulation over multiple epochs", () => {
			beforeEach(async () => {
				// Set initial block timestamp to a known value
				await time.setNextBlockTimestamp(2000000000)
				await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [400])
			})

			it("should correctly accumulate and charge funding rates across multiple epochs", async () => {
				const startTime = await time.latest()

				//* Move to t+200: Set initial funding fee
				await time.setNextBlockTimestamp(startTime + 200)
				await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(2n, 16)], [0], [decimal(1n)])

				const fundingRate1 = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)
				expect(fundingRate1.currentLongRate).to.equal(decimal(2n, 16))
				expect(fundingRate1.accumulatedLongRate).to.equal(0)

				//* Move to t+300: Update funding fee
				await time.setNextBlockTimestamp(startTime + 300)
				await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(3n, 16)], [0], [decimal(1n)])

				const fundingRate2 = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)
				expect(fundingRate2.currentLongRate).to.equal(decimal(3n, 16))
				expect(fundingRate2.accumulatedLongRate).to.equal(0)

				//* Move to t+500: Create and open position
				await time.setNextBlockTimestamp(startTime + 500)
				await user.sendQuote(
					limitQuoteRequestBuilder()
						.quantity(decimal(1n))
						.price(decimal(1n))
						.deadline(startTime + 1000)
						.maxFundingRate(decimal(1n))
						.build(),
				)
				await hedger.lockQuote(5)
				await hedger.openPosition(5, limitOpenRequestBuilder().filledAmount(decimal(1n)).build())

				const fundingRate3 = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)
				const quote1 = await context.viewFacet.getQuote(5)
				expect(fundingRate3.currentLongRate).to.equal(decimal(3n, 16))
				expect(fundingRate3.accumulatedLongRate).to.equal(decimal(3n, 16))
				expect(quote1.lastFundingPaymentTimestamp).to.approximately(startTime + 500, 10)

				//* Move to t+700: Update funding fee
				await time.setNextBlockTimestamp(startTime + 700)
				await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(1n, 16)], [0], [decimal(1n)])

				const fundingRate4 = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)
				expect(fundingRate4.currentLongRate).to.equal(decimal(1n, 16))
				expect(fundingRate4.accumulatedLongRate).to.equal(decimal(3n, 16))
				expect(fundingRate4.lastUpdatedEpoch).to.equal(BigInt(await time.latest()) / 400n)

				//* Move to t+1000: Update funding fee
				await time.setNextBlockTimestamp(startTime + 1000)
				await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(5n, 16)], [0], [decimal(1n)])

				const fundingRate5 = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)
				expect(fundingRate5.currentLongRate).to.equal(decimal(5n, 16))
				expect(fundingRate5.accumulatedLongRate).to.equal(decimal(2n, 16))
				expect(fundingRate5.lastUpdatedEpoch).to.equal(BigInt(await time.latest()) / 400n)

				//* Move to t+1300: Update funding fee
				await time.setNextBlockTimestamp(startTime + 1300)
				await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(2n, 16)], [0], [decimal(1n)])

				const fundingRate6 = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)
				expect(fundingRate6.currentLongRate).to.equal(decimal(2n, 16))
				expect(fundingRate6.accumulatedLongRate).to.equal(decimal(3n, 16))
				expect(fundingRate6.lastUpdatedEpoch).to.equal(BigInt(await time.latest()) / 400n)

				//* Move to t+1400: Charge accumulated funding fee
				await time.setNextBlockTimestamp(startTime + 1400)
				const beforeBalance1 = (await user.getBalanceInfo()).allocatedBalances
				await context.fundingRateFacet
					.connect(context.signers.hedger)
					.chargeAccumulatedFundingFee(
						await context.signers.user.getAddress(),
						await context.signers.hedger.getAddress(),
						[5],
						await getDummyPairUpnlSig(),
					)
				const afterBalance1 = (await user.getBalanceInfo()).allocatedBalances

				const quote2 = await context.viewFacet.getQuote(5)
				expect(quote2.accumulatedPaidFunding).to.equal(decimal(9n, 16))
				expect(quote2.lastFundingPaymentTimestamp).to.equal(BigInt(await time.latest()))
				expect(afterBalance1 - beforeBalance1).to.equal(-1n * decimal(6n, 16))

				//* Move to t+1500: Update epoch duration
				await time.setNextBlockTimestamp(startTime + 1500)
				await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [300])
				const fundingRate7 = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)
				expect(fundingRate7.currentLongRate).to.equal(decimal(15n, 15))
				expect(fundingRate7.accumulatedLongRate).to.equal(decimal(225n, 14))
				expect(fundingRate7.startEpoch).to.equal(BigInt(fundingRate7.startEpochTimeStamp) / 300n)

				//* Move to t+1700: Charge accumulated funding fee
				await time.setNextBlockTimestamp(startTime + 1700)
				const beforeBalance2 = (await user.getBalanceInfo()).allocatedBalances
				await context.fundingRateFacet
					.connect(context.signers.hedger)
					.chargeAccumulatedFundingFee(
						await context.signers.user.getAddress(),
						await context.signers.hedger.getAddress(),
						[5],
						await getDummyPairUpnlSig(),
					)
				const afterBalance2 = (await user.getBalanceInfo()).allocatedBalances

				const quote3 = await context.viewFacet.getQuote(5)
				const fundingRate8 = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)

				expect(fundingRate8.currentLongRate).to.equal(decimal(15n, 15))
				expect(fundingRate8.accumulatedLongRate).to.equal(decimal(21n, 15))

				expect(quote3.accumulatedPaidFunding).to.equal(decimal(105n, 15)) //! 0.12
				expect(quote3.lastFundingPaymentTimestamp).to.equal(await time.latest())
				expect(afterBalance2 - beforeBalance2).to.equal(-1n * decimal(15n, 15))

				//* Move to t+1900: Update funding fee
				await time.setNextBlockTimestamp(startTime + 1800)
				await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(5n, 16)], [0], [decimal(1n)])

				const fundingRate9 = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)
				expect(fundingRate9.currentLongRate).to.equal(decimal(5n, 16))
				expect(fundingRate9.accumulatedLongRate).to.equal(decimal(21n, 15))
				expect(fundingRate9.lastUpdatedEpoch).to.equal(BigInt(await time.latest()) / 300n)

				//* Move to t+2100: Final charge of accumulated funding fee
				await time.setNextBlockTimestamp(startTime + 2100)
				const beforeBalance3 = (await user.getBalanceInfo()).allocatedBalances
				await context.fundingRateFacet
					.connect(context.signers.hedger)
					.chargeAccumulatedFundingFee(
						await context.signers.user.getAddress(),
						await context.signers.hedger.getAddress(),
						[5],
						await getDummyPairUpnlSig(),
					)
				const afterBalance3 = (await user.getBalanceInfo()).allocatedBalances

				const quote4 = await context.viewFacet.getQuote(5)
				const fundingRate10 = await context.viewFacet.getFundingFeesOfPartyB(1, context.signers.hedger)

				expect(fundingRate10.currentLongRate).to.equal(decimal(5n, 16))
				expect(fundingRate10.accumulatedLongRate).to.approximately(decimal(258n, 14), decimal(35n, 13))

				expect(quote4.accumulatedPaidFunding).to.approximately(decimal(155n, 15), decimal(1n, 13))
				expect(quote4.lastFundingPaymentTimestamp).to.equal(await time.latest())
				expect(afterBalance3 - beforeBalance3).to.equal(-1n * decimal(5n, 16))
			})
		})

		// describe("2. funding rate accumulation over multiple epochs", () => {
		// 	beforeEach(async () => {
		// 		// Set initial block timestamp to a known value
		// 		await time.setNextBlockTimestamp(2000000000)
		// 		await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [400])
		// 	})

		// 	it("should correctly accumulate and charge funding rates across multiple epochs", async () => {
		// 		const startTime = await time.latest()

		// 		//* Move to t+200: Set initial funding fee
		// 		await time.setNextBlockTimestamp(startTime + 200)
		// 		await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(2n, 16)], [0], [decimal(1n)])

		// 		//* Move to t+300: Update funding fee
		// 		await time.setNextBlockTimestamp(startTime + 300)
		// 		await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(3n, 16)], [0], [decimal(1n)])

		// 		//* Move to t+500: Create and open position
		// 		await time.setNextBlockTimestamp(startTime + 500)
		// 		await user.sendQuote(
		// 			limitQuoteRequestBuilder()
		// 				.quantity(decimal(1n))
		// 				.price(decimal(1n))
		// 				.deadline(startTime + 1000)
		// 				.maxFundingRate(decimal(1n))
		// 				.build(),
		// 		)
		// 		await hedger.lockQuote(5)
		// 		await hedger.openPosition(5, limitOpenRequestBuilder().filledAmount(decimal(1n)).build())

		// 		//* Move to t+700: Update funding fee
		// 		await time.setNextBlockTimestamp(startTime + 700)
		// 		await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(1n, 16)], [0], [decimal(1n)])

		// 		//* Move to t+1000: Update funding fee
		// 		await time.setNextBlockTimestamp(startTime + 1000)
		// 		await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(5n, 16)], [0], [decimal(1n)])

		// 		//* Move to t+1300: Update funding fee
		// 		await time.setNextBlockTimestamp(startTime + 1300)
		// 		await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(2n, 16)], [0], [decimal(1n)])

		// 		//* Move to t+1400: Charge accumulated funding fee
		// 		await time.setNextBlockTimestamp(startTime + 1400)
		// 		const beforeBalance1 = (await user.getBalanceInfo()).allocatedBalances
		// 		await context.fundingRateFacet
		// 			.connect(context.signers.hedger)
		// 			.chargeAccumulatedFundingFee(
		// 				await context.signers.user.getAddress(),
		// 				await context.signers.hedger.getAddress(),
		// 				[5],
		// 				await getDummyPairUpnlSig(),
		// 			)

		// 		//* Move to t+1700: Charge accumulated funding fee
		// 		await time.setNextBlockTimestamp(startTime + 1700)
		// 		await context.fundingRateFacet
		// 			.connect(context.signers.hedger)
		// 			.chargeAccumulatedFundingFee(
		// 				await context.signers.user.getAddress(),
		// 				await context.signers.hedger.getAddress(),
		// 				[5],
		// 				await getDummyPairUpnlSig(),
		// 			)

		// 		//* Move to t+1800: Update funding fee
		// 		await time.setNextBlockTimestamp(startTime + 1800)
		// 		await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(5n, 16)], [0], [decimal(1n)])

		// 		//* Move to t+2100: Final charge of accumulated funding fee
		// 		await time.setNextBlockTimestamp(startTime + 2100)
		// 		const beforeBalance3 = (await user.getBalanceInfo()).allocatedBalances
		// 		await context.fundingRateFacet
		// 			.connect(context.signers.hedger)
		// 			.chargeAccumulatedFundingFee(
		// 				await context.signers.user.getAddress(),
		// 				await context.signers.hedger.getAddress(),
		// 				[5],
		// 				await getDummyPairUpnlSig(),
		// 			)
		// 		const afterBalance3 = (await user.getBalanceInfo()).allocatedBalances

		// 		expect(afterBalance3 - beforeBalance3).to.equal(-1n * decimal(5n, 16))
		// 	})
		// })
	})

	describe("normal and accumulated charge funding rate integration", function () {
		it("should not be able to charge normal when epoch duration set", async () => {
			await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [EightHourInSec])
			await expect(
				hedger.chargeFundingRate(await context.signers.user.getAddress(), [1], [decimal(1n, 16)], await getDummyPairUpnlSig()),
			).to.be.revertedWith("ChargeFundingFacet: Use accumulated funding fee")
		})

		it("should set last charge funding rate timestamp when open position correctly", async () => {
			await user.sendQuote(
				limitQuoteRequestBuilder()
					.quantity(decimal(1n))
					.price(decimal(1n))
					.deadline((await getBlockTimestamp()) + 1000n)
					.maxFundingRate(decimal(1n))
					.build(),
			)

			await hedger.lockQuote(5)
			const latestBlockTime = await getBlockTimestamp()
			await hedger.openPosition(5, limitOpenRequestBuilder().filledAmount(decimal(1n)).build())

			const quote = await context.viewFacet.getQuote(5)
			expect(quote.lastFundingPaymentTimestamp).to.approximately(latestBlockTime, 30)
		})

		it("should be able normal charge funding rate and then set accumulated and charge accumulative", async () => {
			await context.controlFacet.connect(context.signers.admin).setSymbolFundingState(1, 28800, 100)
			await user.sendQuote(
				limitQuoteRequestBuilder()
					.quantity(decimal(1n))
					.price(decimal(1n))
					.deadline((await getBlockTimestamp()) + 1000n)
					.maxFundingRate(decimal(1n))
					.build(),
			)
			await hedger.lockQuote(5)
			await hedger.openPosition(5, limitOpenRequestBuilder().filledAmount(decimal(1n)).build())

			const symbol = await context.viewFacet.getSymbol(1)
			let duration = symbol.fundingRateEpochDuration
			let window = symbol.fundingRateWindowTime
			let currentEpoch = (BigInt(await time.latest()) / duration) * duration
			let targetTime = duration * 2n + window - 1n + currentEpoch

			await time.setNextBlockTimestamp(targetTime)
			await expect(
				context.fundingRateFacet
					.connect(context.signers.hedger)
					.chargeFundingRate(await context.signers.user.getAddress(), [5], [decimal(1n, 16)], await getDummyPairUpnlSig()),
			).to.not.reverted

			await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [EightHourInSec])

			await expect(
				context.fundingRateFacet.connect(context.signers.hedger).chargeFundingRate(await context.signers.user.getAddress(), [5], [decimal(1n, 16)], await getDummyPairUpnlSig()),
			).to.revertedWith("ChargeFundingFacet: Use accumulated funding fee")

			await expect(
				context.fundingRateFacet
					.connect(context.signers.hedger)
					.chargeAccumulatedFundingFee(
						await context.signers.user.getAddress(),
						await context.signers.hedger.getAddress(),
						[5],
						await getDummyPairUpnlSig(),
					),
			).to.not.reverted
		})
	})
}
