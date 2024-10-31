import {setBalance} from "@nomicfoundation/hardhat-network-helpers"
import {BigNumberish, ethers} from "ethers"

import {decimal, serializeToJson, unDecimal} from "../utils/Common"
import {logger} from "../utils/LoggerUtils"
import {getPrice} from "../utils/PriceUtils"
import {getDummyPairUpnlAndPriceSig, getDummySettlementSig, getDummySingleUpnlSig} from "../utils/SignatureUtils"
import {PositionType} from "./Enums"
import {RunContext} from "./RunContext"
import {EmergencyCloseRequest, emergencyCloseRequestBuilder} from "./requestModels/EmergencyCloseRequest"
import {FillCloseRequest, limitFillCloseRequestBuilder} from "./requestModels/FillCloseRequest"
import {limitOpenRequestBuilder, OpenRequest} from "./requestModels/OpenRequest"
import {runTx} from "../utils/TxUtils"
import {PairUpnlSigStructOutput} from "../../src/types/contracts/facets/FundingRate/FundingRateFacet"
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers"
import {QuoteStructOutput, SingleUpnlSigStructOutput} from "../../src/types/contracts/interfaces/ISymmio"
import {SettlementSigStructOutput} from "../../src/types/contracts/facets/Settlement/SettlementFacet"

export class Hedger {
	constructor(private context: RunContext, private signer: SignerWithAddress) {
	}

	public async setup() {
		await this.context.manager.registerHedger(this)
	}

	public async setBalances(collateralAmount?: BigNumberish, depositAmount?: BigNumberish) {
		const userAddress = await this.signer.getAddress()
		await runTx(this.context.collateral.connect(this.signer).approve(this.context.diamond, ethers.MaxUint256))

		if (collateralAmount) await runTx(this.context.collateral.connect(this.signer).mint(userAddress, collateralAmount))
		if (depositAmount) await runTx(this.context.accountFacet.connect(this.signer).deposit(depositAmount))
	}

	public async depositToReserveVault(amount: BigNumberish) {
		await runTx(this.context.collateral.connect(this.signer).approve(this.context.diamond, ethers.MaxUint256))
		await runTx(this.context.accountFacet.connect(this.signer).depositToReserveVault(amount, await this.signer.getAddress()))
	}

	public async withdrawFromReserveVault(amount: BigNumberish) {
		await runTx(this.context.accountFacet.connect(this.signer).withdrawFromReserveVault(amount))
	}

	public async balanceOfReserveVault(): Promise<bigint> {
		return await this.context.viewFacet.connect(this.signer).balanceOfReserveVault(await this.signer.getAddress())
	}

	public async setNativeBalance(amount: bigint) {
		await setBalance(this.signer.address, amount)
	}

	public async register() {
		await runTx(this.context.controlFacet.connect(this.context.signers.admin).registerPartyB(await this.signer.getAddress()))
	}

	public async lockQuote(id: BigNumberish, upnl: bigint = 0n, allocateCoefficient: bigint | null = decimal(12n, 17)) {
		if (allocateCoefficient != null) {
			const quote = await this.context.viewFacet.getQuote(id)
			const notional = unDecimal(BigInt(quote.quantity) * quote.requestedOpenPrice)
			await runTx(
				this.context.accountFacet.connect(this.signer).allocateForPartyB(unDecimal(notional * BigInt(allocateCoefficient)), quote.partyA)
			)
		}
		await runTx(this.context.partyBQuoteActionsFacet.connect(this.signer).lockQuote(id, await getDummySingleUpnlSig(upnl)))

		logger.info(`Hedger::LockQuote: ${id}`)
	}

	public async unlockQuote(id: BigNumberish) {
		await runTx(this.context.partyBQuoteActionsFacet.connect(this.signer).unlockQuote(id))
		logger.info(`Hedger::UnLockQuote: ${id}`)
	}

	public async lockAndOpenQuote(id: BigNumberish, allocateCoefficient: bigint | null = decimal(12n, 17), openRequest: OpenRequest = limitOpenRequestBuilder().build()) {
		if (allocateCoefficient != null) {
			const quote = await this.context.viewFacet.getQuote(id)
			const notional = unDecimal(BigInt(quote.quantity) * quote.requestedOpenPrice)
			await runTx(
				this.context.accountFacet.connect(this.signer).allocateForPartyB(unDecimal(notional * BigInt(allocateCoefficient)), quote.partyA)
			)
		}
		await runTx(
			this.context.partyBGroupActionsFacet.connect(this.signer)
				.lockAndOpenQuote(
					id,
					openRequest.filledAmount,
					openRequest.openPrice,
					await getDummySingleUpnlSig(BigInt(openRequest.upnlPartyA)),
					await getDummyPairUpnlAndPriceSig(BigInt(openRequest.price), BigInt(openRequest.upnlPartyA), BigInt(openRequest.upnlPartyB))
				)
		)
	}

	public async openPosition(id: BigNumberish, request: OpenRequest = limitOpenRequestBuilder().build()) {
		const quote = await this.context.viewFacet.getQuote(id)
		const user = this.context.manager.getUser(quote.partyA)
		logger.detailedDebug(
			serializeToJson({
				request: request,
				hedgerBalanceInfo: await this.getBalanceInfo(quote.partyA),
				hedgerUpnl: await this.getUpnl(quote.partyA),
				userBalanceInfo: await user.getBalanceInfo(),
				userUpnl: await user.getUpnl(),
			})
		)
		await runTx(
			this.context.partyBPositionActionsFacet
				.connect(this.signer)
				.openPosition(
					id,
					request.filledAmount,
					request.openPrice,
					await getDummyPairUpnlAndPriceSig(BigInt(request.price), BigInt(request.upnlPartyA), BigInt(request.upnlPartyB))
				)
		)
		logger.info(`Hedger::OpenPosition: ${id}`)
	}

	public async getBalance(): Promise<bigint> {
		return await this.context.viewFacet.balanceOf(await this.getAddress())
	}

	public async getBalanceInfo(partyA: string): Promise<BalanceInfo> {
		const b = await this.context.viewFacet.balanceInfoOfPartyB(await this.getAddress(), partyA)
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

	public async acceptCancelRequest(id: BigNumberish) {
		await runTx(this.context.partyBQuoteActionsFacet.connect(this.signer).acceptCancelRequest(id))
		logger.info(`Hedger::AcceptCancelRequest: ${id}`)
	}

	public async fillCloseRequest(id: BigNumberish, request: FillCloseRequest = limitFillCloseRequestBuilder().build()) {
		const quote = await this.context.viewFacet.getQuote(id)
		const user = this.context.manager.getUser(quote.partyA)
		logger.detailedDebug(
			serializeToJson({
				request: request,
				hedgerBalanceInfo: await this.getBalanceInfo(quote.partyA),
				hedgerUpnl: await this.getUpnl(quote.partyA),
				userBalanceInfo: await user.getBalanceInfo(),
				userUpnl: await user.getUpnl(),
			})
		)
		await runTx(
			this.context.partyBPositionActionsFacet
				.connect(this.signer)
				.fillCloseRequest(
					id,
					request.filledAmount,
					request.closedPrice,
					await getDummyPairUpnlAndPriceSig(BigInt(request.price), BigInt(request.upnlPartyA), BigInt(request.upnlPartyB))
				)
		)
		logger.info(`Hedger::FillCloseRequest: ${id}`)
	}

	public async chargeFundingRate(partyA: string, quoteIds: BigNumberish[], rates: BigNumberish[], signature: PairUpnlSigStructOutput) {
		await this.context.fundingRateFacet.connect(this.signer).chargeFundingRate(partyA, quoteIds, rates, signature)
		logger.info(`Hedger::ChargeFundingRate: ${partyA}, ${quoteIds}, ${rates}`)
	}

	public async acceptCancelCloseRequest(id: BigNumberish) {
		await runTx(this.context.partyBPositionActionsFacet.connect(this.signer).acceptCancelCloseRequest(id))
		logger.info(`Hedger::AcceptCancelCloseRequest: ${id}`)
	}

	public async liquidate(partyA: string, sig: SingleUpnlSigStructOutput | Promise<SingleUpnlSigStructOutput> = getDummySingleUpnlSig()) {
		let signature = sig instanceof Promise ? await sig : sig
		await runTx(this.context.liquidationFacet.connect(this.context.signers.liquidator).liquidatePartyB(await this.signer.getAddress(), partyA, signature))
		logger.info(`Hedger::Liquidator: ${partyA}`)
	}

	public async emergencyClosePosition(id: BigNumberish, request: EmergencyCloseRequest = emergencyCloseRequestBuilder().build()) {
		const quote = await this.context.viewFacet.getQuote(id)
		const user = this.context.manager.getUser(quote.partyA)
		logger.detailedDebug(
			serializeToJson({
				request: request,
				hedgerBalanceInfo: await this.getBalanceInfo(quote.partyA),
				hedgerUpnl: await this.getUpnl(quote.partyA),
				userBalanceInfo: await user.getBalanceInfo(),
				userUpnl: await user.getUpnl(),
			})
		)
		await runTx(
			this.context.partyBPositionActionsFacet
				.connect(this.signer)
				.emergencyClosePosition(id, await getDummyPairUpnlAndPriceSig(BigInt(request.price), BigInt(request.upnlPartyA), BigInt(request.upnlPartyB)))
		)
		logger.info(`Hedger::EmergencyClosePosition: ${id}`)
	}

	public async settleUpnl(partyA: string, updatedPrices: bigint[], sig: Promise<SettlementSigStructOutput> | SettlementSigStructOutput = getDummySettlementSig()) {
		let signature = sig instanceof Promise ? await sig : sig

		const user = this.context.manager.getUser(partyA)
		logger.detailedDebug(
			serializeToJson({
				partyA: partyA,
				updatedPrices: updatedPrices,
				sig: sig,
				userBalanceInfo: await user.getBalanceInfo(),
				userUpnl: await user.getUpnl(),
			})
		)
		await runTx(
			this.context.settlementFacet.connect(this.signer).settleUpnl(
				signature,
				updatedPrices,
				partyA
			)
		)
		logger.info(`Hedger::settleUpnl`)
	}

	public async getAddress() {
		return await this.signer.getAddress()
	}

	public async getUpnl(partyA: string): Promise<bigint> {
		let openPositions: QuoteStructOutput[] = []
		const pageSize = 30
		let last = 0
		while (true) {
			const page = await this.context.viewFacet.getPartyBOpenPositions(await this.getAddress(), partyA, last, pageSize)
			openPositions.push(...page)
			if (page.length < pageSize) break
		}

		let upnl = 0n
		for (const pos of openPositions) {
			const priceDiff = pos.openedPrice - await getPrice()
			const amount = pos.quantity - pos.closedAmount
			upnl += unDecimal(BigInt(amount) * priceDiff) * (pos.positionType === BigInt(PositionType.LONG) ? -1n : 1n)
		}
		return upnl
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
