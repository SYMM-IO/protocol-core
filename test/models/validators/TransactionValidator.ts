import { RunContext } from "../RunContext"

export interface TransactionValidator {
	before(context: RunContext, arg: any): Promise<any>

	after(context: RunContext, beforeOutput: any): Promise<any>
}
