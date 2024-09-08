import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"

import { initializeFixture } from "./Initialize.fixture"
import { QuoteStatus } from "./models/Enums"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { limitQuoteRequestBuilder, marketQuoteRequestBuilder } from "./models/requestModels/QuoteRequest"
import { SendQuoteValidator } from "./models/validators/SendQuoteValidator"
import { decimal, getBlockTimestamp, pausePartyA } from "./utils/Common"
import { getDummySingleUpnlAndPriceSig } from "./utils/SignatureUtils"

export function shouldBehaveLikeSendQuote(): void {
	let user: User, context: RunContext

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		this.user_allocated = decimal(1200)
		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(2000), decimal(1500), this.user_allocated)
	})

	it("Should fail on paused partyA", async function () {
		await pausePartyA(context)
		await expect(user.sendQuote(limitQuoteRequestBuilder().quantity(50).cva(50).partyAmm(1).lf(100).build())).to.be.revertedWith(
			"Pausable: PartyA actions paused",
		)
	})

	//TODO : review the `PartyAFacet: Leverage can't be lower than one`
	// it("Should fail on leverage being lower than one", async function () {
	// 	await expect(user.sendQuote(limitQuoteRequestBuilder().quantity(50).cva(50).partyAmm(1).lf(100).build())).to.be.revertedWith(
	// 		"PartyAFacet: Leverage can't be lower than one",
	// 	)

	// 	await expect(
	// 		user.sendQuote(limitQuoteRequestBuilder().quantity(decimal(0)).cva(decimal(3)).partyAmm(decimal(75)).lf(decimal(22)).build()),
	// 	).to.be.revertedWith("PartyAFacet: Leverage can't be lower than one")
	// })

	it("Should fail on invalid symbol", async function () {
		await expect(
			user.sendQuote(limitQuoteRequestBuilder().symbolId(2).quantity(decimal(0)).cva(decimal(3)).partyAmm(decimal(75)).lf(decimal(22)).build()),
		).to.be.revertedWith("PartyAFacet: Symbol is not valid")
	})

	it("Should fail on LF lower than minAcceptablePortionLF", async function () {
		await expect(
			user.sendQuote(limitQuoteRequestBuilder().quantity(decimal(100)).cva(decimal(1)).partyAmm(decimal(1)).lf(decimal(0)).build()),
		).to.be.revertedWith("PartyAFacet: LF is not enough")
	})

	it("Should fail on quote value lower than minAcceptableQuoteValue", async function () {
		await expect(
			user.sendQuote(limitQuoteRequestBuilder().quantity(decimal(50)).cva(decimal(1)).partyAmm(decimal(1)).lf(decimal(1)).build()),
		).to.be.revertedWith("PartyAFacet: Quote value is low")
	})

	it("Should fail when partyA is in partyBWhiteList", async function () {
		await expect(
			user.sendQuote(
				limitQuoteRequestBuilder()
					.partyBWhiteList([await user.getAddress()])
					.quantity(decimal(50))
					.cva(decimal(3))
					.partyAmm(decimal(5))
					.lf(decimal(5))
					.build(),
			),
		).to.be.revertedWith("PartyAFacet: Sender isn't allowed in partyBWhiteList")
	})

	it("Should fail on insufficient available balance", async function () {
		await expect(
			user.sendQuote(
				limitQuoteRequestBuilder()
					.price(decimal(16))
					.quantity(decimal(500))
					.cva(decimal(120))
					.partyAmm(this.user_allocated)
					.lf(decimal(50))
					.upnlSig(getDummySingleUpnlAndPriceSig(decimal(16)))
					.build(),
			),
		).to.be.revertedWith("PartyAFacet: insufficient available balance")

		await expect(
			user.sendQuote(limitQuoteRequestBuilder().quantity(decimal(1600)).cva(decimal(250)).partyAmm(this.user_allocated).lf(decimal(60)).build()),
		).to.be.revertedWith("PartyAFacet: insufficient available balance")
	})

	it("Should expire", async function () {
		let qId = await user.sendQuote(limitQuoteRequestBuilder().deadline(getBlockTimestamp(100)).build())
		await expect(context.partyAFacet.expireQuote([qId])).to.be.revertedWith("LibQuote: Quote isn't expired")
		await time.increase(1000)
		await context.partyAFacet.expireQuote([1])
		expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(QuoteStatus.EXPIRED)
	})

	it("Should run successfully for limit", async function () {
		let validator = new SendQuoteValidator()
		const before = await validator.before(context, { user: user })
		let qId = await user.sendQuote()
		validator.after(context, { user: user, quoteId: qId, beforeOutput: before })
	})

	it("Should run successfully for market", async function () {
		let validator = new SendQuoteValidator()
		const before = await validator.before(context, { user: user })
		let qId = await user.sendQuote(marketQuoteRequestBuilder().build())
		validator.after(context, { user: user, quoteId: qId, beforeOutput: before })
	})

	it("Should fail on more sent quotes than the allowed range", async function () {
		let validPending = await context.viewFacet.pendingQuotesValidLength()
		while (true) {
			validPending = validPending.sub("1")
			await user.sendQuote()
			if (validPending.isZero()) break
		}
		await expect(user.sendQuote()).to.be.revertedWith("PartyAFacet: Number of pending quotes out of range")
	})
}
