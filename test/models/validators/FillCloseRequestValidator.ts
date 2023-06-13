import { expect } from "chai";
import { BigNumber } from "ethers";

import { QuoteStructOutput } from "../../../src/types/contracts/facets/ViewFacet";
import { getTotalLockedValuesForQuotes, unDecimal } from "../../utils/Common";
import { logger } from "../../utils/LoggerUtils";
import { expectToBeApproximately } from "../../utils/SafeMath";
import { PositionType, QuoteStatus } from "../Enums";
import { Hedger } from "../Hedger";
import { RunContext } from "../RunContext";
import { BalanceInfo, User } from "../User";
import { TransactionValidator } from "./TransactionValidator";

export type FillCloseRequestValidatorBeforeArg = {
  user: User;
  quoteId: BigNumber;
  hedger: Hedger;
};

export type FillCloseRequestValidatorBeforeOutput = {
  balanceInfoPartyA: BalanceInfo;
  balanceInfoPartyB: BalanceInfo;
  quote: QuoteStructOutput;
};

export type FillCloseRequestValidatorAfterArg = {
  user: User;
  hedger: Hedger;
  quoteId: BigNumber;
  closePrice: BigNumber;
  filledAmount: BigNumber;
  beforeOutput: FillCloseRequestValidatorBeforeOutput;
};

export class FillCloseRequestValidator implements TransactionValidator {
  async before(
    context: RunContext,
    arg: FillCloseRequestValidatorBeforeArg,
  ): Promise<FillCloseRequestValidatorBeforeOutput> {
    logger.debug("Before FillCloseRequestValidator...");
    return {
      balanceInfoPartyA: await arg.user.getBalanceInfo(),
      balanceInfoPartyB: await arg.hedger.getBalanceInfo(await arg.user.getAddress()),
      quote: await context.viewFacet.getQuote(arg.quoteId),
    };
  }

  async after(context: RunContext, arg: FillCloseRequestValidatorAfterArg) {
    logger.debug("After FillCloseRequestValidator...");
    // Check Quote
    const newQuote = await context.viewFacet.getQuote(arg.quoteId);
    const oldQuote = arg.beforeOutput.quote;
    const zeroToClose = newQuote.quantityToClose.eq(0);
    const isFullyClosed = newQuote.quantity.eq(newQuote.closedAmount);

    if (isFullyClosed) {
      expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CLOSED);
    } else if (zeroToClose || newQuote.quoteStatus == QuoteStatus.CANCEL_CLOSE_PENDING) {
      expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.OPENED);
    } else {
      expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CLOSE_PENDING);
    }

    expect(newQuote.closedAmount).to.be.equal(oldQuote.closedAmount.add(arg.filledAmount));
    expect(newQuote.quantityToClose).to.be.equal(oldQuote.quantityToClose.sub(arg.filledAmount));

    const oldLockedValues = await getTotalLockedValuesForQuotes([oldQuote]);
    const newLockedValues = await getTotalLockedValuesForQuotes([newQuote]);

    let profit;
    if (newQuote.positionType == PositionType.LONG) {
      profit = unDecimal(arg.closePrice.sub(newQuote.openedPrice).mul(arg.filledAmount));
    } else {
      profit = unDecimal(newQuote.openedPrice.sub(arg.closePrice).mul(arg.filledAmount));
    }

    let returnedLockedValues = oldLockedValues.mul(arg.filledAmount).div(oldQuote.quantity);

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
