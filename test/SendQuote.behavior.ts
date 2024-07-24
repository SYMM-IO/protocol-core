import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers"
import {expect} from "chai"

import {initializeFixture} from "./Initialize.fixture"
import {QuoteStatus} from "./models/Enums"
import {RunContext} from "./models/RunContext"
import {User} from "./models/User"
import {limitQuoteRequestBuilder, marketQuoteRequestBuilder} from "./models/requestModels/QuoteRequest"
import {SendQuoteValidator} from "./models/validators/SendQuoteValidator"
import {decimal, getBlockTimestamp, pausePartyA} from "./utils/Common"
import {getDummySingleUpnlAndPriceSig} from "./utils/SignatureUtils"

export function shouldBehaveLikeSendQuote(): void {
	let user: User, context: RunContext

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		this.user_allocated = decimal(1200n)
		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(2000n), decimal(1500n), this.user_allocated)
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
			user.sendQuote(limitQuoteRequestBuilder().symbolId(2).quantity(decimal(0n)).cva(decimal(3n)).partyAmm(decimal(75n)).lf(decimal(22n)).build()),
		).to.be.revertedWith("PartyAFacet: Symbol is not valid")
	})

	it("Should fail on LF lower than minAcceptablePortionLF", async function () {
		await expect(
			user.sendQuote(limitQuoteRequestBuilder().quantity(decimal(100n)).cva(decimal(1n)).partyAmm(decimal(1n)).lf(decimal(0n)).build()),
		).to.be.revertedWith("PartyAFacet: LF is not enough")
	})

	it("Should fail on quote value lower than minAcceptableQuoteValue", async function () {
		await expect(
			user.sendQuote(limitQuoteRequestBuilder().quantity(decimal(50n)).cva(decimal(1n)).partyAmm(decimal(1n)).lf(decimal(1n)).build()),
		).to.be.revertedWith("PartyAFacet: Quote value is low")
	})

	it("Should fail when partyA is in partyBWhiteList", async function () {
		await expect(
			user.sendQuote(
				limitQuoteRequestBuilder()
					.partyBWhiteList([await user.getAddress()])
					.quantity(decimal(50n))
					.cva(decimal(3n))
					.partyAmm(decimal(5n))
					.lf(decimal(5n))
					.build(),
			),
		).to.be.revertedWith("PartyAFacet: Sender isn't allowed in partyBWhiteList")
	})

	it("Should fail on insufficient available balance", async function () {
		await expect(
			user.sendQuote(
				limitQuoteRequestBuilder()
					.price(decimal(16n))
					.quantity(decimal(500n))
					.cva(decimal(120n))
					.partyAmm(this.user_allocated)
					.lf(decimal(50n))
					.upnlSig(getDummySingleUpnlAndPriceSig(decimal(16n)))
					.build(),
			),
		).to.be.revertedWith("PartyAFacet: insufficient available balance")

		await expect(
			user.sendQuote(limitQuoteRequestBuilder().quantity(decimal(1600n)).cva(decimal(250n)).partyAmm(this.user_allocated).lf(decimal(60n)).build()),
		).to.be.revertedWith("PartyAFacet: insufficient available balance")
	})

	it("Should expire", async function () {
		let qId = await user.sendQuote(limitQuoteRequestBuilder().deadline(getBlockTimestamp(100n)).build())
		await expect(context.partyAFacet.expireQuote([qId])).to.be.revertedWith("LibQuote: Quote isn't expired")
		await time.increase(1000)
		await context.partyAFacet.expireQuote([1])
		expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(QuoteStatus.EXPIRED)
	})

	it("Should run successfully for limit", async function () {
		let validator = new SendQuoteValidator()
		const before = await validator.before(context, {user: user})
		let qId = await user.sendQuote()
		await validator.after(context, {user: user, quoteId: qId, beforeOutput: before})
	})

	it("Should run successfully for market", async function () {
		let validator = new SendQuoteValidator()
		const before = await validator.before(context, {user: user})
		let qId = await user.sendQuote(marketQuoteRequestBuilder().build())
		await validator.after(context, {user: user, quoteId: qId, beforeOutput: before})
	})

	it("Should fail on more sent quotes than the allowed range", async function () {
		let validPending = await context.viewFacet.pendingQuotesValidLength()
		while (true) {
			validPending = validPending - 1n
			await user.sendQuote()
			if (validPending == 0n) break
		}
		await expect(user.sendQuote()).to.be.revertedWith("PartyAFacet: Number of pending quotes out of range")
	})
}
