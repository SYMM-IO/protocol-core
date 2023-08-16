import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, BigNumberish, ethers } from "ethers";

import { PromiseOrValue } from "../../src/types/common";
import { serializeToJson, unDecimal } from "../utils/Common";
import { logger } from "../utils/LoggerUtils";
import { getPrice } from "../utils/PriceUtils";
import { getDummySingleUpnlAndPriceSig } from "../utils/SignatureUtils";
import { QuoteStructOutput } from "../../src/types/contracts/facets/ViewFacet";
import { PositionType } from "./Enums";
import { RunContext } from "./RunContext";
import { CloseRequest, limitCloseRequestBuilder } from "./requestModels/CloseRequest";
import { limitQuoteRequestBuilder, QuoteRequest } from "./requestModels/QuoteRequest";

export class User {
  constructor(private context: RunContext, private signer: SignerWithAddress) {
  }

  public async setup() {
    await this.context.manager.registerUser(this);
  }

  public async setBalances(
    collateralAmount?: BigNumberish,
    depositAmount?: BigNumberish,
    allocatedAmount?: BigNumberish,
  ) {
    const userAddress = this.signer.getAddress();

    await this.context.collateral
      .connect(this.signer)
      .approve(this.context.diamond, ethers.constants.MaxUint256);

    if (collateralAmount)
      await this.context.collateral.connect(this.signer).mint(userAddress, collateralAmount);
    if (depositAmount) await this.context.accountFacet.connect(this.signer).deposit(depositAmount);
    if (allocatedAmount)
      await this.context.accountFacet.connect(this.signer).allocate(allocatedAmount);
  }

  public async setNativeBalance(amount: bigint) {
    await setBalance(this.signer.address, amount);
  }

  public async sendQuote(request: QuoteRequest = limitQuoteRequestBuilder().build()) {
    logger.detailedDebug(
      serializeToJson({
        request: request,
        userBalanceInfo: await this.getBalanceInfo(),
        userUpnl: await this.getUpnl(),
      }),
    );
    let tx = await this.context.partyAFacet
      .connect(this.signer)
      .sendQuote(
        request.partyBWhiteList,
        request.symbolId,
        request.positionType,
        request.orderType,
        request.price,
        request.quantity,
        request.cva,
        request.mm,
        request.lf,
        request.maxFundingRate,
        request.deadline,
        await request.upnlSig,
      );
    let id = (await tx.wait()).events?.filter((x: any) => x.event == "SendQuote")[0]!.args!.quoteId;
    logger.info("User::::SendQuote: " + id);
    return id;
  }

  public async requestToCancelQuote(id: PromiseOrValue<BigNumberish>) {
    logger.detailedDebug(
      serializeToJson({
        request: "RequestToCancelQuote",
        userBalanceInfo: await this.getBalanceInfo(),
        userUpnl: await this.getUpnl(),
      }),
    );
    await this.context.partyAFacet.connect(this.signer).requestToCancelQuote(id);
    logger.info(`User::::RequestToCancelQuote: ${id}`);
  }

  public async getBalanceInfo(): Promise<BalanceInfo> {
    let b = await this.context.viewFacet.balanceInfoOfPartyA(this.getAddress());
    return {
      allocatedBalances: b[0],
      lockedCva: b[1],
      lockedMm: b[2],
      lockedLf: b[3],
      totalLocked: b[4],
      pendingLockedCva: b[5],
      pendingLockedMm: b[6],
      pendingLockedLf: b[7],
      totalPendingLocked: b[8],
    };
  }

  public async requestToClosePosition(
    id: PromiseOrValue<BigNumberish>,
    request: CloseRequest = limitCloseRequestBuilder().build(),
  ) {
    logger.detailedDebug(
      serializeToJson({
        request: request,
        userBalanceInfo: await this.getBalanceInfo(),
        userUpnl: await this.getUpnl(),
      }),
    );
    await this.context.partyAFacet
      .connect(this.signer)
      .requestToClosePosition(
        id,
        request.closePrice,
        request.quantityToClose,
        request.orderType,
        request.deadline,
        await getDummySingleUpnlAndPriceSig(request.price, request.upnl),
      );
    logger.info(`User::::RequestToClosePosition: ${id}`);
  }

  public async requestToCancelCloseRequest(id: PromiseOrValue<BigNumberish>) {
    logger.detailedDebug(
      serializeToJson({
        request: "RequestToCancelCloseRequest",
        userBalanceInfo: await this.getBalanceInfo(),
        userUpnl: await this.getUpnl(),
      }),
    );
    await this.context.partyAFacet.connect(this.signer).requestToCancelCloseRequest(id);
    logger.info(`User::::RequestToCancelCloseRequest: ${id}`);
  }

  public getAddress() {
    return this.signer.getAddress();
  }

  public async getUpnl(): Promise<BigNumber> {
    let openPositions: QuoteStructOutput[] = [];
    const pageSize = 30;
    let last = 0;
    while (true) {
      let page = await this.context.viewFacet.getPartyAOpenPositions(
        this.getAddress(),
        last,
        pageSize,
      );
      openPositions.push(...page);
      if (page.length < pageSize) break;
    }

    let upnl = BigNumber.from(0);
    for (const pos of openPositions) {
      const priceDiff = pos.openedPrice.sub(
        await getPrice((await this.context.viewFacet.getSymbol(pos.symbolId)).name),
      );
      const amount = pos.quantity.sub(pos.closedAmount);
      upnl.add(
        unDecimal(amount.mul(priceDiff)).mul(pos.positionType == PositionType.LONG ? 1 : -1),
      );
    }
    return upnl;
  }

  public async getAvailableBalanceForQuote(upnl: BigNumber): Promise<BigNumber> {
    const balanceInfo = await this.getBalanceInfo();
    let available: BigNumber;
    if (upnl.gt(0)) {
      available = balanceInfo.allocatedBalances
        .add(upnl)
        .sub(balanceInfo.totalLocked.add(balanceInfo.totalPendingLocked));
    } else {
      let mm = balanceInfo.lockedMm;
      let mUpnl = upnl.mul(-1);
      let considering_mm = mUpnl.gt(mm) ? mUpnl : mm;
      available = balanceInfo.allocatedBalances
        .sub(balanceInfo.lockedCva.add(balanceInfo.lockedLf).add(balanceInfo.totalPendingLocked))
        .sub(considering_mm);
    }
    return available;
  }
}

export interface BalanceInfo {
  allocatedBalances: BigNumber;
  lockedCva: BigNumber;
  lockedMm: BigNumber;
  lockedLf: BigNumber;
  totalLocked: BigNumber;
  pendingLockedCva: BigNumber;
  pendingLockedMm: BigNumber;
  pendingLockedLf: BigNumber;
  totalPendingLocked: BigNumber;
}
