import {expect} from "chai"
import {QuoteStructOutput} from "../../../src/types/contracts/interfaces/ISymmio"
import {decimal, getBlockTimestamp, unDecimal} from "../../utils/Common"
import {logger} from "../../utils/LoggerUtils"
import {expectToBeApproximately} from "../../utils/SafeMath"
import {OrderType, PositionType, QuoteStatus} from "../Enums"
import {Hedger} from "../Hedger"
import {RunContext} from "../RunContext"
import {BalanceInfo, User} from "../User"
import {TransactionValidator} from "./TransactionValidator"

export type ForceClosePositionValidatorBeforeArg = {
	user: User
	quoteId: bigint
	hedger: Hedger
}

export type ForceClosePositionValidatorBeforeOutput = {
	balanceInfoPartyA: BalanceInfo
	balanceInfoPartyB: BalanceInfo
	quote: QuoteStructOutput
}

export type ForceClosePositionValidatorAfterArg = {
	user: User
	hedger: Hedger
	quoteId: bigint
	sig: {
		lowestPrice: bigint
		highestPrice: bigint
		averagePrice: bigint
		currentPrice: bigint
		endTime: bigint
		startTime: bigint
	}
	beforeOutput: ForceClosePositionValidatorBeforeOutput
}

export class ForceClosePositionValidator implements TransactionValidator {
	async before(context: RunContext, arg: ForceClosePositionValidatorBeforeArg): Promise<ForceClosePositionValidatorBeforeOutput> {
		logger.debug("Before ForceClosePositionValidator...")
		return {
			balanceInfoPartyA: await arg.user.getBalanceInfo(),
			balanceInfoPartyB: await arg.hedger.getBalanceInfo(await arg.user.getAddress()),
			quote: await context.viewFacet.getQuote(arg.quoteId),
		}
	}

	async after(context: RunContext, arg: ForceClosePositionValidatorAfterArg) {
		logger.debug("After ForceClosePositionValidator...")
		// Check Quote
		const newQuote = await context.viewFacet.getQuote(arg.quoteId)
		const oldQuote = arg.beforeOutput.quote
		const penalty = await context.viewFacet.forceClosePricePenalty()
		const coolDownsOfMA = await context.viewFacet.forceCloseCooldowns()
		const forceCloseFirstCooldown = coolDownsOfMA[0]
		const forceCloseSecondCooldown = coolDownsOfMA[1]
		const forceCloseMinSigPeriod = await context.viewFacet.forceCloseMinSigPeriod()
		const partyBBalanceInfo = arg.hedger.getBalanceInfo(await arg.user.getAddress())
		const isPartyBLiquidated = (await partyBBalanceInfo).allocatedBalances == BigInt(0)

		let closePrice: bigint

		expect(newQuote.quoteStatus).to.be.equal(isPartyBLiquidated ? QuoteStatus.CLOSE_PENDING : QuoteStatus.CLOSED)
		expect(newQuote.orderType).to.be.equal(OrderType.LIMIT)
		// check the Final ClosePrice (Long and Short)
		if (newQuote.positionType === BigInt(PositionType.LONG)) {
			const expectClosePrice = BigInt(oldQuote.requestedClosePrice) + (BigInt(oldQuote.requestedClosePrice) * BigInt(penalty) / BigInt(decimal(1n)))

			closePrice = expectClosePrice > BigInt(arg.sig.averagePrice) ? expectClosePrice : BigInt(arg.sig.averagePrice)

			const expectedAvgClosedPrice = (BigInt(oldQuote.avgClosedPrice) * BigInt(oldQuote.closedAmount) +
					BigInt(oldQuote.quantityToClose) * closePrice) /
				(BigInt(oldQuote.closedAmount) + BigInt(oldQuote.quantityToClose))

			expectToBeApproximately(BigInt(newQuote.avgClosedPrice), expectedAvgClosedPrice)
		} else {
			//SHORT
			const expectClosePrice = BigInt(oldQuote.requestedClosePrice) - (BigInt(oldQuote.requestedClosePrice) * BigInt(penalty) / BigInt(decimal(1n)))

			closePrice = expectClosePrice > BigInt(arg.sig.averagePrice) ? BigInt(arg.sig.averagePrice) : expectClosePrice

			const expectedAvgClosedPrice = (BigInt(oldQuote.avgClosedPrice) * BigInt(oldQuote.closedAmount) +
					BigInt(oldQuote.quantityToClose) * closePrice) /
				(BigInt(oldQuote.closedAmount) + BigInt(oldQuote.quantityToClose))

			expectToBeApproximately(BigInt(newQuote.avgClosedPrice), expectedAvgClosedPrice)
		}

// Check CoolDown (start and End Time)
		expect(BigInt(arg.sig.startTime)).to.be.at.least(BigInt(oldQuote.statusModifyTimestamp) + BigInt(forceCloseFirstCooldown))
		expect(BigInt(arg.sig.endTime)).to.be.at.most(BigInt(await getBlockTimestamp()) - BigInt(forceCloseSecondCooldown))

		let profit
		if (newQuote.positionType === BigInt(PositionType.LONG)) {
			profit = unDecimal((BigInt(newQuote.avgClosedPrice) - BigInt(newQuote.openedPrice)) * BigInt(newQuote.closedAmount))
		} else {
			profit = unDecimal((BigInt(newQuote.openedPrice) - BigInt(newQuote.avgClosedPrice)) * BigInt(newQuote.closedAmount))
		}

// Check partyA balance
		const newBalanceInfoPartyA = await arg.user.getBalanceInfo()
		const oldBalanceInfoPartyA = arg.beforeOutput.balanceInfoPartyA

		expect(newBalanceInfoPartyA.totalPendingLockedPartyA.toString()).to.equal(oldBalanceInfoPartyA.totalPendingLockedPartyA.toString())
		expectToBeApproximately(BigInt(newBalanceInfoPartyA.allocatedBalances), BigInt(oldBalanceInfoPartyA.allocatedBalances) + profit)

		// check partyB liquidation
		if (isPartyBLiquidated) {
			const partyBBalanceInfo = await arg.hedger.getBalanceInfo(await arg.user.getAddress())
			expect(partyBBalanceInfo.allocatedBalances).to.be.equal(0)
		} else {
			// check closeQuote
			expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CLOSED)
			expect(newQuote.requestedClosePrice).to.be.equal(0)
		}
	}
}
