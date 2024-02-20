import { BigNumber } from "ethers"
import { BalanceInfo, User } from "../User"
import { Hedger } from "../Hedger"
import { QuoteStructOutput } from "../../../src/types/contracts/facets/ViewFacet"
import { RunContext } from "../RunContext"
import { TransactionValidator } from "./TransactionValidator"
import { logger } from "../../utils/LoggerUtils"
import { expect } from "chai"
import { OrderType, PositionType, QuoteStatus } from "../Enums"
import { decimal, getBlockTimestamp, unDecimal } from "../../utils/Common"
import { expectToBeApproximately } from "../../utils/SafeMath"

export type ForceClosePositionValidatorBeforeArg = {
	user: User
	quoteId: BigNumber
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
	quoteId: BigNumber
	sig: {
		lowestPrice: BigNumber
		highestPrice: BigNumber
		averagePrice: BigNumber
		currentPrice: BigNumber
		endTime: BigNumber
		startTime: BigNumber
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
		const coolDownsOfMA = await context.viewFacet.coolDownsOfMA()
		const forceCloseFirstCooldown = coolDownsOfMA[3]
		const forceCloseSecondCooldown = coolDownsOfMA[4]
		const forceCloseMinSigPeriod = await context.viewFacet.forceCloseMinSigPeriod()
		const partyBBalanceInfo = arg.hedger.getBalanceInfo(await arg.user.getAddress())
		const isPartyBLiquidated = (await partyBBalanceInfo).allocatedBalances == BigNumber.from(0)

		let closePrice: BigNumber

		expect(newQuote.quoteStatus).to.be.equal(isPartyBLiquidated ? QuoteStatus.CLOSE_PENDING : QuoteStatus.CLOSED)
		expect(newQuote.orderType).to.be.equal(OrderType.LIMIT)
		// check the Final ClosePrice (Long and Short)
		if (newQuote.positionType == PositionType.LONG) {
			const expectClosePrice = oldQuote.requestedClosePrice.add(oldQuote.requestedClosePrice.mul(penalty).div(decimal(1) /* 1e18 */))

			closePrice = expectClosePrice > arg.sig.averagePrice ? expectClosePrice : arg.sig.averagePrice

			const expectedAvgClosedPrice = oldQuote.avgClosedPrice
				.mul(oldQuote.closedAmount)
				.add(oldQuote.quantityToClose.mul(closePrice))
				.div(oldQuote.closedAmount.add(oldQuote.quantityToClose))

			expectToBeApproximately(newQuote.avgClosedPrice, expectedAvgClosedPrice)
		} else {
			//SHORT
			const expectClosePrice = oldQuote.requestedClosePrice.sub(oldQuote.requestedClosePrice.mul(penalty).div(decimal(1) /* 1e18 */))

			closePrice = expectClosePrice > arg.sig.averagePrice ? arg.sig.averagePrice : expectClosePrice

			const expectedAvgClosedPrice = oldQuote.avgClosedPrice
				.mul(oldQuote.closedAmount)
				.add(oldQuote.quantityToClose.mul(closePrice))
				.div(oldQuote.closedAmount.add(oldQuote.quantityToClose))

			expectToBeApproximately(newQuote.avgClosedPrice, expectedAvgClosedPrice)
		}
		//check CoolDown(start and End Time)
		expect(arg.sig.startTime).to.be.least(oldQuote.statusModifyTimestamp.add(forceCloseFirstCooldown))
		expect(arg.sig.endTime).to.be.most(BigNumber.from(await getBlockTimestamp()).sub(forceCloseSecondCooldown))

		let profit
		if (newQuote.positionType == PositionType.LONG) {
			profit = unDecimal(newQuote.avgClosedPrice.sub(newQuote.openedPrice).mul(newQuote.closedAmount))
		} else {
			profit = unDecimal(newQuote.openedPrice.sub(newQuote.avgClosedPrice).mul(newQuote.closedAmount))
		}

		//check partyA balance
		const newBalanceInfoPartyA = await arg.user.getBalanceInfo()
		const oldBalanceInfoPartyA = arg.beforeOutput.balanceInfoPartyA

		expect(newBalanceInfoPartyA.totalPendingLockedPartyA).to.be.equal(oldBalanceInfoPartyA.totalPendingLockedPartyA.toString())

		expectToBeApproximately(newBalanceInfoPartyA.allocatedBalances, oldBalanceInfoPartyA.allocatedBalances.add(profit))

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
