import {time} from "@nomicfoundation/hardhat-network-helpers"
import {JsonSerializer} from "typescript-json-serializer"

import {OrderType, QuoteStatus} from "../models/Enums"
import {RunContext} from "../models/RunContext"
import {safeDiv} from "./SafeMath"
import {network} from "hardhat"
import {QuoteStructOutput, SymbolStructOutput} from "../../src/types/contracts/interfaces/ISymmio"

const defaultSerializer = new JsonSerializer()

export type PromiseOrValue<T> = T | Promise<T>;

export function decimal(value: bigint, decimal: number = 18): bigint {
	return value * 10n ** BigInt(decimal)
}

export function unDecimal(value: bigint, decimal: number = 18): bigint {
	return value / 10n ** BigInt(decimal)
}

export async function getBlockTimestamp(additional: bigint = 0n): Promise<bigint> {
	if (network.name === "hardhat") {
		return BigInt(await time.latest()) + 1n + additional
	}
	return 1722859307n
}

export async function getQuoteQuantity(context: RunContext, quoteId: bigint): Promise<bigint> {
	return (await context.viewFacet.getQuote(quoteId)).quantity
}

export async function getQuoteMinLeftQuantityForClose(context: RunContext, quoteId: bigint): Promise<bigint> {
	const openAmount = await getQuoteOpenAmount(context, quoteId)
	const totalLocked = await getTotalLockedValuesForQuoteIds(context, [quoteId])

	const q = await context.viewFacet.getQuote(quoteId)
	const symbol: SymbolStructOutput = await context.viewFacet.getSymbol(q.symbolId)

	return safeDiv(symbol.minAcceptableQuoteValue * openAmount, totalLocked)
}

export async function getQuoteMinLeftQuantityForFill(context: RunContext, quoteId: bigint): Promise<bigint> {
	const openAmount = await getQuoteOpenAmount(context, quoteId)
	const totalLocked = await getTotalLockedValuesForQuoteIds(context, [quoteId])

	const q = await context.viewFacet.getQuote(quoteId)
	const symbol: SymbolStructOutput = await context.viewFacet.getSymbol(q.symbolId)

	return safeDiv(symbol.minAcceptableQuoteValue * openAmount, totalLocked)
}

export async function getQuoteOpenAmount(context: RunContext, quoteId: bigint): Promise<bigint> {
	const q = await context.viewFacet.getQuote(quoteId)
	return q.quantity - q.closedAmount
}

export async function getQuoteNotFilledAmount(context: RunContext, quoteId: bigint): Promise<bigint> {
	const q = await context.viewFacet.getQuote(quoteId)
	return q.quantityToClose - q.closedAmount
}

export async function getTotalPartyALockedValuesForQuotes(
	quotes: QuoteStructOutput[],
	includeMM: boolean = true,
	returnAfterOpened: boolean = true,
): Promise<bigint> {
	let out = 0n
	for (const q of quotes) {
		let addition = q.lockedValues.cva + q.lockedValues.lf
		if (includeMM) addition += q.lockedValues.partyAmm
		if (returnAfterOpened && q.orderType === BigInt(OrderType.LIMIT)) {
			if (q.requestedOpenPrice < q.openedPrice) addition *= q.openedPrice / q.requestedOpenPrice
		}
		out += addition
	}
	return out
}

export async function getTotalPartyBLockedValuesForQuotes(
	quotes: QuoteStructOutput[],
	includeMM: boolean = true,
	returnAfterOpened: boolean = true,
): Promise<bigint> {
	let out = 0n
	for (const q of quotes) {
		let addition = q.lockedValues.cva + q.lockedValues.lf
		if (includeMM) addition += q.lockedValues.partyBmm
		if (returnAfterOpened && q.orderType === BigInt(OrderType.LIMIT)) {
			if (q.requestedOpenPrice < q.openedPrice) addition *= q.openedPrice / q.requestedOpenPrice
		}
		out += addition
	}
	return out
}

export async function getTotalLockedValuesForQuoteIds(
	context: RunContext,
	quoteIds: bigint[],
	includeMM: boolean = true,
	returnAfterOpened: boolean = true,
): Promise<bigint> {
	let quotes: QuoteStructOutput[] = []
	for (const quoteId of quoteIds) quotes.push(await context.viewFacet.getQuote(quoteId))
	return getTotalPartyALockedValuesForQuotes(quotes, includeMM, returnAfterOpened)
}

export async function getTradingFeeForQuotes(context: RunContext, quoteIds: bigint[]): Promise<bigint> {
	let out = 0n
	for (const quoteId of quoteIds) {
		let q = await context.viewFacet.getQuote(quoteId)
		let tf = (await context.viewFacet.getSymbol(q.symbolId)).tradingFee
		if (q.orderType === BigInt(OrderType.LIMIT)) out += unDecimal(q.quantity * q.requestedOpenPrice * tf, 36)
		else out += unDecimal(q.quantity * q.marketPrice * tf, 36)
	}
	return out
}

export async function getTradingFeeForQuoteWithFilledAmount(context: RunContext, quoteId: bigint, filledAmounts: bigint): Promise<bigint> {
	let out = 0n
	let q = await context.viewFacet.getQuote(quoteId)
	let tf = (await context.viewFacet.getSymbol(q.symbolId)).tradingFee
	if (q.orderType === BigInt(OrderType.LIMIT)) out += unDecimal(filledAmounts * q.requestedOpenPrice * tf, 36)
	else out += unDecimal(filledAmounts * q.marketPrice * tf, 36)
	return out
}

export async function pausePartyB(context: RunContext): Promise<void> {
	await context.controlFacet.connect(context.signers.admin).pausePartyBActions()
}

export async function pausePartyA(context: RunContext): Promise<void> {
	await context.controlFacet.connect(context.signers.admin).pausePartyAActions()
}

export async function getValue<T>(pov: T | Promise<T>): Promise<T> {
	if (pov instanceof Promise) return await pov
	return pov
}

export async function getBigNumberValue(pov: bigint | Promise<bigint>): Promise<bigint> {
	if (pov instanceof Promise) return await pov
	return pov
}

export async function getSymbols(context: RunContext): Promise<SymbolStructOutput[]> {
	return await context.viewFacet.getSymbols(0, 100)
}

export function max(a: bigint, b: bigint): bigint {
	return a >= b ? a : b
}

export function min(a: bigint, b: bigint): bigint {
	return a >= b ? b : a
}

export function serializeToJson(object: any): any {
	return defaultSerializer.serialize(object)
}

export async function checkStatus(context: RunContext, quoteId: bigint, quoteStatus: QuoteStatus): Promise<boolean> {
	return (await context.viewFacet.getQuote(quoteId)).quoteStatus === BigInt(quoteStatus)
}

export function getPriceFetcher(symbolIds: bigint[], prices: bigint[]): (symbolId: bigint) => Promise<bigint> {
	return async (symbolId: bigint): Promise<bigint> => {
		for (let i = 0; i < symbolIds.length; i++) {
			if (symbolIds[i] === symbolId) return prices[i]
		}
		throw new Error("Invalid price requested")
	}
}
