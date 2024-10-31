import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers"

import {initializeFixture} from "./Initialize.fixture"
import {PositionType, QuoteStatus} from "./models/Enums"
import {Hedger} from "./models/Hedger"
import {RunContext} from "./models/RunContext"
import {User} from "./models/User"
import {limitCloseRequestBuilder} from "./models/requestModels/CloseRequest"
import {limitQuoteRequestBuilder} from "./models/requestModels/QuoteRequest"
import {decimal, getBlockTimestamp, getQuoteQuantity,} from "./utils/Common"
import {getDummyHighLowPriceSig, getDummySettlementSig} from "./utils/SignatureUtils"
import {QuoteStructOutput} from "../src/types/contracts/interfaces/ISymmio"
import {limitOpenRequestBuilder} from "./models/requestModels/OpenRequest"
import {QuoteSettlementDataStructOutput} from "../src/types/contracts/facets/Settlement/ISettlementFacet"
import {expect} from "chai"

export function shouldBehaveLikeSettleAndForceClosePosition(): void {
	let user: User, hedger: Hedger
	let context: RunContext
	let quote1LongOpened: QuoteStructOutput, quote2ShortOpened: QuoteStructOutput

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		this.user_allocated = decimal(500n)
		this.hedger_allocated = decimal(300n)

		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(2000n), decimal(1000n), this.user_allocated)

		hedger = new Hedger(context, context.signers.hedger)
		await hedger.setup()
		await hedger.setBalances(this.hedger_allocated, this.hedger_allocated)

		// Quote1 LONG opened
		quote1LongOpened = await context.viewFacet.getQuote(await user.sendQuote())
		await hedger.lockQuote(quote1LongOpened.id)
		await hedger.openPosition(quote1LongOpened.id)

		// Quote2 SHORT opened
		quote2ShortOpened = await context.viewFacet.getQuote(
			await user.sendQuote(
				limitQuoteRequestBuilder()
					.positionType(PositionType.SHORT)
					.quantity(decimal(75n))
					.build()
			)
		)
		await hedger.lockQuote(quote2ShortOpened.id)
		await hedger.openPosition(quote2ShortOpened.id, limitOpenRequestBuilder().filledAmount(decimal(75n)).build())

		await user.requestToClosePosition(
			quote1LongOpened.id,
			limitCloseRequestBuilder()
				.quantityToClose(await getQuoteQuantity(context, quote1LongOpened.id))
				.closePrice(decimal(5n))
				.deadline((await getBlockTimestamp()) + 1000n)
				.build(),
		)
		await user.requestToClosePosition(
			quote2ShortOpened.id,
			limitCloseRequestBuilder()
				.quantityToClose(await getQuoteQuantity(context, quote2ShortOpened.id))
				.closePrice(decimal(5n))
				.deadline((await getBlockTimestamp()) + 1000n)
				.build(),
		)
		await context.controlFacet.setForceCloseMinSigPeriod(10)
		await context.controlFacet.setForceCloseGapRatio((await context.viewFacet.getQuote(quote1LongOpened.id)).symbolId, decimal(1n, 17))

		quote1LongOpened = await context.viewFacet.getQuote(quote1LongOpened.id)
		quote2ShortOpened = await context.viewFacet.getQuote(quote2ShortOpened.id)
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

	it("Should settle and forceClose the quote", async function () {
		const sigTimes = await prepareSigTimes(100n)
		const highLowSig = await getDummyHighLowPriceSig(
			sigTimes[0],  // startTime
			sigTimes[1],  // endTime
			0n,           // lowest
			decimal(8n),  // highest
			decimal(6n),   // currentPrice
			decimal(5n),   // averagePrice
			quote1LongOpened.symbolId, // symbolId
			decimal(150n), // upnlPartyB
			0n             // upnlPartyA
		)
		const settlementSig = await getDummySettlementSig(0n, [150n], [
			{
				quoteId: quote2ShortOpened.id,
				currentPrice: decimal(7n),
				partyBUpnlIndex: 0n
			} as QuoteSettlementDataStructOutput,
		])
		await expect(
			user.settleAndForceClosePosition(quote1LongOpened.id, highLowSig, settlementSig, [])
		).to.be.revertedWith("LibQuote: PartyA should first exit its positions that are incurring losses")

		await user.settleAndForceClosePosition(quote1LongOpened.id, highLowSig, settlementSig, [decimal(5n)])

		expect((await context.viewFacet.getQuote(quote1LongOpened.id)).quoteStatus).to.be.eq(QuoteStatus.CLOSED)
		expect((await context.viewFacet.getQuote(quote2ShortOpened.id)).openedPrice).to.be.eq(decimal(5n))
	})
}
