import {expect} from "chai"

import {getTotalLockedValuesForQuoteIds, getTradingFeeForQuotes} from "../../utils/Common"
import {logger} from "../../utils/LoggerUtils"
import {QuoteStatus} from "../Enums"
import {RunContext} from "../RunContext"
import {BalanceInfo, User} from "../User"
import {TransactionValidator} from "./TransactionValidator"

export type SendQuoteValidatorBeforeArg = {
	user: User
}

export type SendQuoteValidatorBeforeOutput = {
	balanceInfoPartyA: BalanceInfo
}

export type SendQuoteValidatorAfterArg = {
	user: User
	quoteId: bigint
	beforeOutput: SendQuoteValidatorBeforeOutput
}

export class SendQuoteValidator implements TransactionValidator {
	async before(context: RunContext, arg: SendQuoteValidatorBeforeArg): Promise<SendQuoteValidatorBeforeOutput> {
		logger.debug("Before SendQuoteValidator...")
		return {
			balanceInfoPartyA: await arg.user.getBalanceInfo(),
		}
	}

	async after(context: RunContext, arg: SendQuoteValidatorAfterArg) {
		logger.debug("After SendQuoteValidator...")
		const newBalanceInfo = await arg.user.getBalanceInfo()
		const oldBalanceInfo = arg.beforeOutput.balanceInfoPartyA

		expect(newBalanceInfo.totalPendingLockedPartyA).to.be.equal(
			(oldBalanceInfo.totalPendingLockedPartyA + await getTotalLockedValuesForQuoteIds(context, [arg.quoteId])).toString(),
		)
		expect(newBalanceInfo.allocatedBalances).to.be.equal((oldBalanceInfo.allocatedBalances - await getTradingFeeForQuotes(context, [arg.quoteId])))
		expect((await context.viewFacet.getQuote(arg.quoteId)).quoteStatus).to.be.equal(QuoteStatus.PENDING)
	}
}
