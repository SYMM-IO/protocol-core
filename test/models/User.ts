import { setBalance } from "@nomicfoundation/hardhat-network-helpers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber, BigNumberish, ethers } from "ethers"

import { PromiseOrValue } from "../../src/types/common"
import { getPriceFetcher, serializeToJson, unDecimal } from "../utils/Common"
import { logger } from "../utils/LoggerUtils"
import { getPrice } from "../utils/PriceUtils"
import { PositionType } from "./Enums"
import { RunContext } from "./RunContext"
import { CloseRequest, limitCloseRequestBuilder } from "./requestModels/CloseRequest"
import { limitQuoteRequestBuilder, QuoteRequest } from "./requestModels/QuoteRequest"
import { runTx } from "../utils/TxUtils"
import { getDummyLiquidationSig } from "../utils/SignatureUtils"
import { LiquidationSigStruct } from "../../src/types/contracts/facets/liquidation/LiquidationFacet"
import { HighLowPriceSigStruct } from "../../src/types/contracts/facets/PartyA/PartyAFacet"
import { QuoteStructOutput } from "../../src/types/contracts/interfaces/ISymmio";

export class User {
	constructor(private context: RunContext, private signer: SignerWithAddress) {}

	public async setup() {
		await this.context.manager.registerUser(this)
	}

	public async setBalances(collateralAmount?: BigNumberish, depositAmount?: BigNumberish, allocatedAmount?: BigNumberish) {
		const userAddress = this.signer.getAddress()

		await runTx(this.context.collateral.connect(this.signer).approve(this.context.diamond, ethers.constants.MaxUint256))

		if (collateralAmount) await runTx(this.context.collateral.connect(this.signer).mint(userAddress, collateralAmount))
		if (depositAmount) await runTx(this.context.accountFacet.connect(this.signer).deposit(depositAmount))
		if (allocatedAmount) await runTx(this.context.accountFacet.connect(this.signer).allocate(allocatedAmount))
	}

	public async setNativeBalance(amount: bigint) {
		await setBalance(this.signer.address, amount)
	}

	public async sendQuote(request: QuoteRequest = limitQuoteRequestBuilder().build()): Promise<BigNumber> {
		logger.detailedDebug(
			serializeToJson({
				request: request,
				userBalanceInfo: await this.getBalanceInfo(),
				userUpnl: await this.getUpnl(),
			}),
		)
		let tx = await this.context.partyAFacet
			.connect(this.signer)
			.sendQuoteWithAffiliate(
				request.partyBWhiteList,
				request.symbolId,
				request.positionType,
				request.orderType,
				request.price,
				request.quantity,
				request.cva,
				request.lf,
				request.partyAmm,
				request.partyBmm,
				request.maxFundingRate,
				request.deadline,
				this.context.multiAccount,
				await request.upnlSig,
			)
		let id = (await tx.wait()).events?.filter((x: any) => x.event == "SendQuote")[0]!.args!.quoteId
		logger.info("User::::SendQuote: " + id)
		return id
	}

	public async requestToCancelQuote(id: PromiseOrValue<BigNumberish>) {
		logger.detailedDebug(
			serializeToJson({
				request: "RequestToCancelQuote",
				userBalanceInfo: await this.getBalanceInfo(),
				userUpnl: await this.getUpnl(),
			}),
		)
		await runTx(this.context.partyAFacet.connect(this.signer).requestToCancelQuote(id))
		logger.info(`User::::RequestToCancelQuote: ${id}`)
	}

	public async getBalanceInfo(): Promise<BalanceInfo> {
		let b = await this.context.viewFacet.balanceInfoOfPartyA(this.getAddress())
		return {
			allocatedBalances: b[0],
			lockedCva: b[1],
			lockedLf: b[2],
			lockedMmPartyA: b[3],
			lockedMmPartyB: b[4],
			totalLockedPartyA: b[1].add(b[2]).add(b[3]),
			totalLockedPartyB: b[1].add(b[2]).add(b[4]),
			pendingLockedCva: b[5],
			pendingLockedLf: b[6],
			pendingLockedMmPartyA: b[7],
			pendingLockedMmPartyB: b[8],
			totalPendingLockedPartyA: b[5].add(b[6]).add(b[7]),
			totalPendingLockedPartyB: b[5].add(b[6]).add(b[8]),
		}
	}

	public async requestToClosePosition(id: PromiseOrValue<BigNumberish>, request: CloseRequest = limitCloseRequestBuilder().build()) {
		logger.detailedDebug(
			serializeToJson({
				request: request,
				userBalanceInfo: await this.getBalanceInfo(),
				userUpnl: await this.getUpnl(),
			}),
		)
		await runTx(
			this.context.partyAFacet
				.connect(this.signer)
				.requestToClosePosition(id, request.closePrice, request.quantityToClose, request.orderType, request.deadline),
		)
		logger.info(`User::::RequestToClosePosition: ${id}`)
	}

	public async forceClosePosition(id: PromiseOrValue<BigNumberish>, signature: HighLowPriceSigStruct) {
		logger.detailedDebug(
			serializeToJson({
				signature: signature,
				userBalanceInfo: await this.getBalanceInfo(),
				userUpnl: await this.getUpnl(),
			}),
		)
		await runTx(this.context.partyAFacet.connect(this.signer).forceClosePosition(id, signature))
		logger.info(`User::::ForceClosePosition: ${id}`)
	}

	public async requestToCancelCloseRequest(id: PromiseOrValue<BigNumberish>) {
		logger.detailedDebug(
			serializeToJson({
				request: "RequestToCancelCloseRequest",
				userBalanceInfo: await this.getBalanceInfo(),
				userUpnl: await this.getUpnl(),
			}),
		)
		await runTx(this.context.partyAFacet.connect(this.signer).requestToCancelCloseRequest(id))
		logger.info(`User::::RequestToCancelCloseRequest: ${id}`)
	}

	public getAddress() {
		return this.signer.getAddress()
	}

	public async getUpnl(
		symbolIdPriceFetcher: ((symbolId: BigNumber) => Promise<BigNumber>) | null = null,
		symbolNamePriceFetcher: (symbol: string) => Promise<BigNumber> = getPrice,
	): Promise<BigNumber> {
		let openPositions = await this.getOpenPositions()
		let upnl = BigNumber.from(0)
		for (const pos of openPositions) {
			const priceDiff = pos.openedPrice.sub(
				symbolIdPriceFetcher != null
					? await symbolIdPriceFetcher(pos.symbolId)
					: await symbolNamePriceFetcher((await this.context.viewFacet.getSymbol(pos.symbolId)).name),
			)
			const amount = pos.quantity.sub(pos.closedAmount)
			upnl = upnl.add(unDecimal(amount.mul(priceDiff)).mul(pos.positionType == PositionType.LONG ? -1 : 1))
		}
		return upnl
	}

	public async getTotalUnrealisedLoss(
		symbolIdPriceFetcher: ((symbolId: BigNumber) => Promise<BigNumber>) | null = null,
		symbolNamePriceFetcher: (symbol: string) => Promise<BigNumber> = getPrice,
	): Promise<BigNumber> {
		let openPositions = await this.getOpenPositions()
		let upnl = BigNumber.from(0)
		for (const pos of openPositions) {
			const priceDiff = pos.openedPrice.sub(
				symbolIdPriceFetcher != null
					? await symbolIdPriceFetcher(pos.symbolId)
					: await symbolNamePriceFetcher((await this.context.viewFacet.getSymbol(pos.symbolId)).name),
			)
			const amount = pos.quantity.sub(pos.closedAmount)
			upnl = upnl.add(unDecimal(amount.mul(priceDiff)).mul(pos.positionType == PositionType.LONG ? 0 : 1))
		}
		return upnl
	}

	public async getAvailableBalanceForQuote(upnl: BigNumber): Promise<BigNumber> {
		const balanceInfo = await this.getBalanceInfo()
		let available: BigNumber
		if (upnl.gt(0)) {
			available = balanceInfo.allocatedBalances.add(upnl).sub(balanceInfo.totalLockedPartyA.add(balanceInfo.totalPendingLockedPartyA))
		} else {
			let mm = balanceInfo.lockedMmPartyA
			let mUpnl = upnl.mul(-1)
			let considering_mm = mUpnl.gt(mm) ? mUpnl : mm
			available = balanceInfo.allocatedBalances
				.sub(balanceInfo.lockedCva.add(balanceInfo.lockedLf).add(balanceInfo.totalPendingLockedPartyA))
				.sub(considering_mm)
		}
		return available
	}

	public async liquidateAndSetSymbolPrices(
		symbolIds: BigNumberish[],
		prices: BigNumber[],
		liquidator: SignerWithAddress = this.context.signers.liquidator,
	): Promise<LiquidationSigStruct> {
		const upnl = await this.getUpnl(getPriceFetcher(symbolIds, prices))
		const totalUnrealizedLoss = await this.getTotalUnrealisedLoss(getPriceFetcher(symbolIds, prices))
		const allocatedBalance = (await this.getBalanceInfo()).allocatedBalances
		const sign = await getDummyLiquidationSig("0x10", upnl, symbolIds, prices, totalUnrealizedLoss, allocatedBalance)
		await this.context.liquidationFacet.connect(liquidator).liquidatePartyA(this.getAddress(), sign)
		await this.context.liquidationFacet.connect(liquidator).setSymbolsPrice(this.getAddress(), sign)
		return sign
	}

	public async liquidatePendingPositions(liquidator: SignerWithAddress = this.context.signers.liquidator) {
		await this.context.liquidationFacet.connect(liquidator).liquidatePendingPositionsPartyA(this.getAddress())
	}

	public async liquidatePositions(positions: BigNumberish[] = [], liquidator: SignerWithAddress = this.context.signers.liquidator) {
		if (positions.length == 0) positions = (await this.getOpenPositions()).map(value => value.id)
		await this.context.liquidationFacet.connect(liquidator).liquidatePositionsPartyA(this.getAddress(), positions)
	}

	public async getOpenPositions(): Promise<QuoteStructOutput[]> {
		let openPositions: QuoteStructOutput[] = []
		const pageSize = 30
		let last = 0
		while (true) {
			let page = await this.context.viewFacet.getPartyAOpenPositions(this.getAddress(), last, pageSize)
			openPositions.push(...page)
			if (page.length < pageSize) break
		}
		return openPositions
	}

	public async settleLiquidation(
		partyB: SignerWithAddress = this.context.signers.hedger,
		liquidator: SignerWithAddress = this.context.signers.liquidator,
	): Promise<void> {
		await this.context.liquidationFacet.connect(liquidator).settlePartyALiquidation(await this.getAddress(), [await partyB.getAddress()])
	}

	public async getLiquidatedStateOfPartyA() {
		return this.context.viewFacet.getLiquidatedStateOfPartyA(await this.getAddress())
	}
}

export interface BalanceInfo {
	allocatedBalances: BigNumber
	lockedCva: BigNumber
	lockedMmPartyA: BigNumber
	lockedMmPartyB: BigNumber
	lockedLf: BigNumber
	totalLockedPartyA: BigNumber
	totalLockedPartyB: BigNumber
	pendingLockedCva: BigNumber
	pendingLockedMmPartyA: BigNumber
	pendingLockedMmPartyB: BigNumber
	pendingLockedLf: BigNumber
	totalPendingLockedPartyA: BigNumber
	totalPendingLockedPartyB: BigNumber
}
