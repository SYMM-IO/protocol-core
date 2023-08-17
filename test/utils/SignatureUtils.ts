import { BigNumberish } from "ethers";

import {
  PairUpnlAndPriceSigStruct,
  SingleUpnlAndPriceSigStruct,
} from "../../src/types/contracts/facets/PartyA/PartyAFacet";
import { PairUpnlSigStruct, SingleUpnlSigStruct } from "../../src/types/contracts/facets/PartyB/PartyBFacet";
import { PriceSigStruct, QuotePriceSigStruct } from "../../src/types/contracts/facets/liquidation/LiquidationFacet";
import { getBlockTimestamp } from "./Common";

export async function getDummySingleUpnlSig(upnl: BigNumberish = 0): Promise<SingleUpnlSigStruct> {
  return {
    reqId: "0x",
    timestamp: getBlockTimestamp(),
    upnl: upnl,
    gatewaySignature: "0x0000000000000000000000000000000000000000",
    sigs: {
      signature: "0",
      owner: "0x0000000000000000000000000000000000000000",
      nonce: "0x0000000000000000000000000000000000000000",
    },
  };
}

export async function getDummySingleUpnlAndPriceSig(
  price: BigNumberish = 1,
  upnl: BigNumberish = 0,
): Promise<SingleUpnlAndPriceSigStruct> {
  return {
    reqId: "0x",
    timestamp: getBlockTimestamp(),
    upnl: upnl,
    gatewaySignature: "0x0000000000000000000000000000000000000000",
    sigs: {
      signature: "0",
      owner: "0x0000000000000000000000000000000000000000",
      nonce: "0x0000000000000000000000000000000000000000",
    },
    price: price,
  };
}

export async function getDummyPairUpnlAndPriceSig(
  price: BigNumberish = 1,
  upnlPartyA: BigNumberish = 0,
  upnlPartyB: BigNumberish = 0,
): Promise<PairUpnlAndPriceSigStruct> {
  return {
    reqId: "0x",
    timestamp: getBlockTimestamp(),
    upnlPartyA: upnlPartyA,
    upnlPartyB: upnlPartyB,
    gatewaySignature: "0x0000000000000000000000000000000000000000",
    sigs: {
      signature: "0",
      owner: "0x0000000000000000000000000000000000000000",
      nonce: "0x0000000000000000000000000000000000000000",
    },
    price: price,
  };
}

export async function getDummyPairUpnlSig(
  upnlPartyA: BigNumberish = 0,
  upnlPartyB: BigNumberish = 0,
): Promise<PairUpnlSigStruct> {
  return {
    reqId: "0x",
    timestamp: getBlockTimestamp(),
    upnlPartyA: upnlPartyA,
    upnlPartyB: upnlPartyB,
    gatewaySignature: "0x0000000000000000000000000000000000000000",
    sigs: {
      signature: "0",
      owner: "0x0000000000000000000000000000000000000000",
      nonce: "0x0000000000000000000000000000000000000000",
    },
  };
}

export async function getDummyQuotesPriceSig(
  quoteIds: number[],
  prices: BigNumberish[],
): Promise<QuotePriceSigStruct> {
  return {
    reqId: "0x",
    timestamp: getBlockTimestamp(),
    prices: prices,
    quoteIds: quoteIds,
    gatewaySignature: "0x0000000000000000000000000000000000000000",
    sigs: {
      signature: "0",
      owner: "0x0000000000000000000000000000000000000000",
      nonce: "0x0000000000000000000000000000000000000000",
    },
  };
}

export async function getDummyPriceSig(
  symbolIds: BigNumberish[],
  prices: BigNumberish[],
  unpl: BigNumberish,
  totalUnrealizedLoss: BigNumberish,
): Promise<PriceSigStruct> {
  return {
    symbolIds: symbolIds,
    prices: prices,
    totalUnrealizedLoss: totalUnrealizedLoss,
    upnl: unpl,
    reqId: "0x",
    timestamp: getBlockTimestamp(),
    gatewaySignature: "0x0000000000000000000000000000000000000000",
    sigs: {
      signature: "0",
      owner: "0x0000000000000000000000000000000000000000",
      nonce: "0x0000000000000000000000000000000000000000",
    },
  };
}
