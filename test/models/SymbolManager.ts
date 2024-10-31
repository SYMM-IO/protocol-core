interface Symbol {
	name: any
	symbol: any
	asset: any
	symbol_id: any
	price_precision: number
	quantity_precision: number
	is_valid: boolean
	min_acceptable_quote_value: number
	min_acceptable_portion_lf: number
	trading_fee: number
}

export let symbolsMock = {
	symbols: [
		{
			name: "BTCUSDT",
			symbol: "BTC",
			asset: "USDT",
			symbol_id: 1,
			price_precision: 1,
			quantity_precision: 3,
			is_valid: true,
			min_acceptable_quote_value: BigInt("60000000000000000000"),
			min_acceptable_portion_lf: 4000000000000000,
			trading_fee: 1000000000000000,
		},
		{
			name: "ETHUSDT",
			symbol: "ETH",
			asset: "USDT",
			symbol_id: 2,
			price_precision: 2,
			quantity_precision: 3,
			is_valid: true,
			min_acceptable_quote_value: BigInt("60000000000000000000"),
			min_acceptable_portion_lf: 4000000000000000,
			trading_fee: 1000000000000000,
		},
		{
			name: "BCHUSDT",
			symbol: "BCH",
			asset: "USDT",
			symbol_id: 3,
			price_precision: 2,
			quantity_precision: 3,
			is_valid: true,
			min_acceptable_quote_value: BigInt("20000000000000000000"),
			min_acceptable_portion_lf: 4000000000000000,
			trading_fee: 1000000000000000,
		},
		{
			name: "XRPUSDT",
			symbol: "XRP",
			asset: "USDT",
			symbol_id: 4,
			price_precision: 4,
			quantity_precision: 1,
			is_valid: true,
			min_acceptable_quote_value: BigInt("20000000000000000000"),
			min_acceptable_portion_lf: 4000000000000000,
			trading_fee: 1000000000000000,
		},
		{
			name: "EOSUSDT",
			symbol: "EOS",
			asset: "USDT",
			symbol_id: 5,
			price_precision: 3,
			quantity_precision: 1,
			is_valid: true,
			min_acceptable_quote_value: BigInt("20000000000000000000"),
			min_acceptable_portion_lf: 4000000000000000,
			trading_fee: 1000000000000000,
		},
	],
}

export class SymbolManager {
	symbols: Map<number, Symbol> = new Map<number, Symbol>()

	constructor() {
	}

	public async loadSymbols() {
		if (process.env.TEST_MODE != "fuzz") return
		try {
			// let result = await fetch(`${ process.env.HEDGER_WEB_SERVICE }/contract-symbols`)
			let jsonResult = symbolsMock
			for (const symbol of jsonResult["symbols"]) {
				this.symbols.set(symbol.symbol_id, symbol as any)
			}
		} catch {
			throw new Error(`Failed to fetch symbols. Is server up and running?`)
		}
	}

	public getSymbolPricePrecision(symbolId: number): number {
		if (!this.symbols.has(symbolId)) return 100
		return this.symbols.get(symbolId)!.price_precision
	}

	public getSymbolQuantityPrecision(symbolId: number): number {
		if (!this.symbols.has(symbolId)) return 100
		return this.symbols.get(symbolId)!.quantity_precision
	}
}
