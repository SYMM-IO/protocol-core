import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers"
import {expect} from "chai"

import {initializeFixture} from "./Initialize.fixture"
import {PositionType, QuoteStatus} from "./models/Enums"
import {Hedger} from "./models/Hedger"
import {RunContext} from "./models/RunContext"
import {User} from "./models/User"
import {limitOpenRequestBuilder} from "./models/requestModels/OpenRequest"
import {AcceptCancelRequestValidator} from "./models/validators/AcceptCancelRequestValidator"
import {CancelQuoteValidator} from "./models/validators/CancelQuoteValidator"
import {OpenPositionValidator} from "./models/validators/OpenPositionValidator"
import {decimal, getQuoteQuantity, pausePartyA, pausePartyB} from "./utils/Common"
import {limitQuoteRequestBuilder} from "./models/requestModels/QuoteRequest"

export function shouldBehaveLikeCancelQuote(): void {
	let context: RunContext, user: User, hedger: Hedger, hedger2: Hedger

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

		await user.sendQuote()
	})

	it("Should fail due to invalid quoteId", async function () {
		await expect(user.requestToCancelQuote(3)).to.be.reverted
	})

	it("Should fail on invalid partyA", async function () {
		await expect(context.partyAFacet.requestToCancelQuote(1)).to.be.revertedWith("Accessibility: Should be partyA of quote")
	})

	it("Should fail on paused partyA", async function () {
		await pausePartyA(context)
		await expect(user.requestToCancelQuote(1)).to.be.revertedWith("Pausable: PartyA actions paused")
	})

	it("Should fail on liquidated partyA", async function () {
		await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
		await hedger.lockQuote(2)
		await hedger.openPosition(2)
		await user.liquidateAndSetSymbolPrices([1n], [decimal(2000n)])
		await expect(user.requestToCancelQuote(1)).to.be.revertedWith("Accessibility: PartyA isn't solvent")
	})

	it("Should fail on invalid state", async function () {
		await user.sendQuote()
		await hedger.lockQuote(2)
		await hedger.openPosition(2)
		await expect(user.requestToCancelQuote(2)).to.be.revertedWith("PartyAFacet: Invalid state")
	})

	it("Should cancel a pending quote", async function () {
		const validator = new CancelQuoteValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			quoteId: BigInt(1),
		})
		await user.requestToCancelQuote(1)
		await validator.after(context, {
			user: user,
			quoteId: BigInt(1),
			beforeOutput: beforeOut,
			targetStatus: QuoteStatus.CANCELED,
		})
	})

	it("Should cancel a expired pending quote", async function () {
		const validator = new CancelQuoteValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			quoteId: BigInt(1),
		})
		await time.increase(1000)
		await user.requestToCancelQuote(1)
		await validator.after(context, {
			user: user,
			quoteId: BigInt(1),
			beforeOutput: beforeOut,
			targetStatus: QuoteStatus.EXPIRED,
		})
	})

	describe("Should cancel a locked quote", async function () {
		beforeEach(async function () {
			await hedger.lockQuote(1)
		})

		it("Should fail to accept cancel request on invalid quoteId", async function () {
			await expect(hedger.acceptCancelRequest(2)).to.be.reverted
		})

		it("Should fail to accept cancel request on invalid partyB", async function () {
			await user.requestToCancelQuote(1)
			await expect(hedger2.acceptCancelRequest(1)).to.be.revertedWith("Accessibility: Should be partyB of quote")
		})

		it("Should fail to accept cancel request on paused partyB", async function () {
			await user.requestToCancelQuote(1)
			await pausePartyB(context)
			await expect(hedger.acceptCancelRequest(1)).to.be.revertedWith("Pausable: PartyB actions paused")
		})

		describe("Should cancel successfully", async function () {
			it("Accept cancel request", async function () {
				const cqValidator = new CancelQuoteValidator()
				const cqBeforeOut = await cqValidator.before(context, {
					user: user,
					quoteId: BigInt(1),
				})
				await user.requestToCancelQuote(1)
				await cqValidator.after(context, {
					user: user,
					quoteId: BigInt(1),
					beforeOutput: cqBeforeOut,
				})

				const accValidator = new AcceptCancelRequestValidator()
				const accBeforeOut = await accValidator.before(context, {
					user: user,
					quoteId: BigInt(1),
				})
				await hedger.acceptCancelRequest(1)
				await accValidator.after(context, {
					user: user,
					quoteId: BigInt(1),
					beforeOutput: accBeforeOut,
				})
			})

			it("Open position partially", async function () {
				const quantity = await getQuoteQuantity(context, 1n)
				await user.requestToCancelQuote(1)
				const validator = new OpenPositionValidator()
				const beforeOut = await validator.before(context, {
					user: user,
					hedger: hedger,
					quoteId: BigInt(1),
				})
				const openedPrice = decimal(1n)
				const filledAmount = quantity / 2n
				await hedger.openPosition(1, limitOpenRequestBuilder().filledAmount(filledAmount).openPrice(openedPrice).price(decimal(1n, 17)).build())
				await validator.after(context, {
					user: user,
					hedger: hedger,
					quoteId: BigInt(1),
					openedPrice: openedPrice,
					fillAmount: filledAmount,
					beforeOutput: beforeOut,
					newQuoteId: BigInt(2),
					newQuoteTargetStatus: QuoteStatus.CANCELED,
				})
			})

			it("Open position fully", async function () {
				const quantity = await getQuoteQuantity(context, 1n)
				await user.requestToCancelQuote(1)
				const validator = new OpenPositionValidator()
				const beforeOut = await validator.before(context, {
					user: user,
					hedger: hedger,
					quoteId: BigInt(1),
				})
				const openedPrice = decimal(1n)
				const filledAmount = quantity
				await hedger.openPosition(1, limitOpenRequestBuilder().filledAmount(quantity).openPrice(openedPrice).price(decimal(1n, 17)).build())
				await validator.after(context, {
					user: user,
					hedger: hedger,
					quoteId: BigInt(1),
					openedPrice: openedPrice,
					fillAmount: filledAmount,
					beforeOutput: beforeOut,
				})
			})

			it("Should force cancel quote", async function () {
				await expect(user.forceCancelQuote(1)).to.be.revertedWith("PartyAFacet: Invalid state")
				await user.requestToCancelQuote(1)
				await expect(user.forceCancelQuote(1)).to.be.revertedWith("PartyAFacet: Cooldown not reached")
				await time.increase(300)
				await user.forceCancelQuote(1)
				expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.eq(QuoteStatus.CANCELED)
			})
		})
	})
}
