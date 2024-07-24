import {expect} from "chai"
import {QuoteStructOutput} from "../../../src/types/contracts/interfaces/ISymmio"
import {getTotalPartyALockedValuesForQuotes, getTotalPartyBLockedValuesForQuotes, unDecimal} from "../../utils/Common"
import {logger} from "../../utils/LoggerUtils"
import {expectToBeApproximately} from "../../utils/SafeMath"
import {PositionType, QuoteStatus} from "../Enums"
import {Hedger} from "../Hedger"
import {RunContext} from "../RunContext"
import {BalanceInfo, User} from "../User"
import {TransactionValidator} from "./TransactionValidator"

export type FillCloseRequestValidatorBeforeArg = {
	user: User
	quoteId: bigint
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
	quoteId: bigint
	closePrice: bigint
	fillAmount: bigint
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
		const zeroToClose = newQuote.quantityToClose === 0n
		const isFullyClosed = newQuote.quantity === newQuote.closedAmount

		if (isFullyClosed) {
			expect(newQuote.quoteStatus).to.equal(QuoteStatus.CLOSED)
		} else if (zeroToClose || newQuote.quoteStatus === BigInt(QuoteStatus.CANCEL_CLOSE_PENDING)) {
			expect(newQuote.quoteStatus).to.equal(QuoteStatus.OPENED)
		} else {
			expect(newQuote.quoteStatus).to.equal(QuoteStatus.CLOSE_PENDING)
		}

		expect(newQuote.closedAmount.toString()).to.equal((BigInt(oldQuote.closedAmount) + BigInt(arg.fillAmount)).toString())

// TODO: Sometimes fillCloseRequest has Error

		expect(newQuote.quantityToClose.toString()).to.equal((BigInt(oldQuote.quantityToClose) - BigInt(arg.fillAmount)).toString())

		const oldLockedValuesPartyA = await getTotalPartyALockedValuesForQuotes([oldQuote])
		const newLockedValuesPartyA = await getTotalPartyALockedValuesForQuotes([newQuote])

		const oldLockedValuesPartyB = await getTotalPartyBLockedValuesForQuotes([oldQuote])
		const newLockedValuesPartyB = await getTotalPartyBLockedValuesForQuotes([newQuote])

		let profit
		if (newQuote.positionType === BigInt(PositionType.LONG)) {
			profit = unDecimal((BigInt(arg.closePrice) - BigInt(newQuote.openedPrice)) * BigInt(arg.fillAmount))
		} else {
			profit = unDecimal((BigInt(newQuote.openedPrice) - BigInt(arg.closePrice)) * BigInt(arg.fillAmount))
		}

		const returnedLockedValuesPartyA = (BigInt(oldLockedValuesPartyA) * BigInt(arg.fillAmount)) / BigInt(oldQuote.quantity)
		const returnedLockedValuesPartyB = (BigInt(oldLockedValuesPartyB) * BigInt(arg.fillAmount)) / BigInt(oldQuote.quantity)

// Check Balances partyA
		const newBalanceInfoPartyA = await arg.user.getBalanceInfo()
		const oldBalanceInfoPartyA = arg.beforeOutput.balanceInfoPartyA

		expect(newBalanceInfoPartyA.totalPendingLockedPartyA.toString()).to.equal(oldBalanceInfoPartyA.totalPendingLockedPartyA.toString())
		expectToBeApproximately(BigInt(newBalanceInfoPartyA.totalLockedPartyA), BigInt(oldBalanceInfoPartyA.totalLockedPartyA) - returnedLockedValuesPartyA)
		expectToBeApproximately(BigInt(newBalanceInfoPartyA.allocatedBalances), BigInt(oldBalanceInfoPartyA.allocatedBalances) + profit)

// Check Balances partyB
		const newBalanceInfoPartyB = await arg.hedger.getBalanceInfo(await arg.user.getAddress())
		const oldBalanceInfoPartyB = arg.beforeOutput.balanceInfoPartyB

		expect(newBalanceInfoPartyB.totalPendingLockedPartyB.toString()).to.equal(oldBalanceInfoPartyB.totalPendingLockedPartyB.toString())
		expectToBeApproximately(BigInt(newBalanceInfoPartyB.totalLockedPartyB), BigInt(oldBalanceInfoPartyB.totalLockedPartyB) - returnedLockedValuesPartyB)
		expectToBeApproximately(BigInt(newBalanceInfoPartyB.allocatedBalances), BigInt(oldBalanceInfoPartyB.allocatedBalances) - profit)

	}
}
