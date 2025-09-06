import {expect} from "chai"

import {QuoteStructOutput} from "../../../src/types/contracts/interfaces/ISymmio"
import {getTotalPartyALockedValuesForQuotes, getTradingFeeForQuotes} from "../../utils/Common"
import {logger} from "../../utils/LoggerUtils"
import {expectToBeApproximately} from "../../utils/SafeMath"
import {QuoteStatus} from "../Enums"
import {RunContext} from "../RunContext"
import {BalanceInfo, User} from "../User"
import {TransactionValidator} from "./TransactionValidator"

export type CancelQuoteValidatorBeforeArg = {
	user: User
	quoteId: bigint
}

export type CancelQuoteValidatorBeforeOutput = {
	balanceInfoPartyA: BalanceInfo
	quote: QuoteStructOutput
}

export type CancelQuoteValidatorAfterArg = {
	user: User
	quoteId: bigint
	targetStatus?: QuoteStatus.CANCELED | QuoteStatus.EXPIRED
	beforeOutput: CancelQuoteValidatorBeforeOutput
}

export class CancelQuoteValidator implements TransactionValidator {
	async before(context: RunContext, arg: CancelQuoteValidatorBeforeArg): Promise<CancelQuoteValidatorBeforeOutput> {
		logger.debug("Before CancelQuoteValidator...")
		return {
			balanceInfoPartyA: await arg.user.getBalanceInfo(),
			quote: await context.viewFacet.getQuote(arg.quoteId),
		}
	}

	async after(context: RunContext, arg: CancelQuoteValidatorAfterArg) {
		logger.debug("After CancelQuoteValidator...")
		// Check Quote
		const newQuote = await context.viewFacet.getQuote(arg.quoteId)
		const oldQuote = arg.beforeOutput.quote

		const newBalanceInfoPartyA = await arg.user.getBalanceInfo()
		const oldBalanceInfoPartyA = arg.beforeOutput.balanceInfoPartyA

		if (oldQuote.quoteStatus == BigInt(QuoteStatus.LOCKED)) {
			expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CANCEL_PENDING)
			expect(newBalanceInfoPartyA.totalPendingLockedPartyA).to.be.equal(oldBalanceInfoPartyA.totalPendingLockedPartyA.toString())
			expect(newBalanceInfoPartyA.totalLockedPartyA).to.be.equal(oldBalanceInfoPartyA.totalLockedPartyA.toString())
			expect(newBalanceInfoPartyA.allocatedBalances).to.be.equal(oldBalanceInfoPartyA.allocatedBalances.toString())
			return
		}
		if (arg.targetStatus != null) expect(newQuote.quoteStatus).to.be.equal(arg.targetStatus)

		const lockedValues = await getTotalPartyALockedValuesForQuotes([oldQuote])

		expect(newBalanceInfoPartyA.totalPendingLockedPartyA.toString()).to.equal((oldBalanceInfoPartyA.totalPendingLockedPartyA - lockedValues).toString())
		expect(newBalanceInfoPartyA.totalLockedPartyA.toString()).to.equal(oldBalanceInfoPartyA.totalLockedPartyA.toString())
		const tradingFee = await getTradingFeeForQuotes(context, [arg.quoteId])
		expectToBeApproximately(BigInt(newBalanceInfoPartyA.allocatedBalances), BigInt(oldBalanceInfoPartyA.allocatedBalances) + BigInt(tradingFee))

	}
}
