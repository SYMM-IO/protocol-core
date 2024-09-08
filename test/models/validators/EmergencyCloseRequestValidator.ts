import { expect } from "chai"
import { BigNumber } from "ethers"

import { QuoteStructOutput } from "../../../src/types/contracts/interfaces/ISymmio"
import { getTotalPartyALockedValuesForQuotes, getTotalPartyBLockedValuesForQuotes, unDecimal } from "../../utils/Common"
import { logger } from "../../utils/LoggerUtils"
import { expectToBeApproximately } from "../../utils/SafeMath"
import { PositionType, QuoteStatus } from "../Enums"
import { Hedger } from "../Hedger"
import { RunContext } from "../RunContext"
import { BalanceInfo, User } from "../User"
import { TransactionValidator } from "./TransactionValidator"

export type EmergencyCloseRequestValidatorBeforeArg = {
	user: User
	quoteId: BigNumber
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
	quoteId: BigNumber
	price: BigNumber
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

		const closedAmount = newQuote.closedAmount.sub(oldQuote.closedAmount)
		let profit
		if (newQuote.positionType == PositionType.LONG) {
			profit = unDecimal(arg.price.sub(newQuote.openedPrice).mul(closedAmount))
		} else {
			profit = unDecimal(newQuote.openedPrice.sub(arg.price).mul(closedAmount))
		}

		let returnedLockedValuesPartyA = oldLockedValuesPartyA.mul(closedAmount).div(oldQuote.quantity)
		let returnedLockedValuesPartyB = oldLockedValuesPartyB.mul(closedAmount).div(oldQuote.quantity)

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
