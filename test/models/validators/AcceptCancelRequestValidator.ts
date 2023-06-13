import { expect } from "chai";
import { BigNumber } from "ethers";

import { QuoteStructOutput } from "../../../src/types/contracts/facets/ViewFacet";
import { getTotalLockedValuesForQuotes, getTradingFeeForQuotes } from "../../utils/Common";
import { logger } from "../../utils/LoggerUtils";
import { QuoteStatus } from "../Enums";
import { RunContext } from "../RunContext";
import { BalanceInfo, User } from "../User";
import { TransactionValidator } from "./TransactionValidator";
import { expectToBeApproximately } from "../../utils/SafeMath";

export type AcceptCancelRequestValidatorBeforeArg = {
  user: User;
  quoteId: BigNumber;
};

export type AcceptCancelRequestValidatorBeforeOutput = {
  balanceInfoPartyA: BalanceInfo;
  quote: QuoteStructOutput;
};

export type AcceptCancelRequestValidatorAfterArg = {
  user: User;
  quoteId: BigNumber;
  beforeOutput: AcceptCancelRequestValidatorBeforeOutput;
};

export class AcceptCancelRequestValidator implements TransactionValidator {
  async before(
    context: RunContext,
    arg: AcceptCancelRequestValidatorBeforeArg,
  ): Promise<AcceptCancelRequestValidatorBeforeOutput> {
    logger.debug("Before AcceptCancelRequestValidator...");
    return {
      balanceInfoPartyA: await arg.user.getBalanceInfo(),
      quote: await context.viewFacet.getQuote(arg.quoteId),
    };
  }

  async after(context: RunContext, arg: AcceptCancelRequestValidatorAfterArg) {
    logger.debug("After AcceptCancelRequestValidator...");
    // Check Quote
    const newQuote = await context.viewFacet.getQuote(arg.quoteId);
    const oldQuote = arg.beforeOutput.quote;
    expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CANCELED);

    // Check Balances partyA
    const newBalanceInfoPartyA = await arg.user.getBalanceInfo();
    const oldBalanceInfoPartyA = arg.beforeOutput.balanceInfoPartyA;

    const lockedValues = await getTotalLockedValuesForQuotes([oldQuote]);

    expect(newBalanceInfoPartyA.totalPendingLocked).to.be.equal(
      oldBalanceInfoPartyA.totalPendingLocked.sub(lockedValues).toString(),
    );
    expect(newBalanceInfoPartyA.totalLocked).to.be.equal(
      oldBalanceInfoPartyA.totalLocked.toString(),
    );
    let tradingFee = await getTradingFeeForQuotes(context, [arg.quoteId]);
    expectToBeApproximately(
      newBalanceInfoPartyA.allocatedBalances,
      oldBalanceInfoPartyA.allocatedBalances.add(tradingFee),
    );
  }
}
