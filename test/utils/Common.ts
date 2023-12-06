import { time } from "@nomicfoundation/hardhat-network-helpers"
import { BigNumber, BigNumberish } from "ethers"
import { JsonSerializer } from "typescript-json-serializer"

import { PromiseOrValue } from "../../src/types/common"
import { OrderType, QuoteStatus } from "../models/Enums"
import { RunContext } from "../models/RunContext"
import { QuoteStructOutput, SymbolStructOutput } from "../../src/types/contracts/facets/ViewFacet"
import { safeDiv } from "./SafeMath"
import { network } from "hardhat"

const defaultSerializer = new JsonSerializer()

export function decimal(value: number, decimal: number = 18): BigNumber {
	return BigNumber.from(value).mul(BigNumber.from(10).pow(decimal))
}

export function unDecimal(value: BigNumber, decimal: number = 18): BigNumber {
	return safeDiv(value, BigNumber.from(10).pow(decimal))
}

export async function getBlockTimestamp(additional: number = 0): Promise<number> {
	if (network.name == "hardhat") {
		return (await time.latest()) + 1 + additional
	}
	return 1722859307
}

export async function getQuoteQuantity(context: RunContext, quoteId: PromiseOrValue<BigNumberish>) {
	return (await context.viewFacet.getQuote(quoteId)).quantity
}

export async function getQuoteMinLeftQuantityForClose(
	context: RunContext,
	quoteId: PromiseOrValue<BigNumberish>,
) {
	const openAmount = await getQuoteOpenAmount(context, quoteId)
	const totalLocked = await getTotalLockedValuesForQuoteIds(context, [ quoteId ])
	
	const q = await context.viewFacet.getQuote(quoteId)
	const symbol: SymbolStructOutput = await context.viewFacet.getSymbol(q.symbolId)
	
	return safeDiv(symbol.minAcceptableQuoteValue.mul(openAmount), totalLocked)
}

export async function getQuoteMinLeftQuantityForFill(
	context: RunContext,
	quoteId: PromiseOrValue<BigNumberish>,
) {
	const openAmount = await getQuoteOpenAmount(context, quoteId)
	const totalLocked = await getTotalLockedValuesForQuoteIds(context, [ quoteId ])
	
	const q = await context.viewFacet.getQuote(quoteId)
	const symbol: SymbolStructOutput = await context.viewFacet.getSymbol(q.symbolId)
	
	return safeDiv(symbol.minAcceptableQuoteValue.mul(openAmount), totalLocked)
}

export async function getQuoteOpenAmount(
	context: RunContext,
	quoteId: PromiseOrValue<BigNumberish>,
) {
	const q = await context.viewFacet.getQuote(quoteId)
	return q.quantity.sub(q.closedAmount)
}

export async function getQuoteNotFilledAmount(
	context: RunContext,
	quoteId: PromiseOrValue<BigNumberish>,
) {
	const q = await context.viewFacet.getQuote(quoteId)
	return q.quantityToClose.sub(q.closedAmount)
}

export async function getTotalPartyALockedValuesForQuotes(
	quotes: QuoteStructOutput[],
	includeMM: boolean = true,
	returnAfterOpened: boolean = true,
): Promise<BigNumber> {
	let out = BigNumber.from(0)
	for (const q of quotes) {
		let addition
		addition = q.lockedValues.cva.add(q.lockedValues.lf)
		if (includeMM) addition = addition.add(q.lockedValues.partyAmm)
		if (returnAfterOpened && q.orderType == OrderType.LIMIT) {
			if (q.requestedOpenPrice.lt(q.openedPrice))
				addition = addition.mul(q.openedPrice.div(q.requestedOpenPrice))
		}
		out = out.add(addition)
	}
	return out
}

export async function getTotalPartyBLockedValuesForQuotes(
	quotes: QuoteStructOutput[],
	includeMM: boolean = true,
	returnAfterOpened: boolean = true,
): Promise<BigNumber> {
	let out = BigNumber.from(0)
	for (const q of quotes) {
		let addition
		addition = q.lockedValues.cva.add(q.lockedValues.lf)
		if (includeMM) addition = addition.add(q.lockedValues.partyBmm)
		if (returnAfterOpened && q.orderType == OrderType.LIMIT) {
			if (q.requestedOpenPrice.lt(q.openedPrice))
				addition = addition.mul(q.openedPrice.div(q.requestedOpenPrice))
		}
		out = out.add(addition)
	}
	return out
}

export async function getTotalLockedValuesForQuoteIds(
	context: RunContext,
	quoteIds: PromiseOrValue<BigNumberish>[],
	includeMM: boolean = true,
	returnAfterOpened: boolean = true,
): Promise<BigNumber> {
	let quotes = []
	for (const quoteId of quoteIds) quotes.push(await context.viewFacet.getQuote(quoteId))
	return getTotalPartyALockedValuesForQuotes(quotes, includeMM, returnAfterOpened)
}

export async function getTradingFeeForQuotes(
	context: RunContext,
	quoteIds: PromiseOrValue<BigNumberish>[],
): Promise<BigNumber> {
	let out = BigNumber.from(0)
	for (const quoteId of quoteIds) {
		let q = await context.viewFacet.getQuote(quoteId)
		let tf = (await context.viewFacet.getSymbol(q.symbolId)).tradingFee
		if (q.orderType == OrderType.LIMIT)
			out = out.add(unDecimal(q.quantity.mul(q.requestedOpenPrice).mul(tf), 36))
		else out = out.add(unDecimal(q.quantity.mul(q.marketPrice).mul(tf), 36))
	}
	return out
}

export async function pausePartyB(context: RunContext) {
	await context.controlFacet.connect(context.signers.admin).pausePartyBActions()
}

export async function pausePartyA(context: RunContext) {
	await context.controlFacet.connect(context.signers.admin).pausePartyAActions()
}

export async function getValue<T>(pov: PromiseOrValue<T>): Promise<T> {
	if (pov instanceof Promise) return await pov
	return pov
}

export async function getBigNumberValue(pov: PromiseOrValue<BigNumberish>): Promise<BigNumber> {
	if (pov instanceof Promise) return BigNumber.from(await pov)
	return BigNumber.from(pov)
}

export async function getSymbols(context: RunContext): Promise<SymbolStructOutput[]> {
	return await context.viewFacet.getSymbols(0, 100)
}

export function max(a: BigNumberish, b: BigNumberish): BigNumber {
	const aa = BigNumber.from(a)
	const bb = BigNumber.from(b)
	return aa.gte(bb) ? aa : bb
}

export function min(a: BigNumberish, b: BigNumberish): BigNumber {
	const aa = BigNumber.from(a)
	const bb = BigNumber.from(b)
	return aa.gte(bb) ? bb : aa
}

export function serializeToJson(object: any) {
	return defaultSerializer.serialize(object)
}

export async function checkStatus(
	context: RunContext,
	quoteId: BigNumberish,
	quoteStatus: QuoteStatus,
) {
	return (await context.viewFacet.getQuote(quoteId)).quoteStatus == quoteStatus
}

export function getPriceFetcher(symbolIds: BigNumberish[], prices: BigNumber[]) {
	return async (symbolId: BigNumber) => {
		for (let i = 0 ; i < symbolIds.length ; i++) {
			if (symbolIds[i] == symbolId)
				return prices[i]
		}
		throw new Error("Invalid price requested")
	}
}