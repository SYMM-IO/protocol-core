import { BigNumber, BigNumberish } from "ethers";

export class QuoteCheckpoint {
  private static instance: QuoteCheckpoint | null = null;
  private constructor() {}

  private _blockedQuotes: Map<BigNumber, boolean> = new Map<BigNumber, boolean>();

  public addBlockedQuotes(quoteId: BigNumber): void {
    this._blockedQuotes.set(quoteId, true);
    console.log(`Quote Blocked!!!!!!!!!!!!!! ::: ${quoteId}`);
  }

  public deleteBlockedQuotes(quoteId: BigNumber): void {
    this._blockedQuotes.set(quoteId, false);
  }

  public isBlockedQuote(quoteId: BigNumber): boolean {
    console.log(`is Quote Blocked ????????? ::: ${quoteId}`);
    return this._blockedQuotes.get(quoteId) || false;
  }

  public static getInstance(): QuoteCheckpoint {
    if (!QuoteCheckpoint.instance) {
      QuoteCheckpoint.instance = new QuoteCheckpoint();
    }

    return QuoteCheckpoint.instance;
  }
}
