import { BigNumber } from "ethers"

import { logger } from "./LoggerUtils"

export async function getPrice(symbol: string) {
	const def = BigNumber.from(200000).mul(10).pow(18)
	if (process.env.TEST_MODE != "fuzz") return def
	
	try {
		let result = await fetch(
			`${ process.env.HEDGER_WEB_SERVICE }/dev/futures_mark_price/symbol=${ symbol }`,
		)
		let jsonResult = await result.json()
		if (result.status != 200) {
			logger.error("Failed to fetch price of symbol : " + JSON.stringify(jsonResult.detail))
			return def
		}
		return BigNumber.from(jsonResult.toString())
	} catch {
		throw new Error("Failed to fetch symbol price. Is server up and running?")
	}
}
