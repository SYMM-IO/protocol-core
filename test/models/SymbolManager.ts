interface Symbol {
	name: any;
	symbol: any;
	asset: any;
	symbol_id: any;
	price_precision: number;
	quantity_precision: number;
	is_valid: boolean;
	min_acceptable_quote_value: number;
	min_acceptable_portion_lf: number;
	trading_fee: number;
}

export class SymbolManager {
	symbols: Map<number, Symbol> = new Map<number, Symbol>()
	
	constructor() {
	}
	
	public async loadSymbols() {
		if (process.env.TEST_MODE != "fuzz") return
		try {
			let result = await fetch(`${ process.env.HEDGER_WEB_SERVICE }/contract-symbols`)
			let jsonResult = await result.json()
			if (result.status != 200)
				throw new Error(`Failed to fetch symbols. response status = ${ result.status }`)
			for (const symbol of jsonResult["symbols"]) {
				this.symbols.set(symbol.symbol_id, symbol)
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
