import {Builder} from "builder-pattern"
import {BigNumberish} from "ethers"

import {SingleUpnlAndPriceSigStruct} from "../../../src/types/contracts/facets/PartyA/PartyAFacet"
import {decimal, getBlockTimestamp} from "../../utils/Common"
import {getDummySingleUpnlAndPriceSig} from "../../utils/SignatureUtils"
import {OrderType, PositionType} from "../Enums"
import { ethers } from "hardhat";

const data = ethers.AbiCoder.defaultAbiCoder().encode(
	["string"],
	["hello-world"]
);

export interface QuoteRequest {
	partyBWhiteList: string[]
	affiliate: string
	symbolId: BigNumberish
	positionType: PositionType
	orderType: OrderType
	price: BigNumberish
	quantity: BigNumberish
	cva: BigNumberish
	partyAmm: BigNumberish
	partyBmm: BigNumberish
	lf: BigNumberish
	maxFundingRate: BigNumberish
	deadline: Promise<BigNumberish> | BigNumberish
	upnlSig: Promise<SingleUpnlAndPriceSigStruct>
}

export interface QuoteRequestWithData {
	partyBWhiteList: string[]
	affiliate: string
	symbolId: BigNumberish
	positionType: PositionType
	orderType: OrderType
	price: BigNumberish
	quantity: BigNumberish
	cva: BigNumberish
	partyAmm: BigNumberish
	partyBmm: BigNumberish
	lf: BigNumberish
	maxFundingRate: BigNumberish
	deadline: Promise<BigNumberish> | BigNumberish
	upnlSig: Promise<SingleUpnlAndPriceSigStruct>
	data: any
}

const limitDefaultQuoteRequest: QuoteRequest = {
	partyBWhiteList: [],
	symbolId: 1,
	positionType: PositionType.LONG,
	orderType: OrderType.LIMIT,
	price: decimal(1n),
	quantity: decimal(100n),
	cva: decimal(22n),
	partyAmm: decimal(75n),
	partyBmm: decimal(40n),
	lf: decimal(3n),
	maxFundingRate: decimal(2n, 16),
	deadline: getBlockTimestamp(500n),
	affiliate: "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d", //FIXME find a better way
	upnlSig: getDummySingleUpnlAndPriceSig(decimal(1n)),
}

const limitDataQuoteRequest: QuoteRequestWithData = {
	partyBWhiteList: [],
	symbolId: 1,
	positionType: PositionType.LONG,
	orderType: OrderType.LIMIT,
	price: decimal(1n),
	quantity: decimal(100n),
	cva: decimal(22n),
	partyAmm: decimal(75n),
	partyBmm: decimal(40n),
	lf: decimal(3n),
	maxFundingRate: decimal(2n, 16),
	deadline: getBlockTimestamp(500n),
	affiliate: "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d", //FIXME find a better way
	upnlSig: getDummySingleUpnlAndPriceSig(decimal(1n)),
	data: data
}

const marketDefaultQuoteRequest: QuoteRequest = {
	partyBWhiteList: [],
	symbolId: 1,
	positionType: PositionType.LONG,
	orderType: OrderType.MARKET,
	price: decimal(1n),
	quantity: decimal(1000n),
	cva: decimal(22n),
	partyAmm: decimal(75n),
	partyBmm: decimal(40n),
	lf: decimal(3n),
	maxFundingRate: decimal(2n, 16),
	deadline: getBlockTimestamp(500n),
	affiliate: "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d", //FIXME find a better way
	upnlSig: getDummySingleUpnlAndPriceSig(decimal(1n)),
}

export const limitQuoteRequestBuilder = () => Builder(limitDefaultQuoteRequest)
export const limitQuoteRequestWithDataBuilder = ()=>Builder(limitDataQuoteRequest)
export const marketQuoteRequestBuilder = () => Builder(marketDefaultQuoteRequest)
