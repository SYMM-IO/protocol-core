import { Builder } from "builder-pattern";
import { BigNumberish } from "ethers";

import { PromiseOrValue } from "../../../src/types/common";
import { SingleUpnlAndPriceSigStruct } from "../../../src/types/contracts/facets/PartyA/PartyAFacet";
import { decimal, getBlockTimestamp } from "../../utils/Common";
import { getDummySingleUpnlAndPriceSig } from "../../utils/SignatureUtils";
import { OrderType, PositionType } from "../Enums";

export interface QuoteRequest {
  partyBWhiteList: string[];
  symbolId: BigNumberish;
  positionType: PositionType;
  orderType: OrderType;
  price: BigNumberish;
  quantity: BigNumberish;
  cva: BigNumberish;
  mm: BigNumberish;
  lf: BigNumberish;
  maxInterestRate: BigNumberish;
  deadline: PromiseOrValue<BigNumberish>;
  upnlSig: Promise<SingleUpnlAndPriceSigStruct>;
}

const limitDefaultQuoteRequest: QuoteRequest = {
  partyBWhiteList: [],
  symbolId: 1,
  positionType: PositionType.LONG,
  orderType: OrderType.LIMIT,
  price: decimal(1),
  quantity: decimal(100),
  cva: decimal(22),
  mm: decimal(75),
  lf: decimal(3),
  maxInterestRate: 0,
  deadline: getBlockTimestamp(500),
  upnlSig: getDummySingleUpnlAndPriceSig(decimal(1)),
};

const marketDefaultQuoteRequest: QuoteRequest = {
  partyBWhiteList: [],
  symbolId: 1,
  positionType: PositionType.LONG,
  orderType: OrderType.MARKET,
  price: decimal(1),
  quantity: decimal(1000),
  cva: decimal(22),
  mm: decimal(75),
  lf: decimal(3),
  maxInterestRate: 0,
  deadline: getBlockTimestamp(500),
  upnlSig: getDummySingleUpnlAndPriceSig(decimal(1)),
};

export const limitQuoteRequestBuilder = () => Builder(limitDefaultQuoteRequest);
export const marketQuoteRequestBuilder = () => Builder(marketDefaultQuoteRequest);
