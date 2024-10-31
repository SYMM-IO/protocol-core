import {Builder} from "builder-pattern"

import {decimal, getBlockTimestamp} from "../../utils/Common"
import {OrderType} from "../Enums"

export interface CloseRequest {
	quantityToClose: bigint;
	closePrice: bigint;
	price: bigint;
	upnl: bigint;
	orderType: OrderType;
	deadline: Promise<bigint> | bigint;
}

const limitDefaultCloseRequest: CloseRequest = {
	quantityToClose: decimal(100n),
	closePrice: decimal(1n),
	price: decimal(1n),
	upnl: 0n,
	orderType: OrderType.LIMIT,
	deadline: getBlockTimestamp(500n) as Promise<bigint>,
}

const marketDefaultCloseRequest: CloseRequest = {
	quantityToClose: decimal(1000n),
	closePrice: decimal(1n),
	price: decimal(1n),
	upnl: 0n,
	orderType: OrderType.MARKET,
	deadline: getBlockTimestamp(500n) as Promise<bigint>,
}

export const limitCloseRequestBuilder = () => Builder(limitDefaultCloseRequest)
export const marketCloseRequestBuilder = () => Builder(marketDefaultCloseRequest)
