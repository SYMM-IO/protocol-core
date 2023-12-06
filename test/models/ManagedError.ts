export class ManagedError extends Error {
	constructor(msg: string) {
		super(msg)
		
		// Set the prototype explicitly.
		Object.setPrototypeOf(this, ManagedError.prototype)
	}
}
