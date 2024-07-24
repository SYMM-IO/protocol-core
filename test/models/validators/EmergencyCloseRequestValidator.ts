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

export type EmergencyCloseRequestValidatorBeforeArg = {
	user: User
	quoteId: bigint
	hedger: Hedger
}

export type EmergencyCloseRequestValidatorBeforeOutput = {
	balanceInfoPartyA: BalanceInfo
	balanceInfoPartyB: BalanceInfo
	quote: QuoteStructOutput
}

export type EmergencyCloseRequestValidatorAfterArg = {
	user: User
	hedger: Hedger
	quoteId: bigint
	price: bigint
	beforeOutput: EmergencyCloseRequestValidatorBeforeOutput
}

export class EmergencyCloseRequestValidator implements TransactionValidator {
	async before(context: RunContext, arg: EmergencyCloseRequestValidatorBeforeArg): Promise<EmergencyCloseRequestValidatorBeforeOutput> {
		logger.debug("Before EmergencyCloseRequestValidator...")
		return {
			balanceInfoPartyA: await arg.user.getBalanceInfo(),
			balanceInfoPartyB: await arg.hedger.getBalanceInfo(await arg.user.getAddress()),
			quote: await context.viewFacet.getQuote(arg.quoteId),
		}
	}

	async after(context: RunContext, arg: EmergencyCloseRequestValidatorAfterArg) {
		logger.debug("After EmergencyCloseRequestValidator...")
		// Check Quote
		const newQuote = await context.viewFacet.getQuote(arg.quoteId)
		const oldQuote = arg.beforeOutput.quote

		expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CLOSED)
		expect(newQuote.closedAmount).to.be.equal(oldQuote.quantity)

		const oldLockedValuesPartyA = await getTotalPartyALockedValuesForQuotes([oldQuote])
		const newLockedValuesPartyA = await getTotalPartyALockedValuesForQuotes([newQuote])

		const oldLockedValuesPartyB = await getTotalPartyBLockedValuesForQuotes([oldQuote])
		const newLockedValuesPartyB = await getTotalPartyBLockedValuesForQuotes([newQuote])

		const closedAmount = BigInt(newQuote.closedAmount) - BigInt(oldQuote.closedAmount)
		let profit
		if (newQuote.positionType === BigInt(PositionType.LONG)) {
			profit = unDecimal((BigInt(arg.price) - BigInt(newQuote.openedPrice)) * closedAmount)
		} else {
			profit = unDecimal((BigInt(newQuote.openedPrice) - BigInt(arg.price)) * closedAmount)
		}

		const returnedLockedValuesPartyA = (BigInt(oldLockedValuesPartyA) * closedAmount) / BigInt(oldQuote.quantity)
		const returnedLockedValuesPartyB = (BigInt(oldLockedValuesPartyB) * closedAmount) / BigInt(oldQuote.quantity)

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
