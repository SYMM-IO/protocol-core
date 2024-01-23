import { BigNumber } from "ethers";
import { BalanceInfo, User } from "../User";
import { Hedger } from "../Hedger";
import { QuoteStructOutput } from "../../../src/types/contracts/facets/ViewFacet";
import { RunContext } from "../RunContext";
import { TransactionValidator } from "./TransactionValidator";
import { logger } from "../../utils/LoggerUtils";
import { expect } from "chai";
import { OrderType, PositionType, QuoteStatus } from "../Enums";
import { decimal } from "../../utils/Common";

export type ForceClosePositionValidatorBeforeArg = {
  user: User;
  quoteId: BigNumber;
  hedger: Hedger;
};

export type ForceClosePositionValidatorBeforeOutput = {
  balanceInfoPartyA: BalanceInfo;
  balanceInfoPartyB: BalanceInfo;
  quote: QuoteStructOutput;
};

export type ForceClosePositionValidatorAfterArg = {
  user: User;
  hedger: Hedger;
  quoteId: BigNumber;
  sig:{
    lowestPrice: BigNumber;
    highestPrice: BigNumber;
    averagePrice: BigNumber;
    currentPrice: BigNumber;
    endTime: BigNumber;
    startTime: BigNumber;
  }
  beforeOutput: ForceClosePositionValidatorBeforeOutput;
};

export class ForceClosePositionValidator implements TransactionValidator {
  async before(
    context: RunContext,
    arg: ForceClosePositionValidatorBeforeArg,
  ): Promise<ForceClosePositionValidatorBeforeOutput> {
    logger.debug("Before ForceClosePositionValidator...");
    return {
      balanceInfoPartyA: await arg.user.getBalanceInfo(),
      balanceInfoPartyB: await arg.hedger.getBalanceInfo(await arg.user.getAddress()),
      quote: await context.viewFacet.getQuote(arg.quoteId),
    };
  }
  async after(context: RunContext, arg: ForceClosePositionValidatorAfterArg) {
    logger.debug("After ForceClosePositionValidator...");
    // Check Quote
    const newQuote = await context.viewFacet.getQuote(arg.quoteId);
    const oldQuote = arg.beforeOutput.quote;
    const penalty = await context.viewFacet.forceClosePricePenalty();
    const forceCloseFirstCooldown = await context.viewFacet.forceCloseFirstCooldown();
    const forceCloseSecondCooldown = await context.viewFacet.forceCloseSecondCooldown();
    const forceCloseMinSigPeriod = await context.viewFacet.forceCloseMinSigPeriod();
    const partyBBalanceInfo = arg.hedger.getBalanceInfo(await arg.user.getAddress());
    const isPartyBLiquidated =
      (await partyBBalanceInfo).allocatedBalances == BigNumber.from(0) ? true : false;

    let closePrice: BigNumber;

    expect(newQuote.quoteStatus).to.be.equal(
      isPartyBLiquidated ? QuoteStatus.CLOSE_PENDING : QuoteStatus.LIQUIDATED,
    );
    expect(newQuote.orderType).to.be.equal(OrderType.LIMIT);
    //TODO: check the Final ClosePrice (Long and Short)
    if (newQuote.positionType == PositionType.LONG) {
      const expectClosePrice = oldQuote.requestedClosePrice.add(
        oldQuote.requestedClosePrice.mul(penalty).div(decimal(1) /* 1e18 */),
      );

      closePrice = expectClosePrice > arg.sig.averagePrice ? expectClosePrice : arg.sig.averagePrice;

      const expectedAvgClosedPrice = oldQuote.avgClosedPrice
        .mul(oldQuote.closedAmount)
        .add(oldQuote.quantityToClose.mul(closePrice))
        .div(oldQuote.closedAmount.add(oldQuote.quantityToClose));

      expect(newQuote.avgClosedPrice).to.be.equal(expectedAvgClosedPrice);
    } else {
      //SHORT
      const expectClosePrice = oldQuote.requestedClosePrice.sub(
        oldQuote.requestedClosePrice.mul(penalty).div(decimal(1) /* 1e18 */),
      );

      closePrice = expectClosePrice > arg.sig.averagePrice ? arg.sig.averagePrice : expectClosePrice;

      const expectedAvgClosedPrice = oldQuote.avgClosedPrice
        .mul(oldQuote.closedAmount)
        .add(oldQuote.quantityToClose.mul(closePrice))
        .div(oldQuote.closedAmount.add(oldQuote.quantityToClose));

      expect(newQuote.avgClosedPrice).to.be.equal(expectedAvgClosedPrice);
    }
    //TODO: check CoolDown(start and End Time)
    // expect(arg.startTime).to.not.be.(newQuote.statusModifyTimestamp.add(forceCloseFirstCooldown))
    
    //* check AveragePrice
    expect(arg.sig.averagePrice).to.be.least(arg.sig.highestPrice);
    expect(arg.sig.averagePrice).to.be.most(arg.sig.lowestPrice);

    //* check signature period
    if (closePrice == arg.sig.averagePrice) {
      expect(arg.sig.endTime.sub(arg.sig.startTime)).to.be.most(forceCloseMinSigPeriod);
    }

    //TODO: check partyA solvency

    //* check partyB liquidation
    if (isPartyBLiquidated) {
      const partyBBalanceInfo = await arg.hedger.getBalanceInfo(await arg.user.getAddress());
      expect(partyBBalanceInfo.allocatedBalances).to.be.equal(0);
    } else {
      //* check closeQuote
      expect(newQuote.quoteStatus).to.be.equal(QuoteStatus.CLOSED);
      expect(newQuote.requestedClosePrice).to.be.equal(0);
    }
  }
}
