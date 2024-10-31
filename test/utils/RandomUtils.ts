import {decimal, unDecimal} from "./Common"
import {ethers} from "ethers"

export function pick(array: any[]): any {
	return array[Math.floor(Math.random() * array.length)]
}

export function randomBigNumber(max: bigint, min?: bigint): bigint {
	if (min == null) return BigInt(ethers.randomBytes(32).toString()) % max
	const diff = max - min
	return min + randomBigNumber(diff)
}

export function randomBigNumberRatio(value: bigint, max: number, min?: number): bigint {
	return unDecimal(
		value * randomBigNumber(decimal(BigInt(Math.floor(max * 10000)), 14), min != null ? decimal(BigInt(Math.floor(min * 10000)), 14) : undefined),
	)
}

