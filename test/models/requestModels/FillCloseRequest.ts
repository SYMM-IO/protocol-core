import {Builder} from "builder-pattern"
import {BigNumberish} from "ethers"

import {decimal} from "../../utils/Common"

export interface FillCloseRequest {
	filledAmount: BigNumberish
	closedPrice: BigNumberish
	upnlPartyA: BigNumberish
	upnlPartyB: BigNumberish
	price: BigNumberish
}

const limitDefaultFillCloseRequest: FillCloseRequest = {
	filledAmount: decimal(100n),
	closedPrice: decimal(1n),
	upnlPartyA: 0,
	upnlPartyB: 0,
	price: decimal(1n),
}

const marketDefaultFillCloseRequest: FillCloseRequest = {
	filledAmount: decimal(1000n),
	closedPrice: decimal(1n),
	upnlPartyA: 0,
	upnlPartyB: 0,
	price: decimal(1n),
}

export const limitFillCloseRequestBuilder = () => Builder(limitDefaultFillCloseRequest)
export const marketFillCloseRequestBuilder = () => Builder(marketDefaultFillCloseRequest)
