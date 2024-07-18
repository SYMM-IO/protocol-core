import { Builder } from "builder-pattern"
import { BigNumberish } from "ethers"

import { PromiseOrValue } from "../../../src/types/common"
import { SingleUpnlAndPriceSigStruct } from "../../../src/types/contracts/facets/PartyA/PartyAFacet"
import { decimal, getBlockTimestamp } from "../../utils/Common"
import { getDummySingleUpnlAndPriceSig } from "../../utils/SignatureUtils"
import { OrderType, PositionType } from "../Enums"

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
	deadline: PromiseOrValue<BigNumberish>
	upnlSig: Promise<SingleUpnlAndPriceSigStruct>
}

const limitDefaultQuoteRequest: QuoteRequest = {
	partyBWhiteList: [],
	symbolId: 1,
	positionType: PositionType.LONG,
	orderType: OrderType.LIMIT,
	price: decimal(1),
	quantity: decimal(100),
	cva: decimal(22),
	partyAmm: decimal(75),
	partyBmm: decimal(40),
	lf: decimal(3),
	maxFundingRate: decimal(2, 16),
	deadline: getBlockTimestamp(500),
	affiliate: "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c", //FIXME find a better way
	upnlSig: getDummySingleUpnlAndPriceSig(decimal(1)),
}

const marketDefaultQuoteRequest: QuoteRequest = {
	partyBWhiteList: [],
	symbolId: 1,
	positionType: PositionType.LONG,
	orderType: OrderType.MARKET,
	price: decimal(1),
	quantity: decimal(1000),
	cva: decimal(22),
	partyAmm: decimal(75),
	partyBmm: decimal(40),
	lf: decimal(3),
	maxFundingRate: decimal(2, 16),
	deadline: getBlockTimestamp(500),
	affiliate: "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c", //FIXME find a better way
	upnlSig: getDummySingleUpnlAndPriceSig(decimal(1)),
}

export const limitQuoteRequestBuilder = () => Builder(limitDefaultQuoteRequest)
export const marketQuoteRequestBuilder = () => Builder(marketDefaultQuoteRequest)
