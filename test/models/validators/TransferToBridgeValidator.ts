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

export type TransferToBridgeValidatorBeforeArg = {
  bridge: string;
  user: User;
  transactionId: BigNumber;
};

export type TransferToBridgeValidatorBeforeOutput = {
  bridge: string;
  depositBalancePartyA: BigNumber;
  depositBalanceBridge: BigNumber;
  transaction: BridgeTransactionStructOutput;
};

export type TransferToBridgeValidatorAfterArg = {
  user: User;
  amount:BigNumber;
  transactionId: BigNumber;
  beforeOutput: TransferToBridgeValidatorBeforeOutput;
};

export class TransferToBridgeValidator implements TransactionValidator {
  async before(context: RunContext, arg: TransferToBridgeValidatorBeforeArg): Promise<TransferToBridgeValidatorBeforeOutput> {
    logger.debug("Before TransferToBridgeValidator...");
    return {
	  bridge:arg.bridge,
      depositBalancePartyA: await context.viewFacet.balanceOf(await arg.user.getAddress()),
	  depositBalanceBridge:await context.viewFacet.balanceOf(arg.bridge),
      transaction: await context.viewFacet.getBridgeTransaction(arg.transactionId),
    };
  }

  async after(context: RunContext, arg: TransferToBridgeValidatorAfterArg) {
    logger.debug("After TransferToBridgeValidator...");

    // Check Transaction
    const transaction = await context.viewFacet.getBridgeTransaction(arg.transactionId);

    expect(transaction.amount).to.be.equal(arg.amount);
    expect(transaction.bridge).to.be.equal(arg.beforeOutput.bridge);
    expect(transaction.partyA).to.be.equal(await arg.user.getAddress());
    expect(transaction.status).to.be.equal(BridgeTransactionStatus.LOCKED);

	//check partyA balance
	const newDepositBalancePartyA = await context.viewFacet.balanceOf(await arg.user.getAddress())
	expect(arg.beforeOutput.depositBalancePartyA).to.be.equal(newDepositBalancePartyA.add(arg.amount))

	//check bridge balance
	const newDepositBalanceBridge = await context.viewFacet.balanceOf(arg.beforeOutput.bridge)
	expect(arg.beforeOutput.depositBalanceBridge).to.be.equal(newDepositBalanceBridge.sub(arg.amount))
  }
}
