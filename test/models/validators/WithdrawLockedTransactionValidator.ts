import { BigNumber } from "ethers";
import { BalanceInfo, User } from "../User";
import { Hedger } from "../Hedger";
import { BridgeTransactionStructOutput, QuoteStructOutput } from "../../../src/types/contracts/facets/ViewFacet";
import { RunContext } from "../RunContext";
import { TransactionValidator } from "./TransactionValidator";
import { logger } from "../../utils/LoggerUtils";
import { expect } from "chai";
import { BridgeTransactionStatus, OrderType, PositionType, QuoteStatus } from "../Enums";
import { decimal, getBlockTimestamp, unDecimal } from "../../utils/Common";
import { expectToBeApproximately } from "../../utils/SafeMath";

export type WithdrawLockedTransactionValidatorBeforeArg = {
  bridge: string;
  transactionId: BigNumber;
};

export type WithdrawLockedTransactionValidatorBeforeOutput = {
  bridge: string;
  depositBalanceBridge: BigNumber;
  transaction: BridgeTransactionStructOutput;
};

export type WithdrawLockedTransactionValidatorAfterArg = {
  transactionId: BigNumber;
  beforeOutput: WithdrawLockedTransactionValidatorBeforeOutput;
};

export class WithdrawLockedTransactionValidator implements TransactionValidator {
  async before(context: RunContext, arg: WithdrawLockedTransactionValidatorBeforeArg): Promise<WithdrawLockedTransactionValidatorBeforeOutput> {
    logger.debug("Before WithdrawLockedTransactionValidator...");
    return {
	  bridge:arg.bridge,
	  depositBalanceBridge:await context.viewFacet.balanceOf(arg.bridge),
    transaction: await context.viewFacet.getBridgeTransaction(arg.transactionId),
    };
  }

  async after(context: RunContext, arg: WithdrawLockedTransactionValidatorAfterArg) {
    logger.debug("After WithdrawLockedTransactionValidator...");

    // Check Transaction
    const transaction = await context.viewFacet.getBridgeTransaction(arg.transactionId);
    expect(transaction.status).to.be.equal(BridgeTransactionStatus.WITHDRAWN);
  }
}
