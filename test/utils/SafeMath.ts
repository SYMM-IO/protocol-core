import {expect} from "chai"
import {BigNumber as BN} from "bignumber.js"

export function safeDiv(a: bigint, b: bigint): bigint {
	const value = new BN(a.toString()).dividedBy(new BN(b.toString()))
	if (value.isLessThan(1) && value.isGreaterThan(0)) {
		throw new Error("Division led to fraction!")
	}
	return BigInt(value.toFixed(0))
}

BN.set({ROUNDING_MODE: BN.ROUND_CEIL})

export function roundToPrecision(a: bigint, precision: number): bigint {
	return BigInt(
		new BN(a.toString())
			.dividedBy(new BN(10).pow(18))
			.toFixed(precision)
	) * 10n ** 18n
}

export function expectToBeApproximately(a: bigint, b: bigint): void {
	expect(b - a).to.be.lte(10n)
}
