import {Builder} from "builder-pattern"
import {concatMap, filter, from} from "rxjs"

import {
	checkStatus,
	decimal,
	getBlockTimestamp,
	getQuoteMinLeftQuantityForClose,
	getSymbols,
	min,
	unDecimal
} from "../utils/Common"
import {logger} from "../utils/LoggerUtils"
import {getPrice} from "../utils/PriceUtils"
import {pick, randomBigNumber, randomBigNumberRatio} from "../utils/RandomUtils"
import {roundToPrecision, safeDiv} from "../utils/SafeMath"
import {getDummySingleUpnlAndPriceSig} from "../utils/SignatureUtils"
import {SymbolStructOutput} from "../../src/types/contracts/facets/Control/ControlFacet"
import {Action, actionNamesMap, ActionWrapper, expandActions, userActionsMap} from "./Actions"
import {OrderType, PositionType, QuoteStatus} from "./Enums"
import {ManagedError} from "./ManagedError"
import {RunContext} from "./RunContext"
import {TestManager} from "./TestManager"
import {User} from "./User"
import {CloseRequest} from "./requestModels/CloseRequest"
import {QuoteRequest} from "./requestModels/QuoteRequest"
import {
	CancelCloseRequestValidator,
	CancelCloseRequestValidatorBeforeOutput
} from "./validators/CancelCloseRequestValidator"
import {CancelQuoteValidator, CancelQuoteValidatorBeforeOutput} from "./validators/CancelQuoteValidator"
import {CloseRequestValidator, CloseRequestValidatorBeforeOutput} from "./validators/CloseRequestValidator"
import {QuoteCheckpoint} from "./quoteCheckpoint"
import {QuoteStructOutput} from "../../src/types/contracts/interfaces/ISymmio"

export class UserController {
	private readonly context: RunContext

	constructor(private manager: TestManager, private user: User, private checkpoint: QuoteCheckpoint) {
		this.context = manager.context
	}

	public async start() {
		let userAddress = await this.user.getAddress()
		for (let status = 0; status < Object.keys(QuoteStatus).length / 2; status++) {
			const actions = userActionsMap.get(status)!
			if (actions.length > 1 || (actions.length == 1 && actions[0].action != Action.NOTHING))
				this.manager
					.getQueueObservable(status)
					.pipe(
						concatMap(qId => from(this.manager.context.viewFacet.getQuote(qId))),
						filter(quote => quote.quoteStatus == BigInt(status) && quote.partyA == userAddress),
					)
					.subscribe(quote => {
						this.manager.actionsLoop.next({
							title: "User",
							action: () => {
								return new Promise((resolve, reject) => {
									checkStatus(this.context, quote.id, status).then((value: boolean) => {
										if (value) {
											this.handleQuote(quote, actions)
												.then(() => {
													resolve()
												})
												.catch(err => {
													logger.error("User failed to handle quote: " + quote.id, err)
													console.error(err)
													process.exitCode = 1
													setTimeout(() => process.exit(), 700)
													reject(err)
												})
										} else {
											resolve()
										}
									})
								})
							},
						})
					})
		}
	}

	public async sendQuote(maxLockedAmountForQuote = decimal(100n)): Promise<void> {
		if (await this.manager.getPauseState()) throw new Error("This method is not allowed when state is paused")

		const pendingQuotes = await this.context.viewFacet.getPartyAPendingQuotes(this.user.getAddress())
		if (pendingQuotes.length >= 10) throw new ManagedError("Too many open quotes")

		const orderType = pick([OrderType.MARKET, OrderType.LIMIT])
		const positionType = pick([PositionType.SHORT, PositionType.LONG])
		const symbol: SymbolStructOutput = pick(await getSymbols(this.manager.context))
		let symbolQP = this.manager.symbolManager.getSymbolQuantityPrecision(Number(symbol.symbolId))
		let symbolPP = this.manager.symbolManager.getSymbolPricePrecision(Number(symbol.symbolId))
		const price = await getPrice()
		const upnl = await this.user.getUpnl()
		const availableForQuote = await this.user.getAvailableBalanceForQuote(upnl)
		if (availableForQuote < symbol.minAcceptableQuoteValue) throw new ManagedError("Insufficient funds available")

		const lockedAmount = randomBigNumber(min(availableForQuote, maxLockedAmountForQuote), symbol.minAcceptableQuoteValue)
		const lf = randomBigNumber(unDecimal(lockedAmount * decimal(5n, 17)), unDecimal(lockedAmount * symbol.minAcceptablePortionLF))
		const cva = randomBigNumberRatio(lockedAmount - lf, 0.2)
		const mm = lockedAmount - lf - cva

		let requestPrice =
			orderType == OrderType.MARKET
				? price + randomBigNumberRatio(price, 0.1) * (positionType == PositionType.LONG ? 1n : -1n)
				: price + randomBigNumberRatio(price, 0.1) * (positionType == PositionType.SHORT ? 1n : -1n)
		requestPrice = roundToPrecision(requestPrice, symbolPP)

		let notionalPrice =
			orderType == OrderType.MARKET ? price : price + randomBigNumberRatio(price, 0.1) * (positionType == PositionType.SHORT ? 1n : -1n)
		notionalPrice = roundToPrecision(notionalPrice, symbolPP)

		const leverage = safeDiv(symbol.maxLeverage * 9n, 10n) //10% safe margin
		let quantity
		try {
			quantity = roundToPrecision(safeDiv(lockedAmount * leverage, price), symbolQP)
		} catch (ex) {
			throw new ManagedError("Random data lead to invalid quote... This request will be rejected")
		}
		const notional = unDecimal(quantity * notionalPrice)
		const tradingFee = unDecimal(symbol.tradingFee * notional)

		if (availableForQuote - tradingFee < symbol.minAcceptableQuoteValue) throw new ManagedError("Insufficient funds available for tradingFee")

		if (availableForQuote - tradingFee < lockedAmount)
			throw new ManagedError("Random data lead to invalid quote... This request will be rejected")

		const id = await this.user.sendQuote(
			Builder<QuoteRequest>()
				.partyBWhiteList([])
				.quantity(quantity)
				.partyAmm(mm)
				.partyBmm(mm / 2n)
				.cva(cva)
				.lf(lf)
				.symbolId(symbol.symbolId)
				.positionType(positionType)
				.orderType(orderType)
				.deadline(1722889307n)
				.price(requestPrice)
				.upnlSig(getDummySingleUpnlAndPriceSig(price, upnl))
				.maxFundingRate(0n)
				.build(),
		)
		console.log((await this.context.viewFacet.getQuote(id)).deadline)

		if (randomBigNumber(100n, 1n) <= 110n) {
			this.checkpoint.addBlockedQuotes(id)
		}
	}

	private async handleQuote(quote: QuoteStructOutput, actions: ActionWrapper[]): Promise<void> {
		var actionWrapper: ActionWrapper = pick(expandActions(actions))
		logger.debug("User selects the action: " + actionNamesMap.get(actionWrapper.action) + " for quote: " + quote.id)

		let validator = this.manager.validators.get(actionWrapper.action)
		const validate = validator && Math.random() <= Number(process.env.VALIDATION_PROBABILITY)

		switch (actionWrapper.action) {
			case Action.CANCEL_REQUEST: {
				let before: CancelQuoteValidatorBeforeOutput
				if (validate) {
					this.manager.setPauseState(true)
					before = await (validator as CancelQuoteValidator).before(this.context, {
						user: this.user,
						quoteId: quote.id,
					})
				}
				await this.user.requestToCancelQuote(quote.id)
				if (validate) {
					await (validator as CancelQuoteValidator).after(this.context, {
						user: this.user,
						quoteId: quote.id,
						beforeOutput: before!,
					})
					this.manager.setPauseState(false)
				}
				break
			}
			case Action.CLOSE_REQUEST: {
				let symbol = await this.context.viewFacet.getSymbol(quote.symbolId)
				let symbolQP = this.manager.symbolManager.getSymbolQuantityPrecision(Number(symbol.symbolId))
				let symbolPP = this.manager.symbolManager.getSymbolPricePrecision(Number(symbol.symbolId))

				let quantityToClose: bigint
				const openAmount = quote.quantity - quote.closedAmount
				const minLeftQuantity = await getQuoteMinLeftQuantityForClose(this.manager.context, quote.id)
				let maxValidClose = openAmount - minLeftQuantity
				if (maxValidClose <= 0n) {
					quantityToClose = openAmount
				} else {
					quantityToClose = roundToPrecision(randomBigNumber(maxValidClose), symbolQP)
					if (quantityToClose > maxValidClose || quantityToClose < minLeftQuantity) {
						quantityToClose = openAmount
					}
				}

				const orderType = pick([OrderType.LIMIT, OrderType.MARKET])
				const price = await getPrice()
				const hedger = this.manager.getHedger(quote.partyB)

				const closePrice = roundToPrecision(price + randomBigNumberRatio(price, 0.05) * BigInt(pick([1, -1])), symbolPP)

				let before: CloseRequestValidatorBeforeOutput | undefined
				if (validate) {
					this.manager.setPauseState(true)
					before = await (validator as CloseRequestValidator).before(this.context, {
						user: this.user,
						hedger: hedger,
						quoteId: quote.id,
					})
				}

				await this.user.requestToClosePosition(
					quote.id,
					Builder<CloseRequest>()
						.quantityToClose(quantityToClose)
						.orderType(orderType)
						.deadline(getBlockTimestamp(100000n))
						.upnl(await this.user.getUpnl())
						.closePrice(closePrice)
						.price(price)
						.build(),
				)

				if (validate) {
					await (validator as CloseRequestValidator).after(this.context, {
						user: this.user,
						hedger: hedger,
						quoteId: quote.id,
						beforeOutput: before!,
						quantityToClose: quantityToClose,
						closePrice: closePrice,
					})
					this.manager.setPauseState(false)
				}
				break
			}
			case Action.CANCEL_CLOSE_REQUEST: {
				let before: CancelCloseRequestValidatorBeforeOutput
				const hedger = this.manager.getHedger(quote.partyB)
				if (validate) {
					this.manager.setPauseState(true)
					before = await (validator as CancelCloseRequestValidator).before(this.context, {
						user: this.user,
						hedger: hedger,
						quoteId: quote.id,
					})
				}
				await this.user.requestToCancelCloseRequest(quote.id)
				if (validate) {
					await (validator as CancelCloseRequestValidator).after(this.context, {
						user: this.user,
						hedger: hedger,
						quoteId: quote.id,
						beforeOutput: before!,
					})
					this.manager.setPauseState(false)
				}
				break
			}
			case Action.FORCE_CLOSE_REQUEST:
				//     if(this.checkpoint.isBlockedQuote(quote.id)){
				//         //remove from blocked
				//     }

				//     const closePrice = quote.requestedClosePrice

				//     // const dummySig = await getDummyHighLowPriceSig(startTime, endTime,closePrice.sub(decimal(1)),closePrice.add(decimal(1)),closePrice,closePrice)

				//     const hedger = this.manager.getHedger(quote.partyB)

				//     let before: ForceClosePositionValidatorBeforeOutput
				//     if (validate) {
				//     this.manager.setPauseState(true)
				//      before = await (validator as ForceClosePositionValidator).before(this.context, {
				//         user: this.user,
				//         hedger: hedger,
				//         quoteId: quote.id,
				//     })
				//     }
				//     // await this.user.forceClosePosition(quote.id, dummySig)

				//     if(validator){
				//     await (validator as ForceClosePositionValidator).after(this.context, {
				//       user: this.user,
				//       hedger: hedger,
				//       quoteId: quote.id,
				//       sig: {
				//         lowestPrice: closePrice.sub(decimal(1)),
				//         highestPrice: closePrice.add(decimal(1)),
				//         averagePrice: closePrice,
				//         currentPrice: closePrice,
				//         endTime: startTime,
				//         startTime: endTime
				//       },
				//       beforeOutput: before!
				//     })
				//     this.manager.setPauseState(false)
				// }
				break
			case Action.NOTHING: {
				if (actionWrapper.rethink) {
					logger.info(`User::::ReThinking about quote: ${quote.id}`)
					let status = quote.quoteStatus
					setTimeout(async () => {
						quote = await this.context.viewFacet.getQuote(quote.id)
						if (quote.quoteStatus == status) {
							this.manager.actionsLoop.next({
								title: "User",
								action: () => {
									return new Promise((resolve, reject) => {
										this.handleQuote(quote, actions)
											.then(() => {
												resolve()
											})
											.catch(err => {
												this.manager.setPauseState(false)
												logger.error("User failed to handle quote: " + quote.id, err)
												console.error(err)
												if (err.toString().indexOf("Transaction reverted without a reason string") >= 0) setTimeout(() => process.exit(), 700)
												resolve() //Error is already handled
											})
									})
								},
							})
						}
					}, 2000)
				}
				break
			}
		}
	}
}
