import { expect } from "chai";
import { BigNumber } from "ethers";

import { QuoteStructOutput } from "../../../src/types/contracts/facets/ViewFacet";
import { getTotalLockedValuesForQuotes, unDecimal } from "../../utils/Common";
import { logger } from "../../utils/LoggerUtils";
import { PositionType, QuoteStatus } from "../Enums";
import { Hedger } from "../Hedger";
import { RunContext } from "../RunContext";
import { BalanceInfo, User } from "../User";
import { TransactionValidator } from "./TransactionValidator";
import { expectToBeApproximately } from "../../utils/SafeMath";

export type EmergencyCloseRequestValidatorBeforeArg = {
  user: User;
  quoteId: BigNumber;
  hedger: Hedger;
};

export type EmergencyCloseRequestValidatorBeforeOutput = {
  balanceInfoPartyA: BalanceInfo;
  balanceInfoPartyB: BalanceInfo;
  quote: QuoteStructOutput;
};

export type EmergencyCloseRequestValidatorAfterArg = {
  user: User;
  hedger: Hedger;
  quoteId: BigNumber;
  price: BigNumber;
  beforeOutput: EmergencyCloseRequestValidatorBeforeOutput;
};

export class EmergencyCloseRequestValidator implements TransactionValidator {
  async before(
    context: RunContext,
    arg: EmergencyCloseRequestValidatorBeforeArg,
  ): Promise<EmergencyCloseRequestValidatorBeforeOutput> {
    logger.debug("Before EmergencyCloseRequestValidator...");
    return {
      balanceInfoPartyA: await arg.user.getBalanceInfo(),
      balanceInfoPartyB: await arg.hedger.getBalanceInfo(await arg.user.getAddress()),
      quote: await context.viewFacet.getQuote(arg.quoteId),
    };
  }

  async after(context: RunContext, arg: EmergencyCloseRequestValidatorAfterArg) {
    logger.debug("After EmergencyCloseRequestValidator...");
    // Check Quote
    const newQuote = await context.viewFacet.getQuote(arg.quoteId);
    const oldQuote = arg.beforeOutput.quote;

    expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CLOSED);
    expect(newQuote.closedAmount).to.be.equal(oldQuote.quantity);

    const oldLockedValues = await getTotalLockedValuesForQuotes([oldQuote]);
    const newLockedValues = await getTotalLockedValuesForQuotes([newQuote]);

    const closedAmount = newQuote.closedAmount.sub(oldQuote.closedAmount);
    let profit;
    if (newQuote.positionType == PositionType.LONG) {
      profit = unDecimal(arg.price.sub(newQuote.openedPrice).mul(closedAmount));
    } else {
      profit = unDecimal(newQuote.openedPrice.sub(arg.price).mul(closedAmount));
    }

    let returnedLockedValues = oldLockedValues.mul(closedAmount).div(oldQuote.quantity);

    // Check Balances partyA
    const newBalanceInfoPartyA = await arg.user.getBalanceInfo();
    const oldBalanceInfoPartyA = arg.beforeOutput.balanceInfoPartyA;

    expect(newBalanceInfoPartyA.totalPendingLocked).to.be.equal(
      oldBalanceInfoPartyA.totalPendingLocked.toString(),
    );
    expectToBeApproximately(
      newBalanceInfoPartyA.totalLocked,
      oldBalanceInfoPartyA.totalLocked.sub(returnedLockedValues),
    );
    expectToBeApproximately(
      newBalanceInfoPartyA.allocatedBalances,
      oldBalanceInfoPartyA.allocatedBalances.add(profit),
    );

    // Check Balances partyB
    const newBalanceInfoPartyB = await arg.hedger.getBalanceInfo(await arg.user.getAddress());
    const oldBalanceInfoPartyB = arg.beforeOutput.balanceInfoPartyB;

    expect(newBalanceInfoPartyB.totalPendingLocked).to.be.equal(
      oldBalanceInfoPartyB.totalPendingLocked.toString(),
    );
    expectToBeApproximately(
      newBalanceInfoPartyB.totalLocked,
      oldBalanceInfoPartyB.totalLocked.sub(returnedLockedValues),
    );
    expectToBeApproximately(
      newBalanceInfoPartyB.allocatedBalances,
      oldBalanceInfoPartyB.allocatedBalances.sub(profit),
    );
  }
}
