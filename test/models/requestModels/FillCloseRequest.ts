import { Builder } from "builder-pattern";
import { BigNumberish } from "ethers";

import { decimal } from "../../utils/Common";

export interface FillCloseRequest {
  filledAmount: BigNumberish;
  closedPrice: BigNumberish;
  upnlPartyA: BigNumberish;
  upnlPartyB: BigNumberish;
  price: BigNumberish;
}

const limitDefaultFillCloseRequest: FillCloseRequest = {
  filledAmount: decimal(100),
  closedPrice: decimal(1),
  upnlPartyA: 0,
  upnlPartyB: 0,
  price: decimal(1),
};

const marketDefaultFillCloseRequest: FillCloseRequest = {
  filledAmount: decimal(1000),
  closedPrice: decimal(1),
  upnlPartyA: 0,
  upnlPartyB: 0,
  price: decimal(1),
};

export const limitFillCloseRequestBuilder = () => Builder(limitDefaultFillCloseRequest);
export const marketFillCloseRequestBuilder = () => Builder(marketDefaultFillCloseRequest);
