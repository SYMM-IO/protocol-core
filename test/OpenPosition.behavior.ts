import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers"
import {expect} from "chai"
import {initializeFixture} from "./Initialize.fixture"
import {PositionType, QuoteStatus} from "./models/Enums"
import {Hedger} from "./models/Hedger"
import {RunContext} from "./models/RunContext"
import {User} from "./models/User"
import {limitOpenRequestBuilder, marketOpenRequestBuilder} from "./models/requestModels/OpenRequest"
import {limitQuoteRequestBuilder, marketQuoteRequestBuilder} from "./models/requestModels/QuoteRequest"
import {OpenPositionValidator} from "./models/validators/OpenPositionValidator"
import {decimal, getQuoteQuantity, pausePartyB} from "./utils/Common"

export function shouldBehaveLikeOpenPosition(): void {
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
		await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
		await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
		await user.sendQuote(marketQuoteRequestBuilder().build())

		await hedger.lockQuote(1)
		await hedger2.lockQuote(2)
	})

	it("Should fail on not being the correct partyB", async function () {
		await expect(hedger.openPosition(2)).to.be.revertedWith("Accessibility: Should be partyB of quote")
	})

	it("Should fail on paused partyB", async function () {
		await pausePartyB(context)
		await expect(hedger.openPosition(1)).to.be.revertedWith("Pausable: PartyB actions paused")
	})

	it("Should fail on liquidated quote", async function () {
		await hedger2.openPosition(2)
		await hedger2.lockQuote(3)
		await user.liquidateAndSetSymbolPrices([1n], [decimal(2000n)])
		await expect(hedger2.openPosition(3)).to.be.revertedWith("Accessibility: PartyA isn't solvent")
	})

	it("Should fail on invalid fill amount", async function () {
		// more than quantity
		await expect(
			hedger.openPosition(
				1,
				limitOpenRequestBuilder()
					.filledAmount((await getQuoteQuantity(context, 1n)) + decimal(1n))
					.openPrice(decimal(1n))
					.build(),
			),
		).to.be.revertedWith("PartyBFacet: Invalid filledAmount")

		// zero
		await expect(hedger.openPosition(1, limitOpenRequestBuilder().filledAmount("0").build())).to.be.revertedWith("PartyBFacet: Invalid filledAmount")

		// market should get fully filled
		await hedger.lockQuote(4)
		await expect(
			hedger.openPosition(
				4,
				limitOpenRequestBuilder()
					.filledAmount((await getQuoteQuantity(context, 4n)) - decimal(1n))
					.openPrice(decimal(1n))
					.build(),
			),
		).to.be.revertedWith("PartyBFacet: Invalid filledAmount")
	})

	it("Should fail on invalid open price", async function () {
		const quantity = await getQuoteQuantity(context, 1n)
		await expect(hedger.openPosition(1, limitOpenRequestBuilder().filledAmount(quantity).openPrice(decimal(2n)).build())).to.be.revertedWith(
			"PartyBFacet: Opened price isn't valid",
		)

		await expect(hedger2.openPosition(2, limitOpenRequestBuilder().filledAmount(quantity).openPrice(decimal(5n, 17)).build())).to.be.revertedWith(
			"PartyBFacet: Opened price isn't valid",
		)
	})

	it("Should fail if PartyB will be liquidatable", async function () {
		await expect(
			hedger.openPosition(
				1,
				limitOpenRequestBuilder()
					.filledAmount(await getQuoteQuantity(context, 1n))
					.openPrice(decimal(1n))
					.price(decimal(2n))
					.build(),
			),
		).to.be.revertedWith("LibSolvency: Available balance is lower than zero")

		await expect(
			hedger2.openPosition(
				2,
				limitOpenRequestBuilder()
					.filledAmount(await getQuoteQuantity(context, 2n))
					.openPrice(decimal(1n))
					.price(decimal(1n, 17))
					.upnlPartyB(decimal(-20n))
					.build(),
			),
		).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
	})

	it("Should fail if PartyA will become liquidatable", async function () {
		await expect(
			hedger.openPosition(
				1,
				limitOpenRequestBuilder()
					.filledAmount(await getQuoteQuantity(context, 1n))
					.openPrice(decimal(1n))
					.price(decimal(1n, 17))
					.upnlPartyA(decimal(-400n))
					.build(),
			),
		).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
		await expect(
			hedger2.openPosition(
				2,
				limitOpenRequestBuilder()
					.filledAmount(await getQuoteQuantity(context, 2n))
					.openPrice(decimal(1n))
					.price(decimal(2n))
					.upnlPartyA(decimal(-400n))
					.build(),
			),
		).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
	})

	it("Should fail partially opened position of quote value is low", async function () {
		await expect(
			hedger.openPosition(
				1,
				limitOpenRequestBuilder()
					.filledAmount((await getQuoteQuantity(context, 1n)) - decimal(1n))
					.openPrice(decimal(1n))
					.price(decimal(1n, 17))
					.build(),
			),
		).to.be.revertedWith("PartyBFacet: Quote value is low")

		await expect(
			hedger.openPosition(1, limitOpenRequestBuilder().filledAmount(decimal(1n)).openPrice(decimal(1n)).price(decimal(1n, 17)).build()),
		).to.be.revertedWith("PartyBFacet: Quote value is low")
	})

	it("Should fail to open expired quote", async function () {
		await time.increase(1000)
		await expect(
			hedger.openPosition(
				1,
				limitOpenRequestBuilder()
					.filledAmount(await getQuoteQuantity(context, 1n))
					.openPrice(decimal(1n))
					.price(decimal(1n, 17))
					.build(),
			),
		).to.be.revertedWith("PartyBFacet: Quote is expired")
	})

	it("Should run successfully for limit", async function () {
		const validator = new OpenPositionValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(1),
		})
		const openedPrice = decimal(1n)
		const filledAmount = await getQuoteQuantity(context, 1n)
		await hedger.openPosition(1, limitOpenRequestBuilder().filledAmount(filledAmount).openPrice(openedPrice).price(decimal(1n, 17)).build())
		await validator.after(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(1),
			openedPrice: openedPrice,
			fillAmount: filledAmount,
			beforeOutput: beforeOut,
		})
	})

	it("Should run successfully partially for limit", async function () {
		const oldQuote = await context.viewFacet.getQuote(1)
		const validator = new OpenPositionValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(1),
		})
		const filledAmount = oldQuote.quantity / 4n
		const openedPrice = decimal(9n, 17)
		await hedger.openPosition(1, limitOpenRequestBuilder().filledAmount(filledAmount).openPrice(openedPrice).price(decimal(1n, 17)).build())
		await validator.after(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(1),
			openedPrice: openedPrice,
			fillAmount: filledAmount,
			beforeOutput: beforeOut,
			newQuoteId: BigInt(5),
			newQuoteTargetStatus: QuoteStatus.PENDING,
		})
	})

	it("Should run successfully for market", async function () {
		await hedger.lockQuote(4)
		const validator = new OpenPositionValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(4),
		})
		const openedPrice = decimal(1n)
		const filledAmount = await getQuoteQuantity(context, 4n)
		await hedger.openPosition(4, marketOpenRequestBuilder().filledAmount(filledAmount).openPrice(openedPrice).price(decimal(1n)).build())
		await validator.after(context, {
			user: user,
			hedger: hedger,
			quoteId: BigInt(4),
			openedPrice: openedPrice,
			fillAmount: filledAmount,
			beforeOutput: beforeOut,
		})
	})
}
