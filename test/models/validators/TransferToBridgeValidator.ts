import {expect} from "chai"
import {BridgeTransactionStructOutput} from "../../../src/types/contracts/interfaces/ISymmio"
import {logger} from "../../utils/LoggerUtils"
import {BridgeTransactionStatus} from "../Enums"
import {RunContext} from "../RunContext"
import {User} from "../User"
import {TransactionValidator} from "./TransactionValidator"

export type TransferToBridgeValidatorBeforeArg = {
	bridge: string
	user: User
	transactionId: bigint
}

export type TransferToBridgeValidatorBeforeOutput = {
	bridge: string
	depositBalancePartyA: bigint
	depositBalanceBridge: bigint
	transaction: BridgeTransactionStructOutput
}

export type TransferToBridgeValidatorAfterArg = {
	user: User
	amount: bigint
	transactionId: bigint
	beforeOutput: TransferToBridgeValidatorBeforeOutput
}

export class TransferToBridgeValidator implements TransactionValidator {
	async before(context: RunContext, arg: TransferToBridgeValidatorBeforeArg): Promise<TransferToBridgeValidatorBeforeOutput> {
		logger.debug("Before TransferToBridgeValidator...")
		return {
			bridge: arg.bridge,
			depositBalancePartyA: await context.viewFacet.balanceOf(await arg.user.getAddress()),
			depositBalanceBridge: await context.viewFacet.balanceOf(arg.bridge),
			transaction: await context.viewFacet.getBridgeTransaction(arg.transactionId),
		}
	}

	async after(context: RunContext, arg: TransferToBridgeValidatorAfterArg) {
		logger.debug("After TransferToBridgeValidator...")

		// Check Transaction
		const transaction = await context.viewFacet.getBridgeTransaction(arg.transactionId)

		expect(transaction.amount).to.be.equal(arg.amount)
		expect(transaction.bridge).to.be.equal(arg.beforeOutput.bridge)
		expect(transaction.user).to.be.equal(await arg.user.getAddress())
		expect(transaction.status).to.be.equal(BridgeTransactionStatus.RECEIVED)

		//check partyA balance
		const newDepositBalancePartyA = await context.viewFacet.balanceOf(await arg.user.getAddress())
		expect(arg.beforeOutput.depositBalancePartyA).to.be.equal(newDepositBalancePartyA + arg.amount)

		//check bridge balance
		const newDepositBalanceBridge = await context.viewFacet.balanceOf(arg.beforeOutput.bridge)
		expect(arg.beforeOutput.depositBalanceBridge).to.be.equal(newDepositBalanceBridge)
	}
}
