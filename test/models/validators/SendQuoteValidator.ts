import { expect } from "chai";
import { BigNumber, ethers } from "ethers";

import {
  getBlockTimestamp,
  getTotalLockedValuesForQuoteIds,
  getTradingFeeForQuotes,
} from "../../utils/Common";
import { logger } from "../../utils/LoggerUtils";
import { QuoteStatus } from "../Enums";
import { RunContext } from "../RunContext";
import { BalanceInfo, User } from "../User";
import { TransactionValidator } from "./TransactionValidator";
import { QuoteRequest } from "../requestModels/QuoteRequest";

export type SendQuoteValidatorBeforeArg = {
  user: User;
  quote: QuoteRequest;
};

export type SendQuoteValidatorBeforeOutput = {
  balanceInfoPartyA: BalanceInfo;
  quote: QuoteRequest;
};

export type SendQuoteValidatorAfterArg = {
  user: User;
  quoteId: BigNumber;
  beforeOutput: SendQuoteValidatorBeforeOutput;
};

export class SendQuoteValidator implements TransactionValidator {
  async before(
    context: RunContext,
    arg: SendQuoteValidatorBeforeArg,
  ): Promise<SendQuoteValidatorBeforeOutput> {
    logger.debug("Before SendQuoteValidator...");
    return {
      balanceInfoPartyA: await arg.user.getBalanceInfo(),
      quote: arg.quote,
    };
  }

  async after(context: RunContext, arg: SendQuoteValidatorAfterArg) {
    logger.debug("After SendQuoteValidator...");
    const newBalanceInfo = await arg.user.getBalanceInfo();
    const oldBalanceInfo = arg.beforeOutput.balanceInfoPartyA;

    expect(newBalanceInfo.totalPendingLockedPartyA).to.be.equal(
      oldBalanceInfo.totalPendingLockedPartyA
        .add(await getTotalLockedValuesForQuoteIds(context, [arg.quoteId]))
        .toString(),
    );
    expect(newBalanceInfo.allocatedBalances).to.be.equal(
      oldBalanceInfo.allocatedBalances.sub(await getTradingFeeForQuotes(context, [arg.quoteId])),
    );

    //check Quote
    const oldQuote = arg.beforeOutput.quote;
    const newQuote = await context.viewFacet.getQuote(arg.quoteId);

    expect(newQuote.parentId).to.be.equal(0);
    expect(newQuote.openedPrice).to.be.equal(0);
    expect(newQuote.closedAmount).to.be.equal(0);
    expect(newQuote.avgClosedPrice).to.be.equal(0);
    expect(newQuote.quantityToClose).to.be.equal(0);
    expect(newQuote.initialOpenedPrice).to.be.equal(0);
    expect(newQuote.requestedClosePrice).to.be.equal(0);
    expect(newQuote.deadline).to.be.equal(oldQuote.deadline);
    expect(newQuote.quantity).to.be.equal(oldQuote.quantity);
    expect(newQuote.symbolId).to.be.equal(oldQuote.symbolId);
    expect(newQuote.lastFundingPaymentTimestamp).to.be.equal(0);
    expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.PENDING);
    expect(newQuote.requestedOpenPrice).to.be.equal(oldQuote.price);
    expect(newQuote.positionType).to.be.equal(oldQuote.positionType);
    expect(newQuote.partyA).to.be.equal(await arg.user.getAddress());
    expect(newQuote.partyB).to.be.equal(ethers.constants.AddressZero);
    expect(newQuote.maxFundingRate).to.be.equal(oldQuote.positionType);
    expect(newQuote.partyBsWhiteList).to.be.equal(oldQuote.partyBWhiteList);
    expect(newQuote.marketPrice).to.be.equal((await oldQuote.upnlSig).price);
    expect(newQuote.createTimestamp).to.be.equal(await getBlockTimestamp());
    expect(newQuote.statusModifyTimestamp).to.be.equal(await getBlockTimestamp());
    expect(newQuote.tradingFee).to.be.equal(getTradingFeeForQuotes(context, [newQuote.id]));
    
    expect(newQuote.lockedValues).to.be.equal(
      await getTotalLockedValuesForQuoteIds(context, [newQuote.id]),
    );
    expect(await context.viewFacet.getPartyAPendingQuotes(await arg.user.getAddress())).to.contain(
      newQuote.id,
    );
    expect(newQuote.initialLockedValues).to.be.equal(
      await getTotalLockedValuesForQuoteIds(context, [newQuote.id]),
    );
  }
}
