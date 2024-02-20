import { expect } from "chai"
import { BigNumber } from "ethers"

import { QuoteStructOutput } from "../../../src/types/contracts/facets/ViewFacet"
import { getTotalPartyALockedValuesForQuotes, getTotalPartyBLockedValuesForQuotes, unDecimal } from "../../utils/Common"
import { logger } from "../../utils/LoggerUtils"
import { PositionType, QuoteStatus } from "../Enums"
import { Hedger } from "../Hedger"
import { RunContext } from "../RunContext"
import { BalanceInfo, User } from "../User"
import { TransactionValidator } from "./TransactionValidator"
import { expectToBeApproximately } from "../../utils/SafeMath"

export type FillCloseRequestValidatorBeforeArg = {
	user: User
	quoteId: BigNumber
	hedger: Hedger
}

export type FillCloseRequestValidatorBeforeOutput = {
	balanceInfoPartyA: BalanceInfo
	balanceInfoPartyB: BalanceInfo
	quote: QuoteStructOutput
}

export type FillCloseRequestValidatorAfterArg = {
	user: User
	hedger: Hedger
	quoteId: BigNumber
	closePrice: BigNumber
	fillAmount: BigNumber
	beforeOutput: FillCloseRequestValidatorBeforeOutput
}

export class FillCloseRequestValidator implements TransactionValidator {
	async before(context: RunContext, arg: FillCloseRequestValidatorBeforeArg): Promise<FillCloseRequestValidatorBeforeOutput> {
		logger.debug("Before FillCloseRequestValidator...")
		return {
			balanceInfoPartyA: await arg.user.getBalanceInfo(),
			balanceInfoPartyB: await arg.hedger.getBalanceInfo(await arg.user.getAddress()),
			quote: await context.viewFacet.getQuote(arg.quoteId),
		}
	}

	async after(context: RunContext, arg: FillCloseRequestValidatorAfterArg) {
		logger.debug("After FillCloseRequestValidator...")
		// Check Quote
		const newQuote = await context.viewFacet.getQuote(arg.quoteId)
		const oldQuote = arg.beforeOutput.quote
		const zeroToClose = newQuote.quantityToClose.eq(0)
		const isFullyClosed = newQuote.quantity.eq(newQuote.closedAmount)

		if (isFullyClosed) {
			expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CLOSED)
		} else if (zeroToClose || newQuote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING) {
			expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.OPENED)
		} else {
			expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CLOSE_PENDING)
		}

		expect(newQuote.closedAmount).to.be.equal(oldQuote.closedAmount.add(arg.fillAmount))

		// TODO: Sometimes fillCloseRequest has Error

		expect(newQuote.quantityToClose).to.be.equal(oldQuote.quantityToClose.sub(arg.fillAmount))

		const oldLockedValuesPartyA = await getTotalPartyALockedValuesForQuotes([oldQuote])
		const newLockedValuesPartyA = await getTotalPartyALockedValuesForQuotes([newQuote])

		const oldLockedValuesPartyB = await getTotalPartyBLockedValuesForQuotes([oldQuote])
		const newLockedValuesPartyB = await getTotalPartyBLockedValuesForQuotes([newQuote])

		let profit
		if (newQuote.positionType == PositionType.LONG) {
			profit = unDecimal(arg.closePrice.sub(newQuote.openedPrice).mul(arg.fillAmount))
		} else {
			profit = unDecimal(newQuote.openedPrice.sub(arg.closePrice).mul(arg.fillAmount))
		}

		let returnedLockedValuesPartyA = oldLockedValuesPartyA.mul(arg.fillAmount).div(oldQuote.quantity)
		let returnedLockedValuesPartyB = oldLockedValuesPartyB.mul(arg.fillAmount).div(oldQuote.quantity)

		// Check Balances partyA
		const newBalanceInfoPartyA = await arg.user.getBalanceInfo()
		const oldBalanceInfoPartyA = arg.beforeOutput.balanceInfoPartyA

		expect(newBalanceInfoPartyA.totalPendingLockedPartyA).to.be.equal(oldBalanceInfoPartyA.totalPendingLockedPartyA.toString())
		expectToBeApproximately(newBalanceInfoPartyA.totalLockedPartyA, oldBalanceInfoPartyA.totalLockedPartyA.sub(returnedLockedValuesPartyA))
		expectToBeApproximately(newBalanceInfoPartyA.allocatedBalances, oldBalanceInfoPartyA.allocatedBalances.add(profit))

		// Check Balances partyB
		const newBalanceInfoPartyB = await arg.hedger.getBalanceInfo(await arg.user.getAddress())
		const oldBalanceInfoPartyB = arg.beforeOutput.balanceInfoPartyB

		expect(newBalanceInfoPartyB.totalPendingLockedPartyB).to.be.equal(oldBalanceInfoPartyB.totalPendingLockedPartyB.toString())
		expectToBeApproximately(newBalanceInfoPartyB.totalLockedPartyB, oldBalanceInfoPartyB.totalLockedPartyB.sub(returnedLockedValuesPartyB))
		expectToBeApproximately(newBalanceInfoPartyB.allocatedBalances, oldBalanceInfoPartyB.allocatedBalances.sub(profit))
	}
}
