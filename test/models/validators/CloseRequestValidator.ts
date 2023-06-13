import { expect } from "chai";
import { BigNumber } from "ethers";

import { QuoteStructOutput } from "../../../src/types/contracts/facets/ViewFacet";
import { QuoteStatus } from "../Enums";
import { logger } from "../../utils/LoggerUtils";
import { Hedger } from "../Hedger";
import { RunContext } from "../RunContext";
import { BalanceInfo, User } from "../User";
import { TransactionValidator } from "./TransactionValidator";

export type CloseRequestValidatorBeforeArg = {
  user: User;
  quoteId: BigNumber;
  hedger: Hedger;
};

export type CloseRequestValidatorBeforeOutput = {
  balanceInfoPartyA: BalanceInfo;
  balanceInfoPartyB: BalanceInfo;
  quote: QuoteStructOutput;
};

export type CloseRequestValidatorAfterArg = {
  user: User;
  hedger: Hedger;
  quoteId: BigNumber;
  closePrice: BigNumber;
  quantityToClose: BigNumber;
  beforeOutput: CloseRequestValidatorBeforeOutput;
};

export class CloseRequestValidator implements TransactionValidator {
  async before(
    context: RunContext,
    arg: CloseRequestValidatorBeforeArg,
  ): Promise<CloseRequestValidatorBeforeOutput> {
    logger.debug("Before CloseRequestValidator...");
    return {
      balanceInfoPartyA: await arg.user.getBalanceInfo(),
      balanceInfoPartyB: await arg.hedger.getBalanceInfo(await arg.user.getAddress()),
      quote: await context.viewFacet.getQuote(arg.quoteId),
    };
  }

  async after(context: RunContext, arg: CloseRequestValidatorAfterArg) {
    logger.debug("After CloseRequestValidator...");
    // Check Quote
    const newQuote = await context.viewFacet.getQuote(arg.quoteId);
    const oldQuote = arg.beforeOutput.quote;
    expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CLOSE_PENDING);
    expect(newQuote.quantityToClose).to.be.equal(arg.quantityToClose);
    expect(newQuote.requestedClosePrice).to.be.equal(arg.closePrice);

    // Check Balances partyA
    const newBalanceInfoPartyA = await arg.user.getBalanceInfo();
    const oldBalanceInfoPartyA = arg.beforeOutput.balanceInfoPartyA;

    expect(newBalanceInfoPartyA.totalPendingLocked).to.be.equal(
      oldBalanceInfoPartyA.totalPendingLocked.toString(),
    );
    expect(newBalanceInfoPartyA.totalLocked).to.be.equal(
      oldBalanceInfoPartyA.totalLocked.toString(),
    );
    expect(newBalanceInfoPartyA.allocatedBalances).to.be.equal(
      oldBalanceInfoPartyA.allocatedBalances.toString(),
    );

    // Check Balances partyB
    const newBalanceInfoPartyB = await arg.hedger.getBalanceInfo(await arg.user.getAddress());
    const oldBalanceInfoPartyB = arg.beforeOutput.balanceInfoPartyB;

    expect(newBalanceInfoPartyB.totalPendingLocked).to.be.equal(
      oldBalanceInfoPartyB.totalPendingLocked.toString(),
    );
    expect(newBalanceInfoPartyB.totalLocked).to.be.equal(
      oldBalanceInfoPartyB.totalLocked.toString(),
    );
    expect(newBalanceInfoPartyB.allocatedBalances).to.be.equal(
      oldBalanceInfoPartyB.allocatedBalances.toString(),
    );
  }
}
