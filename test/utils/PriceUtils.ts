import { BigNumber } from "ethers"
import { QuoteStructOutput } from "../../src/types/contracts/interfaces/ISymmio"
import { decimal } from "./Common"
import { randomBigNumber } from "./RandomUtils"

export async function getPrice() {
	const def = BigNumber.from(200000).mul(10).pow(18)
	if (process.env.TEST_MODE != "fuzz") return def
	return randomBigNumber(BigNumber.from("110000000000000000000"), BigNumber.from("100000000000000000000"))
}

export function calculateExpectedClosePriceForForceClose(q: QuoteStructOutput, penalty: BigNumber, isLongPosition: boolean): BigNumber {
	const a = q.requestedClosePrice.mul(penalty).div(decimal(1))
	return isLongPosition ? q.requestedClosePrice.add(a) : q.requestedClosePrice.sub(a)
}

export function calculateExpectedAvgPriceForForceClose(q: QuoteStructOutput, expectedClosePrice: BigNumber): BigNumber {
	return q.avgClosedPrice.mul(q.closedAmount).add(q.quantityToClose.mul(expectedClosePrice)).div(q.closedAmount.add(q.quantityToClose))
}
