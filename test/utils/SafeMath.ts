import { expect } from "chai"
import { BigNumber as BN } from "bignumber.js"
import { BigNumber } from "ethers"

export function safeDiv(a: BigNumber, b: BigNumber) {
	let value = BN(a.toString()).dividedBy(BN(b.toString()))
	if (value.lt(1) && value.gt(0)) {
		throw new Error("Division led to fraction !")
	}
	return BigNumber.from(value.toFixed(0).toString())
}

BN.set({ ROUNDING_MODE: BN.ROUND_CEIL })

export function roundToPrecision(a: BigNumber, precision: number): BigNumber {
	return BigNumber.from(
		BN(BN(a.toString()).dividedBy(BN(10).pow(18)).toFixed(precision))
			.multipliedBy(BN(10).pow(18))
			.toFixed()
			.toString(),
	)
}

export function expectToBeApproximately(a: BigNumber, b: BigNumber) {
	expect(b.sub(a).abs()).to.be.lte(10)
}
