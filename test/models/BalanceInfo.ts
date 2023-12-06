import { BigNumber } from "ethers"

export class BalanceInfo {
	public balance: BigNumber
	public allocated: BigNumber
	public pendingLocked: BigNumber
	public locked: BigNumber
	
	constructor() {
		this.balance = BigNumber.from(0)
		this.allocated = BigNumber.from(0)
		this.pendingLocked = BigNumber.from(0)
		this.locked = BigNumber.from(0)
	}
}
