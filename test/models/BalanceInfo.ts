export class BalanceInfo {
	public balance: bigint
	public allocated: bigint
	public pendingLocked: bigint
	public locked: bigint

	constructor() {
		this.balance = 0n
		this.allocated = 0n
		this.pendingLocked = 0n
		this.locked = 0n
	}
}
