import {expect} from "chai"

import {QuoteStatus} from "../Enums"
import {Hedger} from "../Hedger"
import {RunContext} from "../RunContext"
import {BalanceInfo, User} from "../User"
import {logger} from "../../utils/LoggerUtils"
import {TransactionValidator} from "./TransactionValidator"

export type LockQuoteValidatorBeforeArg = {
	user: User
}

export type LockQuoteValidatorBeforeOutput = {
	balanceInfoPartyA: BalanceInfo
}

export type LockQuoteValidatorAfterArg = {
	user: User
	hedger: Hedger
	quoteId: bigint
	beforeOutput: LockQuoteValidatorBeforeOutput
}

export class LockQuoteValidator implements TransactionValidator {
	async before(context: RunContext, arg: LockQuoteValidatorBeforeArg): Promise<LockQuoteValidatorBeforeOutput> {
		logger.debug("Before LockQuoteValidator...")
		return {
			balanceInfoPartyA: await arg.user.getBalanceInfo(),
		}
	}

	async after(context: RunContext, arg: LockQuoteValidatorAfterArg) {
		logger.debug("After LockQuoteValidator...")
		const newBalanceInfo = await arg.user.getBalanceInfo()
		const oldBalanceInfo = arg.beforeOutput.balanceInfoPartyA

		expect(newBalanceInfo.totalPendingLockedPartyA).to.be.equal(oldBalanceInfo.totalPendingLockedPartyA.toString())
		expect(newBalanceInfo.allocatedBalances).to.be.equal(oldBalanceInfo.allocatedBalances.toString())
		const quote = await context.viewFacet.getQuote(arg.quoteId)
		expect(quote.quoteStatus).to.be.equal(QuoteStatus.LOCKED)
		expect(quote.partyB).to.be.equal(await arg.hedger.getAddress())
	}
}
