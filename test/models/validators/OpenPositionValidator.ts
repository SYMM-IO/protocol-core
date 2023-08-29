import { BigNumber as BN } from "bignumber.js";
import { expect } from "chai";
import { BigNumber } from "ethers";

import { QuoteStructOutput } from "../../../src/types/contracts/facets/ViewFacet";
import { getTotalLockedValuesForQuotes, getTradingFeeForQuotes } from "../../utils/Common";
import { logger } from "../../utils/LoggerUtils";
import { OrderType, QuoteStatus } from "../Enums";
import { Hedger } from "../Hedger";
import { RunContext } from "../RunContext";
import { BalanceInfo, User } from "../User";
import { TransactionValidator } from "./TransactionValidator";
import { expectToBeApproximately } from "../../utils/SafeMath";

export type OpenPositionValidatorBeforeArg = {
  user: User;
  quoteId: BigNumber;
  hedger: Hedger;
};

export type OpenPositionValidatorBeforeOutput = {
  balanceInfoPartyA: BalanceInfo;
  balanceInfoPartyB: BalanceInfo;
  quote: QuoteStructOutput;
};

export type OpenPositionValidatorAfterArg = {
  user: User;
  hedger: Hedger;
  quoteId: BigNumber;
  openedPrice: BigNumber;
  fillAmount: BigNumber;
  beforeOutput: OpenPositionValidatorBeforeOutput;
  newQuoteId?: BigNumber;
  newQuoteTargetStatus?: QuoteStatus;
};

export class OpenPositionValidator implements TransactionValidator {
  async before(
    context: RunContext,
    arg: OpenPositionValidatorBeforeArg,
  ): Promise<OpenPositionValidatorBeforeOutput> {
    logger.debug("Before OpenPositionValidator...");
    return {
      balanceInfoPartyA: await arg.user.getBalanceInfo(),
      balanceInfoPartyB: await arg.hedger.getBalanceInfo(await arg.user.getAddress()),
      quote: await context.viewFacet.getQuote(arg.quoteId),
    };
  }

  async after(context: RunContext, arg: OpenPositionValidatorAfterArg) {
    logger.debug("After OpenPositionValidator...");
    // Check Quote
    const newQuote = await context.viewFacet.getQuote(arg.quoteId);
    const oldQuote = arg.beforeOutput.quote;
    expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.OPENED);
    expect(newQuote.openedPrice).to.be.equal(arg.openedPrice);
    expect(newQuote.quantity).to.be.equal(arg.fillAmount);

    const oldLockedValues = await getTotalLockedValuesForQuotes([oldQuote]);
    const newLockedValues = await getTotalLockedValuesForQuotes([newQuote]);

    const fillAmountCoef = new BN(arg.fillAmount.toString()).div(
      new BN(oldQuote.quantity.toString()),
    );
    const priceCoef = new BN(arg.openedPrice.toString()).div(
      new BN(
        oldQuote.orderType == OrderType.LIMIT
          ? oldQuote.requestedOpenPrice.toString()
          : oldQuote.marketPrice.toString(),
      ),
    );
    const partially = !fillAmountCoef.eq(1);

    if (partially && arg.newQuoteId != null) {
      const newlyCreatedQuote = await context.viewFacet.getQuote(arg.newQuoteId!);
      expect(newlyCreatedQuote.quoteStatus).to.be.equal(arg.newQuoteTargetStatus!);
      const lv = await getTotalLockedValuesForQuotes([newlyCreatedQuote]);
      expect(newlyCreatedQuote.quantity).to.be.equal(oldQuote.quantity.sub(arg.fillAmount));
      expect(lv).to.be.equal(
        new BN(oldLockedValues.toString()).times(new BN(1).minus(fillAmountCoef)).toString(),
      );
    }

    const partialLockedValues = BigNumber.from(
      new BN(oldLockedValues.toString()).times(fillAmountCoef).toFixed(0, BN.ROUND_DOWN).toString(),
    );
    const partialWithPriceLockedValues = BigNumber.from(
      new BN(oldLockedValues.toString())
        .times(fillAmountCoef)
        .times(priceCoef)
        .toFixed(0, BN.ROUND_DOWN)
        .toString(),
    );
    expectToBeApproximately(newLockedValues, partialWithPriceLockedValues);

    // Check Balances partyA
    const newBalanceInfoPartyA = await arg.user.getBalanceInfo();
    const oldBalanceInfoPartyA = arg.beforeOutput.balanceInfoPartyA;

    if (arg.newQuoteTargetStatus == QuoteStatus.CANCELED) {
      expect(newBalanceInfoPartyA.totalPendingLocked).to.be.equal(
        oldBalanceInfoPartyA.totalPendingLocked.sub(oldLockedValues).toString(),
      );
    } else {
      expectToBeApproximately(
        newBalanceInfoPartyA.totalPendingLocked,
        oldBalanceInfoPartyA.totalPendingLocked.sub(partialLockedValues),
      );
    }
    expectToBeApproximately(
      newBalanceInfoPartyA.totalLocked,
      oldBalanceInfoPartyA.totalLocked.add(partialWithPriceLockedValues),
    );
    if (arg.newQuoteTargetStatus == QuoteStatus.CANCELED) {
      expect(newBalanceInfoPartyA.allocatedBalances).to.be.equal(
        oldBalanceInfoPartyA.allocatedBalances
          .add(await getTradingFeeForQuotes(context, [arg.newQuoteId!]))
          .toString(),
      );
    } else {
      expect(newBalanceInfoPartyA.allocatedBalances).to.be.equal(
        oldBalanceInfoPartyA.allocatedBalances.toString(),
      );
    }

    // Check Balances partyB
    const newBalanceInfoPartyB = await arg.hedger.getBalanceInfo(await arg.user.getAddress());
    const oldBalanceInfoPartyB = arg.beforeOutput.balanceInfoPartyB;

    if (arg.newQuoteTargetStatus == QuoteStatus.CANCELED) {
      expect(newBalanceInfoPartyB.totalPendingLocked).to.be.equal(
        oldBalanceInfoPartyB.totalPendingLocked.sub(oldLockedValues).toString(),
      );
    } else {
      expectToBeApproximately(
        newBalanceInfoPartyB.totalPendingLocked,
        oldBalanceInfoPartyB.totalPendingLocked.sub(oldLockedValues),
      );
    }
    expectToBeApproximately(
      newBalanceInfoPartyB.totalLocked,
      oldBalanceInfoPartyB.totalLocked.add(partialWithPriceLockedValues),
    );
    expect(newBalanceInfoPartyB.allocatedBalances).to.be.equal(
      oldBalanceInfoPartyB.allocatedBalances.toString(),
    );
  }
}
