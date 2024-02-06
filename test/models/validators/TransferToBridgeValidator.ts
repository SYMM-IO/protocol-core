import { BigNumber } from "ethers"
import { BalanceInfo, User } from "../User"
import { Hedger } from "../Hedger"
import { BridgeTransactionStructOutput, QuoteStructOutput } from "../../../src/types/contracts/facets/ViewFacet"
import { RunContext } from "../RunContext"
import { TransactionValidator } from "./TransactionValidator"
import { logger } from "../../utils/LoggerUtils"
import { expect } from "chai"
import { BridgeTransactionStatus, OrderType, PositionType, QuoteStatus } from "../Enums"
import { decimal, getBlockTimestamp, unDecimal } from "../../utils/Common"
import { expectToBeApproximately } from "../../utils/SafeMath"

export type TransferToBridgeValidatorBeforeArg = {
	user: User;
	transactionId: BigNumber;
};

export type TransferToBridgeValidatorBeforeOutput = {
	balanceInfoPartyA: BalanceInfo;
	transaction: BridgeTransactionStructOutput;
};

export type TransferToBridgeValidatorAfterArg = {
	user: User;
	transactionId: BigNumber;
	beforeOutput: TransferToBridgeValidatorBeforeOutput;
};

export class TransferToBridgeValidator implements TransactionValidator {
	async before(
	  context: RunContext,
	  arg: TransferToBridgeValidatorBeforeArg,
	): Promise<TransferToBridgeValidatorBeforeOutput> {
		logger.debug("Before TransferToBridgeValidator...")
		return {
			balanceInfoPartyA: await arg.user.getBalanceInfo(),
			transaction: await context.viewFacet.getBridgeTransaction(arg.transactionId),
		}
	}

	async after(context: RunContext, arg: TransferToBridgeValidatorAfterArg) {
		logger.debug("After TransferToBridgeValidator...")
		// Check Transaction
		const transaction = await context.viewFacet.getBridgeTransaction(arg.transactionId)

	expect(transaction.status).to.be.equal(BridgeTransactionStatus.LOCKED)
    
        //TODO: More check
	}
}
