import {Builder} from "builder-pattern"
import {BigNumberish} from "ethers"

import {decimal} from "../../utils/Common"

export interface OpenRequest {
	filledAmount: BigNumberish
	openPrice: BigNumberish
	upnlPartyA: BigNumberish
	upnlPartyB: BigNumberish
	price: BigNumberish
}

const limitDefaultOpenRequest: OpenRequest = {
	filledAmount: decimal(100n),
	openPrice: decimal(1n),
	upnlPartyA: 0,
	upnlPartyB: 0,
	price: decimal(9n, 17),
}

const marketDefaultOpenRequest: OpenRequest = {
	filledAmount: decimal(1000n),
	openPrice: decimal(1n),
	upnlPartyA: 0,
	upnlPartyB: 0,
	price: decimal(1n),
}

export const limitOpenRequestBuilder = () => Builder(limitDefaultOpenRequest)
export const marketOpenRequestBuilder = () => Builder(marketDefaultOpenRequest)
