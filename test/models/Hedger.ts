import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, BigNumberish, ethers } from "ethers";

import { PromiseOrValue } from "../../src/types/common";
import { QuoteStructOutput } from "../../src/types/contracts/facets/ViewFacet";
import { decimal, serializeToJson, unDecimal } from "../utils/Common";
import { logger } from "../utils/LoggerUtils";
import { getPrice } from "../utils/PriceUtils";
import { getDummyPairUpnlAndPriceSig, getDummySingleUpnlSig } from "../utils/SignatureUtils";
import { PositionType } from "./Enums";
import { RunContext } from "./RunContext";
import { EmergencyCloseRequest, emergencyCloseRequestBuilder } from "./requestModels/EmergencyCloseRequest";
import { FillCloseRequest, limitFillCloseRequestBuilder } from "./requestModels/FillCloseRequest";
import { limitOpenRequestBuilder, OpenRequest } from "./requestModels/OpenRequest";
import { PairUpnlSigStructOutput } from "../../src/types/contracts/facets/PartyB/PartyBFacet";
import { runTx } from "../utils/TxUtils";

export class Hedger {
  constructor(private context: RunContext, private signer: SignerWithAddress) {
  }

  public async setup() {
    await this.context.manager.registerHedger(this);
  }

  public async setBalances(collateralAmount?: BigNumberish, depositAmount?: BigNumberish) {
    const userAddress = this.signer.getAddress();

    await runTx(this.context.collateral
      .connect(this.signer)
      .approve(this.context.diamond, ethers.constants.MaxUint256));

    if (collateralAmount)
      await runTx(this.context.collateral.connect(this.signer).mint(userAddress, collateralAmount));
    if (depositAmount) await runTx(this.context.accountFacet.connect(this.signer).deposit(depositAmount));
  }

  public async setNativeBalance(amount: bigint) {
    await setBalance(this.signer.address, amount);
  }

  public async register() {
    await runTx(this.context.controlFacet
      .connect(this.context.signers.admin)
      .registerPartyB(this.signer.getAddress()));
  }

  public async lockQuote(
    id: PromiseOrValue<BigNumberish>,
    upnl: number = 0,
    allocateCoefficient: BigNumber | null = decimal(12, 17),
  ) {
    if (allocateCoefficient != null) {
      const quote = await this.context.viewFacet.getQuote(id);
      const notional = unDecimal(quote.quantity.mul(quote.requestedOpenPrice));
      await runTx(this.context.accountFacet
        .connect(this.signer)
        .allocateForPartyB(
          unDecimal(notional.mul(BigNumber.from(allocateCoefficient))),
          quote.partyA,
        ));
    }
    await runTx(this.context.partyBFacet
      .connect(this.signer)
      .lockQuote(id, await getDummySingleUpnlSig(upnl)));

    logger.info(`Hedger::LockQuote: ${id}`);
  }

  public async unlockQuote(id: PromiseOrValue<BigNumberish>) {
    await runTx(this.context.partyBFacet.connect(this.signer).unlockQuote(id));
    logger.info(`Hedger::UnLockQuote: ${id}`);
  }

  public async openPosition(
    id: PromiseOrValue<BigNumberish>,
    request: OpenRequest = limitOpenRequestBuilder().build(),
  ) {
    const quote = await this.context.viewFacet.getQuote(id);
    const user = this.context.manager.getUser(quote.partyA);
    logger.detailedDebug(
      serializeToJson({
        request: request,
        hedgerBalanceInfo: await this.getBalanceInfo(quote.partyA),
        hedgerUpnl: await this.getUpnl(quote.partyA),
        userBalanceInfo: await user.getBalanceInfo(),
        userUpnl: await user.getUpnl(),
      }),
    );
    await runTx(this.context.partyBFacet
      .connect(this.signer)
      .openPosition(
        id,
        request.filledAmount,
        request.openPrice,
        await getDummyPairUpnlAndPriceSig(request.price, request.upnlPartyA, request.upnlPartyB),
      ));
    logger.info(`Hedger::OpenPosition: ${id}`);
  }

  public async getBalanceInfo(partyA: string): Promise<BalanceInfo> {
    let b = await this.context.viewFacet.balanceInfoOfPartyB(this.getAddress(), partyA);
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

  public async acceptCancelRequest(id: PromiseOrValue<BigNumberish>) {
    await runTx(this.context.partyBFacet.connect(this.signer).acceptCancelRequest(id));
    logger.info(`Hedger::AcceptCancelRequest: ${id}`);
  }

  public async fillCloseRequest(
    id: PromiseOrValue<BigNumberish>,
    request: FillCloseRequest = limitFillCloseRequestBuilder().build(),
  ) {
    const quote = await this.context.viewFacet.getQuote(id);
    const user = this.context.manager.getUser(quote.partyA);
    logger.detailedDebug(
      serializeToJson({
        request: request,
        hedgerBalanceInfo: await this.getBalanceInfo(quote.partyA),
        hedgerUpnl: await this.getUpnl(quote.partyA),
        userBalanceInfo: await user.getBalanceInfo(),
        userUpnl: await user.getUpnl(),
      }),
    );
    await runTx(this.context.partyBFacet
      .connect(this.signer)
      .fillCloseRequest(
        id,
        request.filledAmount,
        request.closedPrice,
        await getDummyPairUpnlAndPriceSig(request.price, request.upnlPartyA, request.upnlPartyB),
      ));
    logger.info(`Hedger::FillCloseRequest: ${id}`);
  }

  public async chargeFundingRate(partyA: string, quoteIds: BigNumberish[], rates: BigNumberish[], signature: PairUpnlSigStructOutput) {
    await this.context.partyBFacet.connect(this.signer).chargeFundingRate(partyA, quoteIds, rates, signature);
    logger.info(`Hedger::ChargeFundingRate: ${partyA}, ${quoteIds}, ${rates}`);
  }

  public async acceptCancelCloseRequest(id: PromiseOrValue<BigNumberish>) {
    await runTx(this.context.partyBFacet.connect(this.signer).acceptCancelCloseRequest(id));
    logger.info(`Hedger::AcceptCancelCloseRequest: ${id}`);
  }

  public async emergencyClosePosition(
    id: PromiseOrValue<BigNumberish>,
    request: EmergencyCloseRequest = emergencyCloseRequestBuilder().build(),
  ) {
    const quote = await this.context.viewFacet.getQuote(id);
    const user = this.context.manager.getUser(quote.partyA);
    logger.detailedDebug(
      serializeToJson({
        request: request,
        hedgerBalanceInfo: await this.getBalanceInfo(quote.partyA),
        hedgerUpnl: await this.getUpnl(quote.partyA),
        userBalanceInfo: await user.getBalanceInfo(),
        userUpnl: await user.getUpnl(),
      }),
    );
    await runTx(this.context.partyBFacet
      .connect(this.signer)
      .emergencyClosePosition(
        id,
        await getDummyPairUpnlAndPriceSig(request.price, request.upnlPartyA, request.upnlPartyB),
      ));
    logger.info(`Hedger::EmergencyClosePosition: ${id}`);
  }

  public async getAddress() {
    return await this.signer.getAddress();
  }

  public async getUpnl(partyA: string): Promise<BigNumber> {
    let openPositions: QuoteStructOutput[] = [];
    const pageSize = 30;
    let last = 0;
    while (true) {
      let page = await this.context.viewFacet.getPartyBOpenPositions(
        this.getAddress(),
        partyA,
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
        unDecimal(amount.mul(priceDiff)).mul(pos.positionType == PositionType.LONG ? -1 : 1),
      );
    }
    return upnl;
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
