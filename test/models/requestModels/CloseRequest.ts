import { Builder } from "builder-pattern"
import { BigNumberish } from "ethers"

import { PromiseOrValue } from "../../../src/types/common"
import { decimal, getBlockTimestamp } from "../../utils/Common"
import { OrderType } from "../Enums"

export interface CloseRequest {
	quantityToClose: BigNumberish;
	closePrice: BigNumberish;
	price: BigNumberish;
	upnl: BigNumberish;
	orderType: OrderType;
	deadline: PromiseOrValue<BigNumberish>;
}

const limitDefaultCloseRequest: CloseRequest = {
	quantityToClose: decimal(100),
	closePrice: decimal(1),
	price: decimal(1),
	upnl: "0",
	orderType: OrderType.LIMIT,
	deadline: getBlockTimestamp(500),
}

const marketDefaultCloseRequest: CloseRequest = {
	quantityToClose: decimal(1000),
	closePrice: decimal(1),
	price: decimal(1),
	upnl: "0",
	orderType: OrderType.MARKET,
	deadline: getBlockTimestamp(500),
}

export const limitCloseRequestBuilder = () => Builder(limitDefaultCloseRequest)
export const marketCloseRequestBuilder = () => Builder(marketDefaultCloseRequest)
