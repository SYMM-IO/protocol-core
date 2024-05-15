import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"

import { initializeFixture } from "./Initialize.fixture"
import { OrderType, PositionType, QuoteStatus } from "./models/Enums"
import { BalanceInfo, Hedger } from "./models/Hedger"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { limitCloseRequestBuilder, marketCloseRequestBuilder } from "./models/requestModels/CloseRequest"
import { limitQuoteRequestBuilder } from "./models/requestModels/QuoteRequest"
import {
	decimal,
	getBlockTimestamp,
	getQuoteQuantity,
	getTotalLockedValuesForQuoteIds,
	getTradingFeeForQuotes,
	pausePartyA,
	pausePartyB,
	unDecimal,
} from "./utils/Common"
import { getDummyHighLowPriceSig, getDummyPriceSig } from "./utils/SignatureUtils"
import { CloseRequestValidator } from "./models/validators/CloseRequestValidator"
import { BigNumber } from "ethers"
import { limitFillCloseRequestBuilder, marketFillCloseRequestBuilder } from "./models/requestModels/FillCloseRequest"
import { FillCloseRequestValidator } from "./models/validators/FillCloseRequestValidator"
import { CancelCloseRequestValidator } from "./models/validators/CancelCloseRequestValidator"
import { AcceptCancelCloseRequestValidator } from "./models/validators/AcceptCancelCloseRequestValidator"
import { emergencyCloseRequestBuilder } from "./models/requestModels/EmergencyCloseRequest"
import { EmergencyCloseRequestValidator } from "./models/validators/EmergencyCloseRequestValidator"
import { ForceClosePositionValidator } from "./models/validators/ForceClosePositionValidator"
import { calculateExpectedAvgPriceForForceClose, calculateExpectedClosePriceForForceClose } from "./utils/PriceUtils"
import { QuoteStructOutput } from "../src/types/contracts/interfaces/ISymmio"

export function shouldBehaveLikeClosePosition(): void {
	let user: User, hedger: Hedger, hedger2: Hedger
	let context: RunContext
	let quote1LongOpened: QuoteStructOutput, quote2ShortOpened: QuoteStructOutput, quote3JustSent: QuoteStructOutput, quote4LongOpened: QuoteStructOutput

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		this.user_allocated = decimal(500)
		this.hedger_allocated = decimal(4000)

		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(2000), decimal(1000), this.user_allocated)

		hedger = new Hedger(context, context.signers.hedger)
		await hedger.setup()
		await hedger.setBalances(this.hedger_allocated, this.hedger_allocated)

		hedger2 = new Hedger(context, context.signers.hedger2)
		await hedger2.setup()
		await hedger2.setBalances(this.hedger_allocated, this.hedger_allocated)

		// Quote1 LONG opened
		quote1LongOpened = await context.viewFacet.getQuote(await user.sendQuote())
		await hedger.lockQuote(quote1LongOpened.id)
		await hedger.openPosition(quote1LongOpened.id)

		// Quote2 SHORT opened
		quote2ShortOpened = await context.viewFacet.getQuote(await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build()))
		await hedger.lockQuote(quote2ShortOpened.id)
		await hedger.openPosition(quote2ShortOpened.id)

		// Quote3 SHORT sent
		quote3JustSent = await context.viewFacet.getQuote(await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build()))

		// Quote4 LONG sent
		quote4LongOpened = await context.viewFacet.getQuote(await user.sendQuote())
		await hedger.lockQuote(quote4LongOpened.id)
		await hedger.openPosition(quote4LongOpened.id)
	})

	it("Should fail on invalid partyA", async function () {
		await expect(
			context.partyAFacet.requestToClosePosition(
				2, //quoteId
				decimal(1), //closePrice
				decimal(1), //quantityToClose
				OrderType.LIMIT,
				getBlockTimestamp(100),
			),
		).to.be.revertedWith("Accessibility: Should be partyA of quote")
	})

	it("Should fail on paused partyA", async function () {
		await pausePartyA(context)
		await expect(user.requestToClosePosition(2)).to.be.revertedWith("Pausable: PartyA actions paused")
	})

	it("Should fail on invalid quoteId", async function () {
		await expect(user.requestToClosePosition(50)).to.be.reverted
	})

	it("Should fail on invalid quote state", async function () {
		await expect(user.requestToClosePosition(3)).to.be.revertedWith("PartyAFacet: Invalid state")
	})

	it("Should fail on invalid quantityToClose", async function () {
		const quantity = await getQuoteQuantity(context, 1)
		await expect(
			user.requestToClosePosition(
				1,
				limitCloseRequestBuilder()
					.quantityToClose(quantity.add(decimal(1)))
					.build(),
			),
		).to.be.revertedWith("PartyAFacet: Invalid quantityToClose")
		await expect(
			user.requestToClosePosition(
				1,
				limitCloseRequestBuilder()
					.quantityToClose(quantity.sub(decimal(1)))
					.build(),
			),
		).to.be.revertedWith("PartyAFacet: Remaining quote value is low")
	})

	it("Should request limit successfully", async function () {
		const validator = new CloseRequestValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			hedger: hedger,
			quoteId: BigNumber.from(1),
		})
		const closePrice = decimal(1, 17)
		const quantityToClose = await getQuoteQuantity(context, 1)
		await user.requestToClosePosition(1, limitCloseRequestBuilder().quantityToClose(quantityToClose).closePrice(closePrice).build())
		await validator.after(context, {
			user: user,
			hedger: hedger,
			quoteId: BigNumber.from(1),
			closePrice: closePrice,
			quantityToClose: quantityToClose,
			beforeOutput: beforeOut,
		})
	})

	it("Should request limit successfully partially", async function () {
		const quantity = await getQuoteQuantity(context, 1)
		const validator = new CloseRequestValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			hedger: hedger,
			quoteId: BigNumber.from(1),
		})
		const closePrice = decimal(1, 17)
		const quantityToClose = quantity.div(2)
		await user.requestToClosePosition(1, limitCloseRequestBuilder().quantityToClose(quantityToClose).closePrice(closePrice).build())
		await validator.after(context, {
			user: user,
			hedger: hedger,
			quoteId: BigNumber.from(1),
			closePrice: closePrice,
			quantityToClose: quantityToClose,
			beforeOutput: beforeOut,
		})
	})

	it("Should request market successfully", async function () {
		const validator = new CloseRequestValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			hedger: hedger,
			quoteId: BigNumber.from(1),
		})
		const closePrice = decimal(1, 17)
		const quantityToClose = await getQuoteQuantity(context, 1)
		await user.requestToClosePosition(1, marketCloseRequestBuilder().quantityToClose(quantityToClose).closePrice(closePrice).build())
		await validator.after(context, {
			user: user,
			hedger: hedger,
			quoteId: BigNumber.from(1),
			closePrice: closePrice,
			quantityToClose: quantityToClose,
			beforeOutput: beforeOut,
		})
	})

	it("Should request market successfully partially", async function () {
		const quantity = await getQuoteQuantity(context, 1)
		const validator = new CloseRequestValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			hedger: hedger,
			quoteId: BigNumber.from(1),
		})
		const closePrice = decimal(1, 17)
		const quantityToClose = quantity.div(2)
		await user.requestToClosePosition(1, marketCloseRequestBuilder().quantityToClose(quantityToClose).closePrice(closePrice).build())
		await validator.after(context, {
			user: user,
			hedger: hedger,
			quoteId: BigNumber.from(1),
			closePrice: closePrice,
			quantityToClose: quantityToClose,
			beforeOutput: beforeOut,
		})
	})

	it("Should expire close request", async function () {
		await user.requestToClosePosition(
			1,
			limitCloseRequestBuilder()
				.quantityToClose(await getQuoteQuantity(context, 1))
				.closePrice(decimal(1, 17))
				.build(),
		)
		await time.increase(1000)
		await context.partyAFacet.expireQuote([1])
		let q = await context.viewFacet.getQuote(1)
		expect(q.quoteStatus).to.be.equal(QuoteStatus.OPENED)
	})

	describe("Fill Close Request", async function () {
		beforeEach(async function () {
			await user.requestToClosePosition(
				1,
				limitCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 1))
					.closePrice(decimal(1))
					.build(),
			)
			await user.requestToClosePosition(
				2,
				limitCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 2))
					.closePrice(decimal(1))
					.build(),
			)
			await user.requestToClosePosition(
				4,
				marketCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 4))
					.closePrice(decimal(1))
					.build(),
			)
		})

		it("Should fail on invalid partyB", async function () {
			await expect(
				hedger2.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(decimal(1))
						.build(),
				),
			).to.be.revertedWith("Accessibility: Should be partyB of quote")
		})

		it("Should fail on paused partyB", async function () {
			await pausePartyB(context)
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(decimal(1))
						.build(),
				),
			).to.be.revertedWith("Pausable: PartyB actions paused")
		})

		it("Should fail on fill amount", async function () {
			const quantity = await getQuoteQuantity(context, 1)
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(quantity.add(decimal(1)))
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Invalid filledAmount")
			await expect(
				hedger.fillCloseRequest(
					4,
					limitFillCloseRequestBuilder()
						.filledAmount(quantity.sub(decimal(1)))
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Invalid filledAmount")
		})

		it("Should fail on invalid close price", async function () {
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(decimal(1, 17))
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Closed price isn't valid")

			await expect(
				hedger.fillCloseRequest(
					2,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 2))
						.closedPrice(decimal(2))
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Closed price isn't valid")
		})

		it("Should fail on negative balance of partyA/partyB", async function () {
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(decimal(1))
						.upnlPartyA(decimal(-575))
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(decimal(1))
						.upnlPartyB(decimal(-410))
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
		})

		it("Should fail on partyB becoming liquidatable", async function () {
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(decimal(1))
						.upnlPartyB(decimal(-300))
						.price(decimal(1, 17))
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
			await expect(
				hedger.fillCloseRequest(
					2,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 2))
						.closedPrice(decimal(1, 17))
						.upnlPartyB(decimal(-300))
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
		})

		it("Should fail on partyA becoming liquidatable", async function () {
			let quantity = await getQuoteQuantity(context, 1)
			let price = decimal(11, 17)
			let closePrice = decimal(1)
			let userAvailable = this.user_allocated
				.sub(await getTotalLockedValuesForQuoteIds(context, [2, 4], false))
				.sub(await getTradingFeeForQuotes(context, [1, 2, 3, 4]))
				.sub(unDecimal(quantity.mul(price.sub(closePrice))))

			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(quantity)
						.closedPrice(closePrice)
						.upnlPartyA(userAvailable.add(decimal(1)).mul(-1))
						.price(price)
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")

			quantity = await getQuoteQuantity(context, 1)
			price = decimal(1, 17)
			closePrice = decimal(1)
			userAvailable = this.user_allocated
				.sub(await getTotalLockedValuesForQuoteIds(context, [1, 4], false))
				.sub(await getTradingFeeForQuotes(context, [1, 2, 3, 4]))
				.sub(unDecimal(quantity.mul(closePrice.sub(price))))

			await expect(
				hedger.fillCloseRequest(
					2,
					limitFillCloseRequestBuilder()
						.filledAmount(quantity)
						.closedPrice(closePrice)
						.upnlPartyA(userAvailable.add(decimal(1)).mul(-1))
						.price(price)
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
		})

		it("Should fail due to expired request", async function () {
			await time.increase(1000)
			let closePrice = decimal(11, 17)
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(closePrice)
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Quote is expired")
		})

		it("Should run successfully for limit", async function () {
			const validator = new FillCloseRequestValidator()
			const beforeOut = await validator.before(context, {
				user: user,
				hedger: hedger,
				quoteId: BigNumber.from(1),
			})
			let closePrice = decimal(11, 17)
			const filledAmount = await getQuoteQuantity(context, 1)
			await hedger.fillCloseRequest(1, limitFillCloseRequestBuilder().filledAmount(filledAmount).closedPrice(closePrice).build())
			await validator.after(context, {
				user: user,
				hedger: hedger,
				quoteId: BigNumber.from(1),
				closePrice: closePrice,
				fillAmount: filledAmount,
				beforeOutput: beforeOut,
			})
		})

		it("Should run successfully partially for limit", async function () {
			const closePrice = decimal(11, 17)
			const quantity = await getQuoteQuantity(context, 1)
			const filledAmount = quantity.div(2)
			const validator = new FillCloseRequestValidator()
			const beforeOut = await validator.before(context, {
				user: user,
				hedger: hedger,
				quoteId: BigNumber.from(1),
			})
			await hedger.fillCloseRequest(1, limitFillCloseRequestBuilder().filledAmount(filledAmount).closedPrice(closePrice).build())
			await validator.after(context, {
				user: user,
				hedger: hedger,
				quoteId: BigNumber.from(1),
				closePrice: closePrice,
				fillAmount: filledAmount,
				beforeOutput: beforeOut,
			})
		})

		it("Should run successfully for market", async function () {
			let closePrice = decimal(11, 17)
			const validator = new FillCloseRequestValidator()
			const beforeOut = await validator.before(context, {
				user: user,
				hedger: hedger,
				quoteId: BigNumber.from(4),
			})
			const filledAmount = await getQuoteQuantity(context, 4)
			await hedger.fillCloseRequest(4, marketFillCloseRequestBuilder().filledAmount(filledAmount).closedPrice(closePrice).build())
			await validator.after(context, {
				user: user,
				hedger: hedger,
				quoteId: BigNumber.from(4),
				closePrice: closePrice,
				fillAmount: filledAmount,
				beforeOutput: beforeOut,
			})
		})
	})

	describe("Cancel Close Request", async function () {
		beforeEach(async function () {
			await user.requestToClosePosition(
				1,
				limitCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 4))
					.build(),
			)
		})

		it("Should fail on invalid quoteId", async function () {
			await expect(user.requestToCancelCloseRequest(3)).to.be.reverted
		})

		it("Should fail on invalid partyA", async function () {
			await expect(context.partyAFacet.connect(context.signers.user2).requestToCancelCloseRequest(1)).to.be.revertedWith(
				"Accessibility: Should be partyA of quote",
			)
		})

		it("Should fail on paused partyA", async function () {
			await pausePartyA(context)
			await expect(user.requestToCancelCloseRequest(1)).to.be.revertedWith("Pausable: PartyA actions paused")
		})

		it("Should fail on invalid state", async function () {
			await expect(user.requestToCancelCloseRequest(2)).to.be.revertedWith("PartyAFacet: Invalid state")
		})

		it("Should send cancel request successfully", async function () {
			const validator = new CancelCloseRequestValidator()
			const beforeOut = await validator.before(context, {
				user: user,
				hedger: hedger,
				quoteId: BigNumber.from(1),
			})
			await user.requestToCancelCloseRequest(1)
			await validator.after(context, {
				user: user,
				hedger: hedger,
				quoteId: BigNumber.from(1),
				beforeOutput: beforeOut,
			})
		})

		it("Should expire request", async function () {
			await time.increase(1000)
			await user.requestToCancelCloseRequest(1)
			expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(QuoteStatus.OPENED)
		})

		describe("Accepting cancel request", async function () {
			this.beforeEach(async function () {
				await user.requestToCancelCloseRequest(1)
			})

			it("Should fail on invalid quoteId", async function () {
				await expect(hedger.acceptCancelCloseRequest(3)).to.be.reverted
			})

			it("Should fail on invalid partyB", async function () {
				await expect(hedger2.acceptCancelCloseRequest(1)).to.be.revertedWith("Accessibility: Should be partyB of quote")
			})

			it("Should fail on paused partyB", async function () {
				await pausePartyB(context)
				await expect(hedger.acceptCancelCloseRequest(1)).to.be.revertedWith("Pausable: PartyB actions paused")
			})

			it("Should fail on invalid state", async function () {
				await expect(hedger.acceptCancelCloseRequest(2)).to.be.revertedWith("PartyBFacet: Invalid state")
			})

			it("Should run successfully", async function () {
				const validator = new AcceptCancelCloseRequestValidator()
				const beforeOut = await validator.before(context, {
					user: user,
					hedger: hedger,
					quoteId: BigNumber.from(1),
				})
				await hedger.acceptCancelCloseRequest(1)
				await validator.after(context, {
					user: user,
					hedger: hedger,
					quoteId: BigNumber.from(1),
					beforeOutput: beforeOut,
				})
			})
		})
	})

	describe("Emergency Close", async function () {
		beforeEach(async function () { })

		it("Should fail when not emergency mode", async function () {
			await expect(hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().build()))
				.to.be.revertedWith("PartyBFacet: Operation not allowed. Either emergency mode must be active, party B must be in emergency status, or the symbol must be delisted")
		})

		describe("Emergency status for partyB activated", async function () {
			beforeEach(async function () {
				await context.controlFacet.setPartyBEmergencyStatus([await hedger2.getAddress()], true)
				await context.controlFacet.setPartyBEmergencyStatus([await hedger.getAddress()], true)
			})

			it("Should fail on invalid partyB", async function () {
				await expect(hedger2.emergencyClosePosition(1, emergencyCloseRequestBuilder().build())).to.be.revertedWith(
					"Accessibility: Should be partyB of quote",
				)
			})

			it("Should fail on paused partyB", async function () {
				await pausePartyB(context)
				await expect(hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().build())).to.be.revertedWith("Pausable: PartyB actions paused")
			})

			it("Should fail on negative balance of partyA/partyB", async function () {
				await expect(hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().upnlPartyA(decimal(-575)).build())).to.be.revertedWith(
					"LibSolvency: Available balance is lower than zero",
				)
				await expect(hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().upnlPartyB(decimal(-410)).build())).to.be.revertedWith(
					"LibSolvency: Available balance is lower than zero",
				)
			})

			it("Should run successfully", async function () {
				const validator = new EmergencyCloseRequestValidator()
				const beforeOut = await validator.before(context, {
					user: user,
					hedger: hedger,
					quoteId: BigNumber.from(1),
				})
				await hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().build())
				await validator.after(context, {
					user: user,
					hedger: hedger,
					quoteId: BigNumber.from(1),
					price: decimal(1),
					beforeOutput: beforeOut,
				})
			})
		})


		describe("Emergency mode get activated", async function () {
			beforeEach(async function () {
				await context.controlFacet.activeEmergencyMode()
			})

			it("Should run successfully", async function () {
				const validator = new EmergencyCloseRequestValidator()
				const beforeOut = await validator.before(context, {
					user: user,
					hedger: hedger,
					quoteId: BigNumber.from(1),
				})
				await hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().build())
				await validator.after(context, {
					user: user,
					hedger: hedger,
					quoteId: BigNumber.from(1),
					price: decimal(1),
					beforeOutput: beforeOut,
				})
			})
		})

		describe("Symbol gets deListed", async function () {

			beforeEach(async function () {
				await context.controlFacet.setSymbolValidationState((await context.viewFacet.getQuote(1)).symbolId, false)
			})

			it("Should run successfully", async function () {
				const validator = new EmergencyCloseRequestValidator()
				const beforeOut = await validator.before(context, {
					user: user,
					hedger: hedger,
					quoteId: BigNumber.from(1),
				})
				await hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().build())
				await validator.after(context, {
					user: user,
					hedger: hedger,
					quoteId: BigNumber.from(1),
					price: decimal(1),
					beforeOutput: beforeOut,
				})
			})
		})
	})

	describe("Force Close Request", async function () {
		beforeEach(async function () {
			await user.requestToClosePosition(
				1,
				limitCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 1))
					.closePrice(decimal(1))
					.deadline((await getBlockTimestamp()) + 1000)
					.build(),
			)
			await user.requestToClosePosition(
				2,
				limitCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 2))
					.closePrice(decimal(1))
					.deadline((await getBlockTimestamp()) + 1000)
					.build(),
			)
			await user.requestToClosePosition(
				4,
				marketCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 4))
					.closePrice(decimal(1))
					.deadline((await getBlockTimestamp()) + 1000)
					.build(),
			)

			await context.controlFacet.setForceCloseMinSigPeriod(10)
			await context.controlFacet.setForceCloseGapRatio((await context.viewFacet.getQuote(1)).symbolId, decimal(1, 17))

			quote1LongOpened = await context.viewFacet.getQuote(quote1LongOpened.id)
			quote2ShortOpened = await context.viewFacet.getQuote(quote2ShortOpened.id)
			quote3JustSent = await context.viewFacet.getQuote(quote3JustSent.id)
			quote4LongOpened = await context.viewFacet.getQuote(quote4LongOpened.id)
		})

		async function prepareSigTimes(period: number = 10) {
			const now = await getBlockTimestamp()
			const cooldowns = await context.viewFacet.forceCloseCooldowns()
			const firstCooldown = cooldowns[0]
			const secondCooldown = cooldowns[1]
			const startTime = firstCooldown.add(now)
			const endTime = firstCooldown.add(now).add(period)
			await time.increase(firstCooldown.add(period).add(secondCooldown).add(1))
			return [startTime, endTime]
		}

		it("Should fail on invalid quote status", async function () {
			await expect(user.forceClosePosition(3, await getDummyHighLowPriceSig())).to.be.revertedWith("PartyAFacet: Invalid state")
		})

		it("Should fail on invalid order type", async function () {
			await expect(user.forceClosePosition(4, await getDummyHighLowPriceSig())).to.be.revertedWith("PartyBFacet: Quote's order type should be LIMIT")
		})

		it("Should fail on expired quote", async function () {
			const sigTimes = await prepareSigTimes()
			const dummySig = await getDummyHighLowPriceSig(sigTimes[0], sigTimes[1].add(800))
			await expect(user.forceClosePosition(1, dummySig)).to.be.revertedWith("PartyBFacet: Close request is expired")
		})

		it("Should fail when cooldowns not reached", async function () {
			const sigTimes = await prepareSigTimes()

			let dummySig = await getDummyHighLowPriceSig(sigTimes[0].sub(50), sigTimes[1])
			await expect(user.forceClosePosition(1, dummySig)).to.be.revertedWith("PartyAFacet: Cooldown not reached")

			dummySig = await getDummyHighLowPriceSig(sigTimes[0], sigTimes[1].add(200))
			await expect(user.forceClosePosition(1, dummySig)).to.be.revertedWith("PartyAFacet: Cooldown not reached")
		})

		it("Should fail on invalid averagePrice", async function () {
			const sigTimes = await prepareSigTimes()
			await expect(user.forceClosePosition(2, await getDummyHighLowPriceSig(sigTimes[0], sigTimes[1], 100, 200, 210, 220))).to.be.revertedWith(
				"PartyAFacet: Invalid average price",
			)

			await expect(user.forceClosePosition(2, await getDummyHighLowPriceSig(sigTimes[0], sigTimes[1], 100, 200, 210, 80))).to.be.revertedWith(
				"PartyAFacet: Invalid average price",
			)
		})

		it("Should fail when price not reached to requested close price", async function () {
			const sigTimes = await prepareSigTimes()
			const gapRatio1 = await context.viewFacet.forceCloseGapRatio(quote1LongOpened.symbolId)
			let dummySig = await getDummyHighLowPriceSig(
				sigTimes[0], // startTime
				sigTimes[1], // endTime
				decimal(0),  // lowest
				quote1LongOpened.requestedClosePrice.add(unDecimal(quote1LongOpened.requestedClosePrice.mul(gapRatio1))).sub(decimal(1)),  // highest
				decimal(0),  // currentPrice
				decimal(0),  // averagePrice
				0,           // symbolId
				0,           // upnlPartyB
				0            // upnlPartyA
			);
			await expect(user.forceClosePosition(quote1LongOpened.id, dummySig)).to.be.revertedWith("PartyAFacet: Requested close price not reached");

			const gapRatio2 = await context.viewFacet.forceCloseGapRatio(quote2ShortOpened.symbolId)
			dummySig = await getDummyHighLowPriceSig(
				sigTimes[0], // startTime
				sigTimes[1], // endTime
				quote2ShortOpened.requestedClosePrice.add(unDecimal(quote2ShortOpened.requestedClosePrice.mul(gapRatio2))).add(decimal(1)),  // lowest
				decimal(10), // highest
				decimal(7),  // currentPrice
				decimal(8),  // averagePrice
				0,           // symbolId
				0,           // upnlPartyB
				0            // upnlPartyA
			);
			await expect(user.forceClosePosition(quote2ShortOpened.id, dummySig)).to.be.revertedWith("PartyAFacet: Requested close price not reached");
		})

		it("Should fail when the sig time is lower than forceCloseMinSigPeriod", async function () {
			const sigTimes = await prepareSigTimes(5)
			const gapRatio2 = await context.viewFacet.forceCloseGapRatio(quote2ShortOpened.symbolId)
			const dummySig = await getDummyHighLowPriceSig(
				sigTimes[0], // startTime
				sigTimes[1], // endTime
				quote2ShortOpened.requestedClosePrice.add(unDecimal(quote2ShortOpened.requestedClosePrice.mul(gapRatio2))).sub(decimal(1)),  // lowest
				decimal(1), // highest
				decimal(1),  // currentPrice
				decimal(1),  // averagePrice
				0,           // symbolId
				0,           // upnlPartyB
				0            // upnlPartyA
			);
			await expect(user.forceClosePosition(quote2ShortOpened.id, dummySig)).to.be.revertedWith("PartyAFacet: Invalid signature period")
		})

		it("Should fail when partyA will be insolvent", async function () {
			const sigTimes = await prepareSigTimes()
			const quantity = decimal(100)

			let userAvailable = this.user_allocated
				.sub(await getTotalLockedValuesForQuoteIds(context, [1, 4], false))
				.sub(await getTradingFeeForQuotes(context, [1, 2, 3, 4]))
				.sub(unDecimal(quantity.mul(decimal(1).sub(decimal(1)))))
				.add(decimal(1))
				.mul(-1)

			const gapRatio2 = await context.viewFacet.forceCloseGapRatio(quote2ShortOpened.symbolId)
			const dummySig = await getDummyHighLowPriceSig(
				sigTimes[0],  // startTime
				sigTimes[1],  // endTime
				quote2ShortOpened.requestedClosePrice.add(unDecimal(quote2ShortOpened.requestedClosePrice.mul(gapRatio2))).sub(decimal(1)),  // lowest
				decimal(1),  // highest
				decimal(1),   // currentPrice
				decimal(1),   // averagePrice
				0,            // symbolId
				0,            // upnlPartyB
				userAvailable // upnlPartyA
			);

			await expect(user.forceClosePosition(quote2ShortOpened.id, dummySig)).to.be.revertedWith("PartyAFacet: PartyA will be insolvent")
		})

		it("Should liquidate partyB when partyB will be insolvent", async function () {
			const sigTimes = await prepareSigTimes()
			const userAddress = await context.signers.user.getAddress()
			const hedgerAddress = await context.signers.hedger.getAddress()

			const gapRatio2 = await context.viewFacet.forceCloseGapRatio(quote2ShortOpened.symbolId)
			const dummySig = await getDummyHighLowPriceSig(
				sigTimes[0],  // startTime
				sigTimes[1],  // endTime
				quote2ShortOpened.requestedClosePrice.add(unDecimal(quote2ShortOpened.requestedClosePrice.mul(gapRatio2))).sub(decimal(1)),  // lowest
				decimal(10),  // highest
				decimal(7),   // currentPrice
				decimal(8),   // averagePrice
				0,            // symbolId
				0,            // upnlPartyB
				decimal(-500) // upnlPartyA
			);
			await user.forceClosePosition(quote2ShortOpened.id, dummySig)

			let balanceInfo: BalanceInfo = await hedger.getBalanceInfo(userAddress)
			expect(balanceInfo.allocatedBalances).to.be.equal(0)

			let sig = await getDummyPriceSig([4, 2, 1], [0, 0, 0])

			await context.liquidationFacet.connect(context.signers.liquidator).liquidatePositionsPartyB(hedgerAddress, userAddress, sig)

			expect((await context.viewFacet.getQuote(3)).quoteStatus).to.be.equal(QuoteStatus.PENDING)
			expect((await context.viewFacet.getQuote(4)).quoteStatus).to.be.equal(QuoteStatus.LIQUIDATED)
			expect((await context.viewFacet.getQuote(2)).quoteStatus).to.be.equal(QuoteStatus.LIQUIDATED)
			expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(QuoteStatus.LIQUIDATED)
		})

		it("Should forceClose Quote correctly", async function () {
			const validator = new ForceClosePositionValidator()
			const beforeOut = await validator.before(context, {
				user: user,
				hedger: hedger,
				quoteId: BigNumber.from(quote2ShortOpened.id),
			})
			const sigTimes = await prepareSigTimes(100)
			const gapRatio2 = await context.viewFacet.forceCloseGapRatio(quote2ShortOpened.symbolId)
			const dummySig = await getDummyHighLowPriceSig(
				sigTimes[0],  // startTime
				sigTimes[1],  // endTime
				quote2ShortOpened.requestedClosePrice.add(unDecimal(quote2ShortOpened.requestedClosePrice.mul(gapRatio2))).sub(decimal(1)),  // lowest
				decimal(3),  // highest
				decimal(2),   // currentPrice
				decimal(2),   // averagePrice
				quote2ShortOpened.symbolId, // symbolId
				0,            // upnlPartyB
				0 // upnlPartyA
			);

			await user.forceClosePosition(quote2ShortOpened.id, dummySig)
			await validator.after(context, {
				user: user,
				hedger: hedger,
				quoteId: BigNumber.from(quote2ShortOpened.id),
				sig: {
					lowestPrice: decimal(1),
					highestPrice: decimal(3),
					averagePrice: decimal(2),
					currentPrice: decimal(2),
					endTime: sigTimes[0],
					startTime: sigTimes[1],
				},
				beforeOutput: beforeOut,
			})
		})

		describe("should calculate closePrice correctly when position is LONG", async function () {
			it("closePrice is higher than avg price", async function () {
				const sigTimes = await prepareSigTimes()

				await context.controlFacet.setForceClosePricePenalty(decimal(1))

				const penalty = await context.viewFacet.forceClosePricePenalty()
				const quote = await context.viewFacet.getQuote(1)

				const expectedClosePrice = calculateExpectedClosePriceForForceClose(quote, penalty, true)
				const expectedAvgClosedPrice = calculateExpectedAvgPriceForForceClose(quote, expectedClosePrice)

				const gapRatio = await context.viewFacet.forceCloseGapRatio(quote1LongOpened.symbolId)
				let dummySig = await getDummyHighLowPriceSig(
					sigTimes[0], // startTime
					sigTimes[1], // endTime
					decimal(1),  // lowest
					quote1LongOpened.requestedClosePrice.add(unDecimal(quote1LongOpened.requestedClosePrice.mul(gapRatio))).add(decimal(1, 16)),  // highest
					decimal(1),  // currentPrice
					decimal(1),  // averagePrice
					0,           // symbolId
					0,           // upnlPartyB
					0            // upnlPartyA
				);
				await user.forceClosePosition(quote1LongOpened.id, dummySig)
				const avgClosePrice = (await context.viewFacet.getQuote(quote1LongOpened.id)).avgClosedPrice
				expect(avgClosePrice).to.be.equal(expectedAvgClosedPrice)
			})

			it("closePrice is lower than or equal to avg price", async function () {
				const sigTimes = await prepareSigTimes()

				await context.controlFacet.setForceClosePricePenalty(decimal(1))
				const quote = await context.viewFacet.getQuote(1)

				const expectedClosePrice = decimal(4) //sig.averagePrice
				const expectedAvgClosedPrice = calculateExpectedAvgPriceForForceClose(quote, expectedClosePrice)

				const gapRatio = await context.viewFacet.forceCloseGapRatio(quote1LongOpened.symbolId)
				let dummySig = await getDummyHighLowPriceSig(
					sigTimes[0], // startTime
					sigTimes[1], // endTime
					decimal(1),  // lowest
					quote1LongOpened.requestedClosePrice.add(unDecimal(quote1LongOpened.requestedClosePrice.mul(gapRatio))).add(decimal(5)),  // highest
					decimal(3),  // currentPrice
					decimal(4),  // averagePrice
					0,           // symbolId
					0,           // upnlPartyB
					0            // upnlPartyA
				);
				await user.forceClosePosition(quote1LongOpened.id, dummySig)

				const avgClosePrice = (await context.viewFacet.getQuote(quote1LongOpened.id)).avgClosedPrice
				expect(avgClosePrice).to.be.equal(expectedAvgClosedPrice)
			})
		})

		describe("should calculate closePrice correctly when position is SHORT", async function () {
			it("closePrice is higher than avg price", async function () {
				const sigTimes = await prepareSigTimes()

				await context.controlFacet.setForceClosePricePenalty(decimal(1).div(2))

				const dummySig = await getDummyHighLowPriceSig(sigTimes[0], sigTimes[1], decimal(0), decimal(1).div(6), decimal(1), decimal(1).div(6).div(2))
				await user.forceClosePosition(2, dummySig)

				const avgClosePrice = (await context.viewFacet.getQuote(2)).avgClosedPrice

				expect(avgClosePrice).to.be.equal(decimal(1).div(6).div(2)) //sig.averagePrice
			})
			it("closePrice is lower than or equal to avg price", async function () {
				const sigTimes = await prepareSigTimes()

				await context.controlFacet.setForceClosePricePenalty(decimal(1).div(2))

				const penalty = await context.viewFacet.forceClosePricePenalty()
				const quote = await context.viewFacet.getQuote(2)

				const expectClosePrice = calculateExpectedClosePriceForForceClose(quote, penalty, false)
				const expectedAvgClosedPrice = calculateExpectedAvgPriceForForceClose(quote, expectClosePrice)

				const gapRatio = await context.viewFacet.forceCloseGapRatio(quote2ShortOpened.symbolId)
				const dummySig = await getDummyHighLowPriceSig(
					sigTimes[0],  // startTime
					sigTimes[1],  // endTime
					quote2ShortOpened.requestedClosePrice.add(unDecimal(quote2ShortOpened.requestedClosePrice.mul(gapRatio))).sub(decimal(1)),  // lowest
					decimal(1),  // highest
					decimal(1),   // currentPrice
					decimal(1),   // averagePrice
					quote2ShortOpened.symbolId, // symbolId
					0,            // upnlPartyB
					0 // upnlPartyA
				);

				await user.forceClosePosition(2, dummySig)

				const avgClosePrice = (await context.viewFacet.getQuote(2)).avgClosedPrice

				expect(avgClosePrice).to.be.equal(expectedAvgClosedPrice)
			})
		})
	})
}
