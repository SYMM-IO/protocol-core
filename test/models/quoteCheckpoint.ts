import { BigNumber } from "ethers"

export class QuoteCheckpoint {
	private static instance: QuoteCheckpoint | null = null
	private _blockedQuotes: Map<string, boolean> = new Map<string, boolean>()

	private constructor() {}

	public static getInstance(): QuoteCheckpoint {
		if (!QuoteCheckpoint.instance) {
			QuoteCheckpoint.instance = new QuoteCheckpoint()
		}

		return QuoteCheckpoint.instance
	}

	public addBlockedQuotes(quoteId: BigNumber): void {
		this._blockedQuotes.set(quoteId.toString(), true)
	}

	public deleteBlockedQuotes(quoteId: BigNumber): void {
		this._blockedQuotes.set(quoteId.toString(), false)
	}

	public isBlockedQuote(quoteId: BigNumber): boolean | undefined {
		console.log(this._blockedQuotes.keys())
		return this._blockedQuotes.get(quoteId.toString())
	}
}
