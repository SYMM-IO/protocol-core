import {QuoteStructOutput} from "../../src/types/contracts/interfaces/ISymmio"
import {decimal} from "./Common"
import {randomBigNumber} from "./RandomUtils"

export async function getPrice(): Promise<bigint> {
	const def = 200000n * 10n ** 18n
	if (process.env.TEST_MODE !== "fuzz") return def
	return randomBigNumber(110000000000000000000n, 100000000000000000000n)
}

export function calculateExpectedClosePriceForForceClose(q: QuoteStructOutput, penalty: bigint, isLongPosition: boolean): bigint {
	const a = (q.requestedClosePrice * penalty) / decimal(1n)
	return isLongPosition ? q.requestedClosePrice + a : q.requestedClosePrice - a
}

export function calculateExpectedAvgPriceForForceClose(q: QuoteStructOutput, expectedClosePrice: bigint): bigint {
	return ((q.avgClosedPrice * q.closedAmount) + (q.quantityToClose * expectedClosePrice)) / (q.closedAmount + q.quantityToClose)
}
