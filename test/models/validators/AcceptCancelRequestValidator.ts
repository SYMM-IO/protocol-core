import { expect } from "chai"
import { BigNumber } from "ethers"

import { QuoteStructOutput } from "../../../src/types/contracts/interfaces/ISymmio"
import { getTotalPartyALockedValuesForQuotes, getTradingFeeForQuotes } from "../../utils/Common"
import { logger } from "../../utils/LoggerUtils"
import { expectToBeApproximately } from "../../utils/SafeMath"
import { QuoteStatus } from "../Enums"
import { RunContext } from "../RunContext"
import { BalanceInfo, User } from "../User"
import { TransactionValidator } from "./TransactionValidator"

export type AcceptCancelRequestValidatorBeforeArg = {
	user: User
	quoteId: BigNumber
}

export type AcceptCancelRequestValidatorBeforeOutput = {
	balanceInfoPartyA: BalanceInfo
	quote: QuoteStructOutput
}

export type AcceptCancelRequestValidatorAfterArg = {
	user: User
	quoteId: BigNumber
	beforeOutput: AcceptCancelRequestValidatorBeforeOutput
}

export class AcceptCancelRequestValidator implements TransactionValidator {
	async before(context: RunContext, arg: AcceptCancelRequestValidatorBeforeArg): Promise<AcceptCancelRequestValidatorBeforeOutput> {
		logger.debug("Before AcceptCancelRequestValidator...")
		return {
			balanceInfoPartyA: await arg.user.getBalanceInfo(),
			quote: await context.viewFacet.getQuote(arg.quoteId),
		}
	}

	async after(context: RunContext, arg: AcceptCancelRequestValidatorAfterArg) {
		logger.debug("After AcceptCancelRequestValidator...")
		// Check Quote
		const newQuote = await context.viewFacet.getQuote(arg.quoteId)
		const oldQuote = arg.beforeOutput.quote
		expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CANCELED)

		// Check Balances partyA
		const newBalanceInfoPartyA = await arg.user.getBalanceInfo()
		const oldBalanceInfoPartyA = arg.beforeOutput.balanceInfoPartyA

		const lockedValues = await getTotalPartyALockedValuesForQuotes([oldQuote])

		expect(newBalanceInfoPartyA.totalPendingLockedPartyA).to.be.equal(oldBalanceInfoPartyA.totalPendingLockedPartyA.sub(lockedValues).toString())
		expect(newBalanceInfoPartyA.totalLockedPartyA).to.be.equal(oldBalanceInfoPartyA.totalLockedPartyA.toString())
		let tradingFee = await getTradingFeeForQuotes(context, [arg.quoteId])
		expectToBeApproximately(newBalanceInfoPartyA.allocatedBalances, oldBalanceInfoPartyA.allocatedBalances.add(tradingFee))
	}
}
