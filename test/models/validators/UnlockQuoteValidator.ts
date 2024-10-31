import {expect} from "chai"

import {QuoteStatus} from "../Enums"
import {RunContext} from "../RunContext"
import {BalanceInfo, User} from "../User"
import {TransactionValidator} from "./TransactionValidator"
import {logger} from "../../utils/LoggerUtils"
import {ethers} from "hardhat"

export type UnlockQuoteValidatorBeforeArg = {
	user: User
}

export type UnlockQuoteValidatorBeforeOutput = {
	balanceInfoPartyA: BalanceInfo
}

export type UnlockQuoteValidatorAfterArg = {
	user: User
	quoteId: bigint
	beforeOutput: UnlockQuoteValidatorBeforeOutput
}

export class UnlockQuoteValidator implements TransactionValidator {
	async before(context: RunContext, arg: UnlockQuoteValidatorBeforeArg): Promise<UnlockQuoteValidatorBeforeOutput> {
		logger.debug("Before UnlockQuoteValidator...")
		return {
			balanceInfoPartyA: await arg.user.getBalanceInfo(),
		}
	}

	async after(context: RunContext, arg: UnlockQuoteValidatorAfterArg) {
		logger.debug("After UnlockQuoteValidator...")
		const newBalanceInfo = await arg.user.getBalanceInfo()
		const oldBalanceInfo = arg.beforeOutput.balanceInfoPartyA
		expect(newBalanceInfo.totalPendingLockedPartyA).to.be.equal(oldBalanceInfo.totalPendingLockedPartyA.toString())
		expect(newBalanceInfo.allocatedBalances).to.be.equal(oldBalanceInfo.allocatedBalances.toString())

		const quote = await context.viewFacet.getQuote(arg.quoteId)
		expect(quote.quoteStatus).to.be.equal(QuoteStatus.PENDING)
		expect(quote.partyB).to.be.equal(ethers.ZeroAddress)
	}
}
