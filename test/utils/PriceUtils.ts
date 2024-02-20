import { BigNumber } from "ethers"
import { randomBigNumber } from "./RandomUtils"

export async function getPrice(symbol: string) {
	const def = BigNumber.from(200000).mul(10).pow(18)
	if (process.env.TEST_MODE != "fuzz") return def
	return randomBigNumber(BigNumber.from("110000000000000000000"), BigNumber.from("100000000000000000000"))
}
