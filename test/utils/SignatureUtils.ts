import { BigNumber, BigNumberish } from "ethers"

import { HighLowPriceSigStruct, SingleUpnlAndPriceSigStruct } from "../../src/types/contracts/facets/PartyA/PartyAFacet"
import { PairUpnlAndPriceSigStruct, SingleUpnlSigStruct } from "../../src/types/contracts/facets/PartyB/PartyBFacet"
import { LiquidationSigStruct, QuotePriceSigStruct } from "../../src/types/contracts/facets/liquidation/LiquidationFacet"
import { getBlockTimestamp } from "./Common"
import { PairUpnlSigStructOutput } from "../../src/types/contracts/facets/FundingRate/FundingRateFacet"
import { zeroAddress } from "./Common"

export async function getDummySingleUpnlSig(upnl: BigNumberish = 0): Promise<SingleUpnlSigStruct> {
	return {
		reqId: "0x",
		timestamp: await getBlockTimestamp(),
		upnl: upnl,
		gatewaySignature: zeroAddress,
		sigs: {
			signature: "0",
			owner: zeroAddress,
			nonce: zeroAddress,
		},
	}
}

export async function getDummyLiquidationSig(
	liquidationId: string,
	upnl: BigNumberish = 0,
	symbolIds: BigNumberish[],
	prices: BigNumberish[],
	totalUnrealizedLoss: BigNumberish,
): Promise<LiquidationSigStruct> {
	return {
		reqId: "0x",
		timestamp: getBlockTimestamp(),
		liquidationId: liquidationId,
		upnl: upnl,
		totalUnrealizedLoss: totalUnrealizedLoss,
		prices: prices,
		symbolIds: symbolIds,
		gatewaySignature: zeroAddress,
		sigs: {
			signature: "0",
			owner: zeroAddress,
			nonce: zeroAddress,
		},
	}
}

export async function getDummySingleUpnlAndPriceSig(price: BigNumberish = 1, upnl: BigNumberish = 0): Promise<SingleUpnlAndPriceSigStruct> {
	return {
		reqId: "0x",
		timestamp: await getBlockTimestamp(),
		upnl: upnl,
		gatewaySignature: zeroAddress,
		sigs: {
			signature: "0",
			owner: zeroAddress,
			nonce: zeroAddress,
		},
		price: price,
	}
}

export async function getDummyPairUpnlAndPriceSig(
	price: BigNumberish = 1,
	upnlPartyA: BigNumberish = 0,
	upnlPartyB: BigNumberish = 0,
): Promise<PairUpnlAndPriceSigStruct> {
	return {
		reqId: "0x",
		timestamp: await getBlockTimestamp(),
		upnlPartyA: upnlPartyA,
		upnlPartyB: upnlPartyB,
		gatewaySignature: zeroAddress,
		sigs: {
			signature: "0",
			owner: zeroAddress,
			nonce: zeroAddress,
		},
		price: price,
	}
}

export async function getDummyPairUpnlSig(
	upnlPartyA: BigNumber = BigNumber.from(0),
	upnlPartyB: BigNumber = BigNumber.from(0),
): Promise<PairUpnlSigStructOutput> {
	return {
		reqId: "0x",
		timestamp: BigNumber.from(await getBlockTimestamp()),
		upnlPartyA: upnlPartyA,
		upnlPartyB: upnlPartyB,
		gatewaySignature: zeroAddress,
		sigs: {
			signature: BigNumber.from(0),
			owner: zeroAddress,
			nonce: zeroAddress,
		} as any,
	} as any
}

export async function getDummyHighLowPriceSig(
	startTime: BigNumberish = 0,
	endTime: BigNumberish = 0,
	lowest: BigNumberish = 0,
	highest: BigNumberish = 0,
	currentPrice: BigNumberish = 0,
	averagePrice: BigNumberish = 0,
	symbolId: BigNumberish = 0,
	upnlPartyB: BigNumberish = 0,
	upnlPartyA: BigNumberish = 0,
): Promise<HighLowPriceSigStruct> {
	return {
		reqId: "0x",
		timestamp: getBlockTimestamp(),
		highest: highest,
		lowest: lowest,
		currentPrice: currentPrice,
		averagePrice: averagePrice,
		startTime: startTime,
		endTime: endTime,
		symbolId: symbolId,
		upnlPartyB: upnlPartyB,
		upnlPartyA: upnlPartyA,
		gatewaySignature: zeroAddress,
		sigs: {
			signature: "0",
			owner: zeroAddress,
			nonce: zeroAddress,
		},
	}
}

export async function getDummyPriceSig(quoteIds: BigNumberish[] = [], prices: BigNumberish[] = []): Promise<QuotePriceSigStruct> {
	return {
		reqId: "0x",
		timestamp: await getBlockTimestamp(),
		quoteIds: quoteIds,
		prices: prices,
		gatewaySignature: zeroAddress,
		sigs: {
			signature: "0",
			owner: zeroAddress,
			nonce: zeroAddress,
		},
	}
}
