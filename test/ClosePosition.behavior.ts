import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers"
import {expect} from "chai"

import {initializeFixture} from "./Initialize.fixture"
import {OrderType, PositionType, QuoteStatus} from "./models/Enums"
import {BalanceInfo, Hedger} from "./models/Hedger"
import {RunContext} from "./models/RunContext"
import {User} from "./models/User"
import {limitCloseRequestBuilder, marketCloseRequestBuilder} from "./models/requestModels/CloseRequest"
import {limitQuoteRequestBuilder} from "./models/requestModels/QuoteRequest"
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
import {getDummyHighLowPriceSig, getDummyPriceSig} from "./utils/SignatureUtils"
import {CloseRequestValidator} from "./models/validators/CloseRequestValidator"
import {limitFillCloseRequestBuilder, marketFillCloseRequestBuilder} from "./models/requestModels/FillCloseRequest"
import {FillCloseRequestValidator} from "./models/validators/FillCloseRequestValidator"
import {CancelCloseRequestValidator} from "./models/validators/CancelCloseRequestValidator"
import {AcceptCancelCloseRequestValidator} from "./models/validators/AcceptCancelCloseRequestValidator"
import {emergencyCloseRequestBuilder} from "./models/requestModels/EmergencyCloseRequest"
import {EmergencyCloseRequestValidator} from "./models/validators/EmergencyCloseRequestValidator"
import {ForceClosePositionValidator} from "./models/validators/ForceClosePositionValidator"
import {calculateExpectedAvgPriceForForceClose, calculateExpectedClosePriceForForceClose} from "./utils/PriceUtils"
import {QuoteStructOutput} from "../src/types/contracts/interfaces/ISymmio"

export function shouldBehaveLikeClosePosition(): void {
	let user: User, hedger: Hedger, hedger2: Hedger
	let context: RunContext
	let quote1LongOpened: QuoteStructOutput, quote2ShortOpened: QuoteStructOutput, quote3JustSent: QuoteStructOutput,
		quote4LongOpened: QuoteStructOutput

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		this.user_allocated = decimal(500n)
		this.hedger_allocated = decimal(4000n)

		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(2000n), decimal(1000n), this.user_allocated)

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
				2n, //quoteId
				decimal(1n), //closePrice
				decimal(1n), //quantityToClose
				BigInt(OrderType.LIMIT),
				await getBlockTimestamp(100n),
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
		const quantity = await getQuoteQuantity(context, 1n)
		await expect(
			user.requestToClosePosition(
				1,
				limitCloseRequestBuilder()
					.quantityToClose(quantity + decimal(1n))
					.build(),
			),
		).to.be.revertedWith("PartyAFacet: Invalid quantityToClose")
		await expect(
			user.requestToClosePosition(
				1,
				limitCloseRequestBuilder()
					.quantityToClose(quantity + decimal(1n))
					.build(),
			),
		).to.be.revertedWith("PartyAFacet: Invalid quantityToClose")
	})

	it("Should request limit successfully", async function () {
		const validator = new CloseRequestValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(1),
		})
		const closePrice = decimal(1n, 17)
		const quantityToClose = await getQuoteQuantity(context, 1n)
		await user.requestToClosePosition(1, limitCloseRequestBuilder().quantityToClose(quantityToClose).closePrice(closePrice).build())
		await validator.after(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(1),
			closePrice: closePrice,
			quantityToClose: quantityToClose,
			beforeOutput: beforeOut,
		})
	})

	it("Should request limit successfully partially", async function () {
		const quantity = await getQuoteQuantity(context, 1n)
		const validator = new CloseRequestValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(1),
		})
		const closePrice = decimal(1n, 17)
		const quantityToClose = quantity / 2n
		await user.requestToClosePosition(1, limitCloseRequestBuilder().quantityToClose(quantityToClose).closePrice(closePrice).build())
		await validator.after(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(1),
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
			quoteId: BigInt(1),
		})
		const closePrice = decimal(1n, 17)
		const quantityToClose = await getQuoteQuantity(context, 1n)
		await user.requestToClosePosition(1, marketCloseRequestBuilder().quantityToClose(quantityToClose).closePrice(closePrice).build())
		await validator.after(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(1),
			closePrice: closePrice,
			quantityToClose: quantityToClose,
			beforeOutput: beforeOut,
		})
	})

	it("Should request market successfully partially", async function () {
		const quantity = await getQuoteQuantity(context, 1n)
		const validator = new CloseRequestValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(1),
		})
		const closePrice = decimal(1n, 17)
		const quantityToClose = quantity / 2n
		await user.requestToClosePosition(1, marketCloseRequestBuilder().quantityToClose(quantityToClose).closePrice(closePrice).build())
		await validator.after(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(1),
			closePrice: closePrice,
			quantityToClose: quantityToClose,
			beforeOutput: beforeOut,
		})
	})

	it("Should expire close request", async function () {
		await user.requestToClosePosition(
			1,
			limitCloseRequestBuilder()
				.quantityToClose(await getQuoteQuantity(context, 1n))
				.closePrice(decimal(1n, 17))
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
					.quantityToClose(await getQuoteQuantity(context, 1n))
					.closePrice(decimal(1n))
					.build(),
			)
			await user.requestToClosePosition(
				2,
				limitCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 2n))
					.closePrice(decimal(1n))
					.build(),
			)
			await user.requestToClosePosition(
				4,
				marketCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 4n))
					.closePrice(decimal(1n))
					.build(),
			)
		})

		it("Should fail on invalid partyB", async function () {
			await expect(
				hedger2.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1n))
						.closedPrice(decimal(1n))
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
						.filledAmount(await getQuoteQuantity(context, 1n))
						.closedPrice(decimal(1n))
						.build(),
				),
			).to.be.revertedWith("Pausable: PartyB actions paused")
		})

		it("Should fail on fill amount", async function () {
			const quantity = await getQuoteQuantity(context, 1n)
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(quantity + decimal(1n))
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Invalid filledAmount")
			await expect(
				hedger.fillCloseRequest(
					4,
					limitFillCloseRequestBuilder()
						.filledAmount(quantity + decimal(1n))
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Invalid filledAmount")
		})

		it("Should fail on invalid close price", async function () {
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1n))
						.closedPrice(decimal(1n, 17))
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Closed price isn't valid")

			await expect(
				hedger.fillCloseRequest(
					2,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 2n))
						.closedPrice(decimal(2n))
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Closed price isn't valid")
		})

		it("Should fail on negative balance of partyA/partyB", async function () {
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1n))
						.closedPrice(decimal(1n))
						.upnlPartyA(decimal(-575n))
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1n))
						.closedPrice(decimal(1n))
						.upnlPartyB(decimal(-410n))
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
		})

		it("Should fail on partyB becoming liquidatable", async function () {
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1n))
						.closedPrice(decimal(1n))
						.upnlPartyB(decimal(-300n))
						.price(decimal(1n, 17))
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
			await expect(
				hedger.fillCloseRequest(
					2,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 2n))
						.closedPrice(decimal(1n, 17))
						.upnlPartyB(decimal(-300n))
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
		})

		it("Should fail on partyA becoming liquidatable", async function () {
			let quantity = await getQuoteQuantity(context, 1n)
			let price = decimal(11n, 17)
			let closePrice = decimal(1n)
			let userAvailable = this.user_allocated
				- (await getTotalLockedValuesForQuoteIds(context, [2n, 4n], false))
				- (await getTradingFeeForQuotes(context, [1n, 2n, 3n, 4n]))
				- (unDecimal(quantity * (price - closePrice)))

			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(quantity)
						.closedPrice(closePrice)
						.upnlPartyA((userAvailable + (decimal(1n))) * (-1n))
						.price(price)
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")

			quantity = await getQuoteQuantity(context, 1n)
			price = decimal(1n, 17)
			closePrice = decimal(1n)
			userAvailable = this.user_allocated
				- (await getTotalLockedValuesForQuoteIds(context, [1n, 4n], false))
				- (await getTradingFeeForQuotes(context, [1n, 2n, 3n, 4n]))
				- (unDecimal(quantity * (closePrice - price)))

			await expect(
				hedger.fillCloseRequest(
					2,
					limitFillCloseRequestBuilder()
						.filledAmount(quantity)
						.closedPrice(closePrice)
						.upnlPartyA((userAvailable + (decimal(1n))) * (-1n))
						.price(price)
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
		})

		it("Should fail due to expired request", async function () {
			await time.increase(1000)
			let closePrice = decimal(11n, 17)
			await expect(
				hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1n))
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
				quoteId: BigInt(1),
			})
			let closePrice = decimal(11n, 17)
			const filledAmount = await getQuoteQuantity(context, 1n)
			await hedger.fillCloseRequest(1, limitFillCloseRequestBuilder().filledAmount(filledAmount).closedPrice(closePrice).build())
			await validator.after(context, {
				user: user,
				hedger: hedger,
				quoteId: BigInt(1),
				closePrice: closePrice,
				fillAmount: filledAmount,
				beforeOutput: beforeOut,
			})
		})

		it("Should run successfully partially for limit", async function () {
			const closePrice = decimal(11n, 17)
			const quantity = await getQuoteQuantity(context, 1n)
			const filledAmount = quantity / 2n
			const validator = new FillCloseRequestValidator()
			const beforeOut = await validator.before(context, {
				user: user,
				hedger: hedger,
				quoteId: BigInt(1),
			})
			await hedger.fillCloseRequest(1, limitFillCloseRequestBuilder().filledAmount(filledAmount).closedPrice(closePrice).build())
			await validator.after(context, {
				user: user,
				hedger: hedger,
				quoteId: BigInt(1),
				closePrice: closePrice,
				fillAmount: filledAmount,
				beforeOutput: beforeOut,
			})
		})

		it("Should run successfully for market", async function () {
			let closePrice = decimal(11n, 17)
			const validator = new FillCloseRequestValidator()
			const beforeOut = await validator.before(context, {
				user: user,
				hedger: hedger,
				quoteId: BigInt(4),
			})
			const filledAmount = await getQuoteQuantity(context, 4n)
			await hedger.fillCloseRequest(4, marketFillCloseRequestBuilder().filledAmount(filledAmount).closedPrice(closePrice).build())
			await validator.after(context, {
				user: user,
				hedger: hedger,
				quoteId: BigInt(4),
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
					.quantityToClose(await getQuoteQuantity(context, 4n))
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
				quoteId: BigInt(1),
			})
			await user.requestToCancelCloseRequest(1)
			await validator.after(context, {
				user: user,
				hedger: hedger,
				quoteId: BigInt(1),
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
					quoteId: BigInt(1),
				})
				await hedger.acceptCancelCloseRequest(1)
				await validator.after(context, {
					user: user,
					hedger: hedger,
					quoteId: BigInt(1),
					beforeOutput: beforeOut,
				})
			})
		})
	})

	describe("Emergency Close", async function () {
		beforeEach(async function () {
		})

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
				await expect(hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().upnlPartyA(decimal(-575n)).build())).to.be.revertedWith(
					"PartyBFacet: PartyA is insolvent",
				)
				await expect(hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().upnlPartyB(decimal(-410n)).build())).to.be.revertedWith(
					"PartyBFacet: PartyB should be solvent",
				)
			})

			it("Should run successfully", async function () {
				const validator = new EmergencyCloseRequestValidator()
				const beforeOut = await validator.before(context, {
					user: user,
					hedger: hedger,
					quoteId: BigInt(1),
				})
				await hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().build())
				await validator.after(context, {
					user: user,
					hedger: hedger,
					quoteId: BigInt(1),
					price: decimal(1n),
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
					quoteId: BigInt(1),
				})
				await hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().build())
				await validator.after(context, {
					user: user,
					hedger: hedger,
					quoteId: BigInt(1),
					price: decimal(1n),
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
					quoteId: BigInt(1),
				})
				await hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().build())
				await validator.after(context, {
					user: user,
					hedger: hedger,
					quoteId: BigInt(1),
					price: decimal(1n),
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
					.quantityToClose(await getQuoteQuantity(context, 1n))
					.closePrice(decimal(1n))
					.deadline((await getBlockTimestamp()) + 1000n)
					.build(),
			)
			await user.requestToClosePosition(
				2,
				limitCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 2n))
					.closePrice(decimal(1n))
					.deadline((await getBlockTimestamp()) + 1000n)
					.build(),
			)
			await user.requestToClosePosition(
				4,
				marketCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 4n))
					.closePrice(decimal(1n))
					.deadline((await getBlockTimestamp()) + 1000n)
					.build(),
			)

			await context.controlFacet.setForceCloseMinSigPeriod(10)
			await context.controlFacet.setForceCloseGapRatio((await context.viewFacet.getQuote(1)).symbolId, decimal(1n, 17))

			quote1LongOpened = await context.viewFacet.getQuote(quote1LongOpened.id)
			quote2ShortOpened = await context.viewFacet.getQuote(quote2ShortOpened.id)
			quote3JustSent = await context.viewFacet.getQuote(quote3JustSent.id)
			quote4LongOpened = await context.viewFacet.getQuote(quote4LongOpened.id)
		})

		async function prepareSigTimes(period: bigint = 10n) {
			const now = await getBlockTimestamp()
			const cooldowns = await context.viewFacet.forceCloseCooldowns()
			const firstCooldown = cooldowns[0]
			const secondCooldown = cooldowns[1]
			const startTime = firstCooldown + now
			const endTime = firstCooldown + now + period
			await time.increase(firstCooldown + period + secondCooldown + 1n)
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
			const dummySig = await getDummyHighLowPriceSig(sigTimes[0], sigTimes[1] + 800n)
			await expect(user.forceClosePosition(1, dummySig)).to.be.revertedWith("PartyBFacet: Close request is expired")
		})

		it("Should fail when cooldowns not reached", async function () {
			const sigTimes = await prepareSigTimes()

			let dummySig = await getDummyHighLowPriceSig(sigTimes[0] - 50n, sigTimes[1])
			await expect(user.forceClosePosition(1, dummySig)).to.be.revertedWith("PartyAFacet: Cooldown not reached")

			dummySig = await getDummyHighLowPriceSig(sigTimes[0], sigTimes[1] + 200n)
			await expect(user.forceClosePosition(1, dummySig)).to.be.revertedWith("PartyAFacet: Cooldown not reached")
		})

		it("Should fail on invalid averagePrice", async function () {
			const sigTimes = await prepareSigTimes()
			await expect(user.forceClosePosition(2, await getDummyHighLowPriceSig(sigTimes[0], sigTimes[1], 100n, 200n, 210n, 220n))).to.be.revertedWith(
				"PartyAFacet: Invalid average price",
			)

			await expect(user.forceClosePosition(2, await getDummyHighLowPriceSig(sigTimes[0], sigTimes[1], 100n, 200n, 210n, 80n))).to.be.revertedWith(
				"PartyAFacet: Invalid average price",
			)
		})
		it("Should fail when price not reached to requested close price", async function () {
			const sigTimes = await prepareSigTimes()
			const gapRatio1 = await context.viewFacet.forceCloseGapRatio(quote1LongOpened.symbolId)
			let dummySig = await getDummyHighLowPriceSig(
				sigTimes[0], // startTime
				sigTimes[1], // endTime
				decimal(0n),  // lowest
				BigInt(quote1LongOpened.requestedClosePrice) + unDecimal(BigInt(quote1LongOpened.requestedClosePrice) * BigInt(gapRatio1)) - decimal(1n),  // highest
				decimal(0n),  // currentPrice
				decimal(0n),  // averagePrice
				0n,           // symbolId
				0n,           // upnlPartyB
				0n            // upnlPartyA
			)
			await expect(user.forceClosePosition(quote1LongOpened.id, dummySig)).to.be.revertedWith("PartyAFacet: Requested close price not reached")

			const gapRatio2 = await context.viewFacet.forceCloseGapRatio(quote2ShortOpened.symbolId)
			dummySig = await getDummyHighLowPriceSig(
				sigTimes[0], // startTime
				sigTimes[1], // endTime
				BigInt(quote2ShortOpened.requestedClosePrice) + unDecimal(BigInt(quote2ShortOpened.requestedClosePrice) * BigInt(gapRatio2)) + decimal(1n),  // lowest
				decimal(10n), // highest
				decimal(7n),  // currentPrice
				decimal(8n),  // averagePrice
				0n,           // symbolId
				0n,           // upnlPartyB
				0n            // upnlPartyA
			)
			await expect(user.forceClosePosition(quote2ShortOpened.id, dummySig)).to.be.revertedWith("PartyAFacet: Requested close price not reached")
		})


		it("Should fail when the sig time is lower than forceCloseMinSigPeriod", async function () {
			const sigTimes = await prepareSigTimes(5n)
			const gapRatio2 = await context.viewFacet.forceCloseGapRatio(quote2ShortOpened.symbolId)
			const dummySig = await getDummyHighLowPriceSig(
				sigTimes[0], // startTime
				sigTimes[1], // endTime
				BigInt(quote2ShortOpened.requestedClosePrice) + unDecimal(BigInt(quote2ShortOpened.requestedClosePrice) * BigInt(gapRatio2)) - decimal(1n),  // lowest
				decimal(1n), // highest
				decimal(1n),  // currentPrice
				decimal(1n),  // averagePrice
				0n,           // symbolId
				0n,           // upnlPartyB
				0n            // upnlPartyA
			)
			await expect(user.forceClosePosition(quote2ShortOpened.id, dummySig)).to.be.revertedWith("PartyAFacet: Invalid signature period")
		})

		it("Should fail when partyA will be insolvent", async function () {
			const sigTimes = await prepareSigTimes()
			const quantity = decimal(100n)

			let userAvailable = (this.user_allocated
				- (await getTotalLockedValuesForQuoteIds(context, [1n, 4n], false))
				- (await getTradingFeeForQuotes(context, [1n, 2n, 3n, 4n]))
				- (unDecimal(quantity * (decimal(1n) - decimal(1n))))
				+ (decimal(1n))
			) * (-1n)

			const gapRatio2 = await context.viewFacet.forceCloseGapRatio(quote2ShortOpened.symbolId)
			const dummySig = await getDummyHighLowPriceSig(
				sigTimes[0],  // startTime
				sigTimes[1],  // endTime
				BigInt(quote2ShortOpened.requestedClosePrice) + unDecimal(BigInt(quote2ShortOpened.requestedClosePrice) * BigInt(gapRatio2)) - decimal(1n),  // lowest
				decimal(1n),  // highest
				decimal(1n),   // currentPrice
				decimal(1n),   // averagePrice
				0n,            // symbolId
				0n,            // upnlPartyB
				userAvailable  // upnlPartyA
			)

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
				BigInt(quote2ShortOpened.requestedClosePrice) + unDecimal(BigInt(quote2ShortOpened.requestedClosePrice) * BigInt(gapRatio2)) - decimal(1n),  // lowest
				decimal(10n),  // highest
				decimal(7n),   // currentPrice
				decimal(8n),   // averagePrice
				0n,            // symbolId
				0n,            // upnlPartyB
				decimal(-500n) // upnlPartyA
			)
			await user.forceClosePosition(quote2ShortOpened.id, dummySig)

			let balanceInfo: BalanceInfo = await hedger.getBalanceInfo(userAddress)
			expect(balanceInfo.allocatedBalances.toString()).to.be.equal("0")

			let sig = await getDummyPriceSig([4n, 2n, 1n], [0n, 0n, 0n])

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
				quoteId: BigInt(quote2ShortOpened.id),
			})
			const sigTimes = await prepareSigTimes(100n)
			const gapRatio2 = await context.viewFacet.forceCloseGapRatio(quote2ShortOpened.symbolId)
			const dummySig = await getDummyHighLowPriceSig(
				sigTimes[0],  // startTime
				sigTimes[1],  // endTime
				BigInt(quote2ShortOpened.requestedClosePrice) + unDecimal(BigInt(quote2ShortOpened.requestedClosePrice) * BigInt(gapRatio2)) - decimal(1n),  // lowest
				decimal(3n),  // highest
				decimal(2n),   // currentPrice
				decimal(2n),   // averagePrice
				quote2ShortOpened.symbolId, // symbolId
				0n,            // upnlPartyB
				0n             // upnlPartyA
			)

			await user.forceClosePosition(quote2ShortOpened.id, dummySig)
			await validator.after(context, {
				user: user,
				hedger: hedger,
				quoteId: BigInt(quote2ShortOpened.id),
				sig: {
					lowestPrice: decimal(1n),
					highestPrice: decimal(3n),
					averagePrice: decimal(2n),
					currentPrice: decimal(2n),
					endTime: sigTimes[0],
					startTime: sigTimes[1],
				},
				beforeOutput: beforeOut,
			})
		})


		describe("should calculate closePrice correctly when position is LONG", async function () {
			it("closePrice is higher than avg price", async function () {
				const sigTimes = await prepareSigTimes()

				await context.controlFacet.setForceClosePricePenalty(decimal(1n))

				const penalty = await context.viewFacet.forceClosePricePenalty()
				const quote = await context.viewFacet.getQuote(1)

				const expectedClosePrice = calculateExpectedClosePriceForForceClose(quote, penalty, true)
				const expectedAvgClosedPrice = calculateExpectedAvgPriceForForceClose(quote, expectedClosePrice)

				const gapRatio = await context.viewFacet.forceCloseGapRatio(quote1LongOpened.symbolId)
				let dummySig = await getDummyHighLowPriceSig(
					sigTimes[0], // startTime
					sigTimes[1], // endTime
					decimal(1n),  // lowest
					BigInt(quote1LongOpened.requestedClosePrice) + unDecimal(BigInt(quote1LongOpened.requestedClosePrice) * BigInt(gapRatio)) + decimal(1n) / BigInt(10 ** 2),  // highest
					decimal(1n),  // currentPrice
					decimal(1n),  // averagePrice
					0n,           // symbolId
					0n,           // upnlPartyB
					0n            // upnlPartyA
				)

				await user.forceClosePosition(quote1LongOpened.id, dummySig)
				const avgClosePrice = (await context.viewFacet.getQuote(quote1LongOpened.id)).avgClosedPrice
				expect(avgClosePrice).to.be.equal(expectedAvgClosedPrice)
			})

			it("closePrice is lower than or equal to avg price", async function () {
				const sigTimes = await prepareSigTimes()

				await context.controlFacet.setForceClosePricePenalty(decimal(1n))
				const quote = await context.viewFacet.getQuote(1)

				const expectedClosePrice = decimal(4n) //sig.averagePrice
				const expectedAvgClosedPrice = calculateExpectedAvgPriceForForceClose(quote, expectedClosePrice)

				const gapRatio = await context.viewFacet.forceCloseGapRatio(quote1LongOpened.symbolId)
				let dummySig = await getDummyHighLowPriceSig(
					sigTimes[0], // startTime
					sigTimes[1], // endTime
					decimal(1n),  // lowest
					BigInt(quote1LongOpened.requestedClosePrice) + unDecimal(BigInt(quote1LongOpened.requestedClosePrice) * BigInt(gapRatio)) + decimal(5n),  // highest
					decimal(3n),  // currentPrice
					decimal(4n),  // averagePrice
					0n,           // symbolId
					0n,           // upnlPartyB
					0n            // upnlPartyA
				)
				await user.forceClosePosition(quote1LongOpened.id, dummySig)

				const avgClosePrice = (await context.viewFacet.getQuote(quote1LongOpened.id)).avgClosedPrice
				expect(avgClosePrice).to.be.equal(expectedAvgClosedPrice)
			})
		})

		describe("should calculate closePrice correctly when position is SHORT", async function () {
			it("closePrice is higher than avg price", async function () {
				const sigTimes = await prepareSigTimes()

				await context.controlFacet.setForceClosePricePenalty(decimal(1n) / 2n)

				const dummySig = await getDummyHighLowPriceSig(
					sigTimes[0], // startTime
					sigTimes[1], // endTime
					decimal(0n),
					decimal(1n) / 6n,
					decimal(1n),
					decimal(1n) / 6n / 2n
				)

				await user.forceClosePosition(2, dummySig)

				const avgClosePrice = BigInt((await context.viewFacet.getQuote(2)).avgClosedPrice)

				expect(avgClosePrice).to.be.equal(decimal(1n) / 6n / 2n) // sig.averagePrice

			})
			it("closePrice is lower than or equal to avg price", async function () {
				const sigTimes = await prepareSigTimes()

				await context.controlFacet.setForceClosePricePenalty(decimal(1n) / 2n)

				const penalty = await context.viewFacet.forceClosePricePenalty()
				const quote = await context.viewFacet.getQuote(2)

				const expectClosePrice = calculateExpectedClosePriceForForceClose(quote, penalty, false)
				const expectedAvgClosedPrice = calculateExpectedAvgPriceForForceClose(quote, expectClosePrice)

				const gapRatio = await context.viewFacet.forceCloseGapRatio(quote2ShortOpened.symbolId)
				const dummySig = await getDummyHighLowPriceSig(
					sigTimes[0],  // startTime
					sigTimes[1],  // endTime
					BigInt(quote2ShortOpened.requestedClosePrice) + unDecimal(BigInt(quote2ShortOpened.requestedClosePrice) * BigInt(gapRatio)) - decimal(1n),  // lowest
					decimal(1n),  // highest
					decimal(1n),  // currentPrice
					decimal(1n),  // averagePrice
					quote2ShortOpened.symbolId, // symbolId
					0n,           // upnlPartyB
					0n            // upnlPartyA
				)

				await user.forceClosePosition(2, dummySig)

				const avgClosePrice = (await context.viewFacet.getQuote(2)).avgClosedPrice

				expect(avgClosePrice).to.be.equal(expectedAvgClosedPrice)
			})
		})
	})
}
