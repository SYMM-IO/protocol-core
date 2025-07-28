import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"

import { initializeFixture } from "./Initialize.fixture"
import { Hedger } from "./models/Hedger"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { decimal, unDecimal } from "./utils/Common"
import { getDummyPairUpnlSig } from "./utils/SignatureUtils"
import { expect } from "chai"
import { limitQuoteRequestBuilder } from "./models/requestModels/QuoteRequest"
import { PositionType } from "./models/Enums"

export function shouldBehaveLikeFundingRate(): void {
	let context: RunContext, user: User, user2: User, hedger: Hedger, hedger2: Hedger

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(5000n), decimal(5000n), decimal(5000n))

		user2 = new User(context, context.signers.user2)

		hedger = new Hedger(context, context.signers.hedger)
		await hedger.setBalances(decimal(5000n), decimal(5000n))

		hedger2 = new Hedger(context, context.signers.hedger2)
		await hedger2.setBalances(decimal(5000n), decimal(5000n))

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

	describe("Accumulative Funding Rate Methods", function () {
		describe("chargeAccumulatedFundingFee", function () {
			beforeEach(async function () {
				// Set up funding fees for testing
				await context.controlFacet.connect(context.signers.admin).setSymbolFundingState(1, 3600n, 1000n)
				await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [3600n])
				await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(1n, 16)], [-decimal(1n, 16)], [decimal(1n)])
				await time.increase(3600) // Advance time to accumulate fees
			})

			it("Should fail with invalid quote for partyA", async function () {
				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user2.getAddress(),
							await context.signers.hedger.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.be.revertedWith("ChargeFundingFacet: Invalid quote")
			})

			it("Should fail with invalid quote for partyB", async function () {
				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger2)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger2.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.be.revertedWith("ChargeFundingFacet: Sender isn't partyB of quote")
			})

			it("Should fail with invalid quote state", async function () {
				await expect(
					context.fundingRateFacet.connect(context.signers.hedger).chargeAccumulatedFundingFee(
						await context.signers.user.getAddress(),
						await context.signers.hedger.getAddress(),
						[3], // Quote 3 is closed
						await getDummyPairUpnlSig(),
					),
				).to.be.revertedWith("ChargeFundingFacet: Invalid state")
			})

			it("Should successfully charge accumulated funding fee for single quote", async function () {
				const userBalanceBefore = await context.viewFacet.allocatedBalanceOfPartyA(await context.signers.user.getAddress())
				const hedgerBalanceBefore = await context.viewFacet.allocatedBalanceOfPartyB(
					await context.signers.hedger.getAddress(),
					await context.signers.user.getAddress(),
				)

				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.not.be.reverted

				// Verify balances changed (exact amounts depend on accumulated fees)
				const userBalanceAfter = await context.viewFacet.allocatedBalanceOfPartyA(await context.signers.user.getAddress())
				const hedgerBalanceAfter = await context.viewFacet.allocatedBalanceOfPartyB(
					await context.signers.hedger.getAddress(),
					await context.signers.user.getAddress(),
				)

				// Balance changes should be opposite for user and hedger
				const userChange = userBalanceAfter - userBalanceBefore
				const hedgerChange = hedgerBalanceAfter - hedgerBalanceBefore
				expect(userChange).to.equal(-hedgerChange)
			})

			it("Should successfully charge accumulated funding fee for multiple quotes", async function () {
				const userBalanceBefore = await context.viewFacet.allocatedBalanceOfPartyA(await context.signers.user.getAddress())
				const hedgerBalanceBefore = await context.viewFacet.allocatedBalanceOfPartyB(
					await context.signers.hedger.getAddress(),
					await context.signers.user.getAddress(),
				)

				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[1, 2],
							await getDummyPairUpnlSig(),
						),
				).to.not.be.reverted

				// Verify balances changed
				const userBalanceAfter = await context.viewFacet.allocatedBalanceOfPartyA(await context.signers.user.getAddress())
				const hedgerBalanceAfter = await context.viewFacet.allocatedBalanceOfPartyB(
					await context.signers.hedger.getAddress(),
					await context.signers.user.getAddress(),
				)

				// Balance changes should be opposite for user and hedger
				const userChange = userBalanceAfter - userBalanceBefore
				const hedgerChange = hedgerBalanceAfter - hedgerBalanceBefore
				expect(userChange).to.equal(-hedgerChange)
			})

			it("Should handle zero accumulated fees correctly", async function () {
				// Create a new position with no time passed
				await user.sendQuote(limitQuoteRequestBuilder().deadline("10000000000000").build())
				await hedger.lockQuote(4)
				await hedger.openPosition(4)

				const userBalanceBefore = await context.viewFacet.allocatedBalanceOfPartyA(await context.signers.user.getAddress())
				const hedgerBalanceBefore = await context.viewFacet.allocatedBalanceOfPartyB(
					await context.signers.hedger.getAddress(),
					await context.signers.user.getAddress(),
				)

				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[4],
							await getDummyPairUpnlSig(),
						),
				).to.not.be.reverted

				const userBalanceAfter = await context.viewFacet.allocatedBalanceOfPartyA(await context.signers.user.getAddress())
				const hedgerBalanceAfter = await context.viewFacet.allocatedBalanceOfPartyB(
					await context.signers.hedger.getAddress(),
					await context.signers.user.getAddress(),
				)

				expect(userBalanceAfter).to.equal(userBalanceBefore)
				expect(hedgerBalanceAfter).to.equal(hedgerBalanceBefore)
			})
		})

		describe("setLongFundingFee", function () {
			beforeEach(async function () {
				await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [3600n])
				await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(1n, 16)], [-decimal(1n, 16)], [decimal(100n)])
			})

			it("Should fail with invalid array lengths", async function () {
				await expect(context.fundingRateFacet.connect(context.signers.hedger).setLongFundingFee([1], [], [decimal(100n)])).to.be.revertedWith(
					"ChargeFundingFacet: Invalid length",
				)
			})

			it("Should successfully set long funding fee", async function () {
				const longFee = decimal(3n, 16)
				const marketPrice = decimal(150n)

				await expect(context.fundingRateFacet.connect(context.signers.hedger).setLongFundingFee([1], [longFee], [marketPrice])).to.not.be.reverted
			})
		})

		describe("setShortFundingFee", function () {
			beforeEach(async function () {
				await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [3600n])
				await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(1n, 16)], [-decimal(1n, 16)], [decimal(100n)])
			})

			it("Should fail with invalid array lengths", async function () {
				await expect(context.fundingRateFacet.connect(context.signers.hedger).setShortFundingFee([1], [], [decimal(100n)])).to.be.revertedWith(
					"ChargeFundingFacet: Invalid length",
				)
			})

			it("Should successfully set short funding fee", async function () {
				const shortFee = decimal(4n, 16)
				const marketPrice = decimal(150n)

				await expect(context.fundingRateFacet.connect(context.signers.hedger).setShortFundingFee([1], [shortFee], [marketPrice])).to.not.be.reverted
			})
		})

		describe("Access Control", function () {
			it("Should fail when non-partyB calls setFundingFee", async function () {
				await expect(
					context.fundingRateFacet.connect(context.signers.user).setFundingFee([1], [decimal(1n, 16)], [decimal(1n, 16)], [decimal(100n)]),
				).to.be.revertedWith("Accessibility: Should be partyB")
			})

			it("Should fail when non-partyB calls setLongFundingFee", async function () {
				await expect(
					context.fundingRateFacet.connect(context.signers.user).setLongFundingFee([1], [decimal(1n, 16)], [decimal(100n)]),
				).to.be.revertedWith("Accessibility: Should be partyB")
			})

			it("Should fail when non-partyB calls setShortFundingFee", async function () {
				await expect(
					context.fundingRateFacet.connect(context.signers.user).setShortFundingFee([1], [decimal(1n, 16)], [decimal(100n)]),
				).to.be.revertedWith("Accessibility: Should be partyB")
			})

			it("Should fail when non-partyB calls setEpochDurations", async function () {
				await expect(context.fundingRateFacet.connect(context.signers.user).setEpochDurations([1], [3600n])).to.be.revertedWith(
					"Accessibility: Should be partyB",
				)
			})

			it("Should fail when partyB actions are paused", async function () {
				await context.controlFacet.connect(context.signers.admin).pausePartyBActions()

				await expect(
					context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [decimal(1n, 16)], [decimal(1n, 16)], [decimal(100n)]),
				).to.be.revertedWith("Pausable: PartyB actions paused")
			})

			it("Should fail chargeAccumulatedFundingFee when partyA actions are paused", async function () {
				await context.controlFacet.connect(context.signers.admin).pausePartyAActions()

				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.be.revertedWith("Pausable: PartyA actions paused")
			})

			it("Should fail chargeAccumulatedFundingFee when partyB actions are paused", async function () {
				await context.controlFacet.connect(context.signers.admin).pausePartyBActions()

				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.be.revertedWith("Pausable: PartyB actions paused")
			})
		})

		describe("Mathematical Accuracy", function () {
			it("Should handle zero rates correctly", async function () {
				await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [3600n])
				await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [0], [0], [decimal(100n)])
				await time.increase(3600)

				const userBalanceBefore = await context.viewFacet.allocatedBalanceOfPartyA(await context.signers.user.getAddress())

				await context.fundingRateFacet
					.connect(context.signers.hedger)
					.chargeAccumulatedFundingFee(
						await context.signers.user.getAddress(),
						await context.signers.hedger.getAddress(),
						[1],
						await getDummyPairUpnlSig(),
					)

				const userBalanceAfter = await context.viewFacet.allocatedBalanceOfPartyA(await context.signers.user.getAddress())
				expect(userBalanceAfter).to.equal(userBalanceBefore)
			})

			it("Should handle negative rates correctly", async function () {
				const negativeLongFee = decimal(-1n, 17)
				const negativeShortFee = decimal(-1n, 17)
				await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [3600n])
				await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [negativeLongFee], [negativeShortFee], [decimal(100n)])
				await time.increase(3600)

				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.not.be.reverted
			})

			it("Should handle precision correctly in calculations", async function () {
				await context.fundingRateFacet.connect(context.signers.hedger).setEpochDurations([1], [3600n])

				// Use small precise values to test precision handling
				const smallLongFee = decimal(1n, 20) // 0.0001%
				const smallShortFee = decimal(5n, 21) // 0.00005%
				const precisePrice = decimal(123456789n, 10) // $12.3456789

				await context.fundingRateFacet.connect(context.signers.hedger).setFundingFee([1], [smallLongFee], [smallShortFee], [precisePrice])
				await time.increase(3600)

				await expect(
					context.fundingRateFacet
						.connect(context.signers.hedger)
						.chargeAccumulatedFundingFee(
							await context.signers.user.getAddress(),
							await context.signers.hedger.getAddress(),
							[1],
							await getDummyPairUpnlSig(),
						),
				).to.not.be.reverted
			})
		})
	})
}
