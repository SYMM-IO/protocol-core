import { expect } from "chai";
import { BigNumber } from "ethers";

import { QuoteStructOutput } from "../../../src/types/contracts/facets/ViewFacet";
import { getTotalLockedValuesForQuotes, getTradingFeeForQuotes } from "../../utils/Common";
import { QuoteStatus } from "../Enums";
import { RunContext } from "../RunContext";
import { BalanceInfo, User } from "../User";
import { logger } from "./../../utils/LoggerUtils";
import { TransactionValidator } from "./TransactionValidator";
import { expectToBeApproximately } from "../../utils/SafeMath";

export type CancelQuoteValidatorBeforeArg = {
  user: User;
  quoteId: BigNumber;
};

export type CancelQuoteValidatorBeforeOutput = {
  balanceInfoPartyA: BalanceInfo;
  quote: QuoteStructOutput;
};

export type CancelQuoteValidatorAfterArg = {
  user: User;
  quoteId: BigNumber;
  targetStatus?: QuoteStatus.CANCELED | QuoteStatus.EXPIRED;
  beforeOutput: CancelQuoteValidatorBeforeOutput;
};

export class CancelQuoteValidator implements TransactionValidator {
  async before(
    context: RunContext,
    arg: CancelQuoteValidatorBeforeArg,
  ): Promise<CancelQuoteValidatorBeforeOutput> {
    logger.debug("Before CancelQuoteValidator...");
    return {
      balanceInfoPartyA: await arg.user.getBalanceInfo(),
      quote: await context.viewFacet.getQuote(arg.quoteId),
    };
  }

  async after(context: RunContext, arg: CancelQuoteValidatorAfterArg) {
    logger.debug("After CancelQuoteValidator...");
    // Check Quote
    const newQuote = await context.viewFacet.getQuote(arg.quoteId);
    const oldQuote = arg.beforeOutput.quote;

    const newBalanceInfoPartyA = await arg.user.getBalanceInfo();
    const oldBalanceInfoPartyA = arg.beforeOutput.balanceInfoPartyA;

    if (oldQuote.quoteStatus == QuoteStatus.LOCKED) {
      expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CANCEL_PENDING);
      expect(newBalanceInfoPartyA.totalPendingLocked).to.be.equal(
        oldBalanceInfoPartyA.totalPendingLocked.toString(),
      );
      expect(newBalanceInfoPartyA.totalLocked).to.be.equal(
        oldBalanceInfoPartyA.totalLocked.toString(),
      );
      expect(newBalanceInfoPartyA.allocatedBalances).to.be.equal(
        oldBalanceInfoPartyA.allocatedBalances.toString(),
      );
      return;
    }
    if (arg.targetStatus != null) expect(newQuote.quoteStatus).to.be.equal(arg.targetStatus);

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
