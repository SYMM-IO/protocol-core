import { expect } from "chai"
import { BigNumber } from "ethers"

import { QuoteStructOutput } from "../../../src/types/contracts/interfaces/ISymmio"
import { logger } from "../../utils/LoggerUtils"
import { QuoteStatus } from "../Enums"
import { Hedger } from "../Hedger"
import { RunContext } from "../RunContext"
import { BalanceInfo, User } from "../User"
import { TransactionValidator } from "./TransactionValidator"

export type AcceptCancelCloseRequestValidatorBeforeArg = {
	user: User
	hedger: Hedger
	quoteId: BigNumber
}

export type AcceptCancelCloseRequestValidatorBeforeOutput = {
	balanceInfoPartyA: BalanceInfo
	balanceInfoPartyB: BalanceInfo
	quote: QuoteStructOutput
}

export type AcceptCancelCloseRequestValidatorAfterArg = {
	user: User
	hedger: Hedger
	quoteId: BigNumber
	beforeOutput: AcceptCancelCloseRequestValidatorBeforeOutput
}

export class AcceptCancelCloseRequestValidator implements TransactionValidator {
	async before(context: RunContext, arg: AcceptCancelCloseRequestValidatorBeforeArg): Promise<AcceptCancelCloseRequestValidatorBeforeOutput> {
		logger.debug("Before AcceptCancelCloseRequestValidator...")
		return {
			balanceInfoPartyA: await arg.user.getBalanceInfo(),
			balanceInfoPartyB: await arg.hedger.getBalanceInfo(await arg.user.getAddress()),
			quote: await context.viewFacet.getQuote(arg.quoteId),
		}
	}

	async after(context: RunContext, arg: AcceptCancelCloseRequestValidatorAfterArg) {
		logger.debug("After AcceptCancelCloseRequestValidator...")
		// Check Quote
		const newQuote = await context.viewFacet.getQuote(arg.quoteId)
		const oldQuote = arg.beforeOutput.quote
		expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.OPENED)
		expect(newQuote.quantityToClose).to.be.equal(BigNumber.from(0).toString())

		// Check Balances partyA
		const newBalanceInfoPartyA = await arg.user.getBalanceInfo()
		const oldBalanceInfoPartyA = arg.beforeOutput.balanceInfoPartyA

		expect(newBalanceInfoPartyA.totalPendingLockedPartyA).to.be.equal(oldBalanceInfoPartyA.totalPendingLockedPartyA.toString())
		expect(newBalanceInfoPartyA.totalLockedPartyA).to.be.equal(oldBalanceInfoPartyA.totalLockedPartyA.toString())
		expect(newBalanceInfoPartyA.allocatedBalances).to.be.equal(oldBalanceInfoPartyA.allocatedBalances.toString())

		// Check Balances partyB
		const newBalanceInfoPartyB = await arg.hedger.getBalanceInfo(await arg.user.getAddress())
		const oldBalanceInfoPartyB = arg.beforeOutput.balanceInfoPartyB

		expect(newBalanceInfoPartyB.totalPendingLockedPartyB).to.be.equal(oldBalanceInfoPartyB.totalPendingLockedPartyB.toString())
		expect(newBalanceInfoPartyB.totalLockedPartyB).to.be.equal(oldBalanceInfoPartyB.totalLockedPartyB.toString())
		expect(newBalanceInfoPartyB.allocatedBalances).to.be.equal(oldBalanceInfoPartyB.allocatedBalances.toString())
	}
}
