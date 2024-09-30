import {setBalance} from "@nomicfoundation/hardhat-network-helpers"
import {BigNumberish, ethers, EventLog} from "ethers"

import {getPriceFetcher, serializeToJson, unDecimal} from "../utils/Common"
import {logger} from "../utils/LoggerUtils"
import {getPrice} from "../utils/PriceUtils"
import {PositionType} from "./Enums"
import {RunContext} from "./RunContext"
import {CloseRequest, limitCloseRequestBuilder} from "./requestModels/CloseRequest"
import {limitQuoteRequestBuilder, QuoteRequest} from "./requestModels/QuoteRequest"
import {runTx} from "../utils/TxUtils"
import {getDummyLiquidationSig} from "../utils/SignatureUtils"
import {LiquidationSigStruct} from "../../src/types/contracts/facets/liquidation/LiquidationFacet"
import {QuoteStructOutput, SettlementSigStruct} from "../../src/types/contracts/interfaces/ISymmio"
import {HighLowPriceSigStruct} from "../../src/types/contracts/facets/ForceActions/ForceActionsFacet"
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers"

export class User {
	constructor(private context: RunContext, private signer: SignerWithAddress) {
	}

	public async setup() {
		await this.context.manager.registerUser(this)
	}

	public async setBalances(collateralAmount?: BigNumberish, depositAmount?: BigNumberish, allocatedAmount?: BigNumberish) {
		const userAddress = this.signer.getAddress()

		await runTx(this.context.collateral.connect(this.signer).approve(this.context.diamond, ethers.MaxUint256))

		if (collateralAmount) await runTx(this.context.collateral.connect(this.signer).mint(userAddress, collateralAmount))
		if (depositAmount) await runTx(this.context.accountFacet.connect(this.signer).deposit(depositAmount))
		if (allocatedAmount) await runTx(this.context.accountFacet.connect(this.signer).allocate(allocatedAmount))
	}

	public async setNativeBalance(amount: bigint) {
		await setBalance(this.signer.address, amount)
	}

	public async sendQuote(request: QuoteRequest = limitQuoteRequestBuilder().build()): Promise<bigint> {
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
				await request.deadline,
				this.context.multiAccount,
				await request.upnlSig,
			)
		const receipt = await tx.wait()

		if (receipt && receipt.logs) {
			const sendQuoteEvent = receipt.logs.find((log): log is EventLog => {
				return (log as EventLog).eventName === "SendQuote"
			})

			if (sendQuoteEvent && sendQuoteEvent.args) {
				const id = sendQuoteEvent.args.quoteId
				logger.info("User::::SendQuote: " + id)
				return id.toString()
			}
		}
		throw new Error("SendQuote event not found in transaction receipt")
	}

	public async requestToCancelQuote(id: BigNumberish) {
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

	public async forceCancelQuote(id: BigNumberish) {
		logger.detailedDebug(
			serializeToJson({
				request: "ForceCancelQuote",
				userBalanceInfo: await this.getBalanceInfo(),
				userUpnl: await this.getUpnl(),
			}),
		)
		await runTx(this.context.forceActionsFacet.connect(this.signer).forceCancelQuote(id))
		logger.info(`User::::ForceCancelQuote: ${id}`)
	}

	public async forceCancelCloseRequest(id: BigNumberish) {
		logger.detailedDebug(
			serializeToJson({
				request: "ForceCancelCloseRequest",
				userBalanceInfo: await this.getBalanceInfo(),
				userUpnl: await this.getUpnl(),
			}),
		)
		await runTx(this.context.forceActionsFacet.connect(this.signer).forceCancelCloseRequest(id))
		logger.info(`User::::ForceCancelCloseRequest: ${id}`)
	}

	public async getBalanceInfo(): Promise<BalanceInfo> {
		const b = await this.context.viewFacet.balanceInfoOfPartyA(await this.getAddress())
		return {
			allocatedBalances: b[0],
			lockedCva: b[1],
			lockedLf: b[2],
			lockedMmPartyA: b[3],
			lockedMmPartyB: b[4],
			totalLockedPartyA: b[1] + b[2] + b[3],
			totalLockedPartyB: b[1] + b[2] + b[4],
			pendingLockedCva: b[5],
			pendingLockedLf: b[6],
			pendingLockedMmPartyA: b[7],
			pendingLockedMmPartyB: b[8],
			totalPendingLockedPartyA: b[5] + b[6] + b[7],
			totalPendingLockedPartyB: b[5] + b[6] + b[8],
		}
	}


	public async requestToClosePosition(id: BigNumberish, request: CloseRequest = limitCloseRequestBuilder().build()) {
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
				.requestToClosePosition(id, request.closePrice, request.quantityToClose, request.orderType, await request.deadline),
		)
		logger.info(`User::::RequestToClosePosition: ${id}`)
	}

	public async forceClosePosition(id: BigNumberish, signature: HighLowPriceSigStruct) {
		logger.detailedDebug(
			serializeToJson({
				signature: signature,
				userBalanceInfo: await this.getBalanceInfo(),
				userUpnl: await this.getUpnl(),
			}),
		)
		await runTx(this.context.forceActionsFacet.connect(this.signer).forceClosePosition(id, signature))
		logger.info(`User::::ForceClosePosition: ${id}`)
	}

	public async settleAndForceClosePosition(id: BigNumberish, highLowPriceSigStruct: HighLowPriceSigStruct, settleSig: SettlementSigStruct, updatedPrices: bigint[]) {
		logger.detailedDebug(
			serializeToJson({
				highLowPriceSigStruct: highLowPriceSigStruct,
				settleSig: settleSig,
				updatedPrices: updatedPrices,
				userBalanceInfo: await this.getBalanceInfo(),
				userUpnl: await this.getUpnl(),
			}),
		)
		await runTx(this.context.forceActionsFacet.connect(this.signer).settleAndForceClosePosition(id, highLowPriceSigStruct, settleSig, updatedPrices))
		logger.info(`User::::SettleAndForceClosePosition: ${id}`)
	}

	public async requestToCancelCloseRequest(id: BigNumberish) {
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
		symbolIdPriceFetcher: ((symbolId: bigint) => Promise<bigint>) | null = null,
		symbolNamePriceFetcher: (symbol: string) => Promise<bigint> = getPrice,
	): Promise<bigint> {
		let openPositions = await this.getOpenPositions()
		let upnl = 0n
		for (const pos of openPositions) {
			const priceDiff = pos.openedPrice - (
				symbolIdPriceFetcher != null
					? await symbolIdPriceFetcher(pos.symbolId)
					: await symbolNamePriceFetcher((await this.context.viewFacet.getSymbol(pos.symbolId)).name)
			)
			const amount = pos.quantity - pos.closedAmount
			upnl += unDecimal(amount * priceDiff) * (pos.positionType == BigInt(PositionType.LONG) ? -1n : 1n)
		}
		return upnl
	}

	public async getTotalUnrealisedLoss(
		symbolIdPriceFetcher: ((symbolId: bigint) => Promise<bigint>) | null = null,
		symbolNamePriceFetcher: (symbol: string) => Promise<bigint> = getPrice,
	): Promise<bigint> {
		let openPositions = await this.getOpenPositions()
		let upnl = 0n
		for (const pos of openPositions) {
			const priceDiff = pos.openedPrice - (
				symbolIdPriceFetcher != null
					? await symbolIdPriceFetcher(pos.symbolId)
					: await symbolNamePriceFetcher((await this.context.viewFacet.getSymbol(pos.symbolId)).name)
			)
			const amount = pos.quantity - pos.closedAmount
			upnl += unDecimal(amount * priceDiff) * (pos.positionType == BigInt(PositionType.LONG) ? 0n : 1n)
		}
		return upnl
	}

	public async getAvailableBalanceForQuote(upnl: bigint): Promise<bigint> {
		const balanceInfo = await this.getBalanceInfo()
		let available: bigint
		if (upnl > 0n) {
			available = balanceInfo.allocatedBalances + upnl - (balanceInfo.totalLockedPartyA + balanceInfo.totalPendingLockedPartyA)
		} else {
			let mm = balanceInfo.lockedMmPartyA
			let mUpnl = -upnl
			let considering_mm = mUpnl > mm ? mUpnl : mm
			available = balanceInfo.allocatedBalances
				- (balanceInfo.lockedCva + balanceInfo.lockedLf + balanceInfo.totalPendingLockedPartyA)
				- considering_mm
		}
		return available
	}

	public async liquidateAndSetSymbolPrices(
		symbolIds: bigint[],
		prices: bigint[],
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
	allocatedBalances: bigint
	lockedCva: bigint
	lockedMmPartyA: bigint
	lockedMmPartyB: bigint
	lockedLf: bigint
	totalLockedPartyA: bigint
	totalLockedPartyB: bigint
	pendingLockedCva: bigint
	pendingLockedMmPartyA: bigint
	pendingLockedMmPartyB: bigint
	pendingLockedLf: bigint
	totalPendingLockedPartyA: bigint
	totalPendingLockedPartyB: bigint
}
