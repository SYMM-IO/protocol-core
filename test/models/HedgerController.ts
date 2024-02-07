import { Builder } from "builder-pattern"
// @ts-ignore
import * as randomExt from "random-ext"
import { concatMap, filter, from } from "rxjs"

import { QuoteStructOutput, SymbolStructOutput } from "../../src/types/contracts/facets/ViewFacet"
import {
	checkStatus,
	getQuoteMinLeftQuantityForFill,
	getQuoteQuantity,
	getTotalLockedValuesForQuoteIds,
} from "../utils/Common"
import { logger } from "../utils/LoggerUtils"
import { getPrice } from "../utils/PriceUtils"
import { pick, randomBigNumber } from "../utils/RandomUtils"
import { safeDiv } from "../utils/SafeMath"
import { Action, actionNamesMap, ActionWrapper, expandActions, hedgerActionsMap } from "./Actions"
import { OrderType, QuoteStatus } from "./Enums"
import { Hedger } from "./Hedger"
import { RunContext } from "./RunContext"
import { TestManager } from "./TestManager"
import { FillCloseRequest } from "./requestModels/FillCloseRequest"
import { OpenRequest } from "./requestModels/OpenRequest"
import {
	AcceptCancelCloseRequestValidator,
	AcceptCancelCloseRequestValidatorBeforeOutput,
} from "./validators/AcceptCancelCloseRequestValidator"
import {
	AcceptCancelRequestValidator,
	AcceptCancelRequestValidatorBeforeOutput,
} from "./validators/AcceptCancelRequestValidator"
import {
	FillCloseRequestValidator,
	FillCloseRequestValidatorBeforeOutput,
} from "./validators/FillCloseRequestValidator"
import { LockQuoteValidator, LockQuoteValidatorBeforeOutput } from "./validators/LockQuoteValidator"
import { OpenPositionValidator, OpenPositionValidatorBeforeOutput } from "./validators/OpenPositionValidator"
import { UnlockQuoteValidator, UnlockQuoteValidatorBeforeOutput } from "./validators/UnlockQuoteValidator"
import { QuoteCheckpoint } from "./quoteCheckpoint"

export class HedgerController {
	private context: RunContext

	constructor(private manager: TestManager, private hedger: Hedger, private checkpoint: QuoteCheckpoint) {
		this.context = manager.context
	}

	public async start() {
		let userAddress = await this.hedger.getAddress()
		for (let status = 0; status < Object.keys(QuoteStatus).length / 2; status++) {
			const actions = hedgerActionsMap.get(status)!
			if (actions.length > 1 || (actions.length == 1 && actions[0].action != Action.NOTHING))
				this.manager
				  .getQueueObservable(status)
				  .pipe(
					concatMap(qId => from(this.context.viewFacet.getQuote(qId))),
					filter(
					  quote =>
						quote.quoteStatus == status &&
						(quote.partyB == "0x0000000000000000000000000000000000000000" ||
						  quote.partyB == userAddress),
					),
				  )
				  .subscribe(async quote => {
					  this.manager.actionsLoop.next({
						  title: "Hedger",
						  action: () => {
							  return new Promise((resolve, reject) => {
								  checkStatus(this.context, quote.id, status).then((value: boolean) => {
									  if (value) {
										  this.handleQuote(quote, actions)
											.then(() => {
												resolve()
											})
											.catch(err => {
												this.manager.setPauseState(false)
												logger.error("Hedger failed to handle quote: " + quote.id, err)
												console.error(err)
												process.exitCode = 1
												setTimeout(() => process.exit(), 700)
												resolve() //Error is already handled
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

	private async handleQuote(quote: QuoteStructOutput, actions: ActionWrapper[]) {
		var actionWrapper: ActionWrapper = pick(expandActions(actions))
		logger.debug(
		  "Hedger selects the action: " +
		  actionNamesMap.get(actionWrapper.action) +
		  " for quote: " +
		  quote.id,
		)

		let validator = this.manager.validators.get(actionWrapper.action)
		const validate = validator && Math.random() <= Number(process.env.VALIDATION_PROBABILITY)

		switch (actionWrapper.action) {
			case Action.LOCK_QUOTE: {
				const user = this.manager.getUser(quote.partyA)
				let before: LockQuoteValidatorBeforeOutput
				if (validate) {
					this.manager.setPauseState(true)
					before = await (validator as LockQuoteValidator).before(this.context, {
						user: user,
					})
				}
				await this.hedger.lockQuote(quote.id)
				if (validate) {
					await (validator as LockQuoteValidator).after(this.context, {
						user: user,
						hedger: this.hedger,
						quoteId: quote.id,
						beforeOutput: before!,
					})
					this.manager.setPauseState(false)
				}
				break
			}
			case Action.UNLOCK_QUOTE: {
				const user = this.manager.getUser(quote.partyA)
				let before: UnlockQuoteValidatorBeforeOutput
				if (validate) {
					this.manager.setPauseState(true)
					before = await (validator as UnlockQuoteValidator).before(this.context, {
						user: user,
					})
				}
				await this.hedger.unlockQuote(quote.id)
				if (validate) {
					await (validator as UnlockQuoteValidator).after(this.context, {
						user: user,
						quoteId: quote.id,
						beforeOutput: before!,
					})
					this.manager.setPauseState(false)
				}
				break
			}
			case Action.ACCEPT_CANCEL_REQUEST: {
				const user = this.manager.getUser(quote.partyA)
				let before: AcceptCancelRequestValidatorBeforeOutput
				if (validate) {
					this.manager.setPauseState(true)
					before = await (validator as AcceptCancelRequestValidator).before(this.context, {
						user: user,
						quoteId: quote.id,
					})
				}
				await this.hedger.acceptCancelRequest(quote.id)
				if (validate) {
					await (validator as AcceptCancelRequestValidator).after(this.context, {
						user: user,
						quoteId: quote.id,
						beforeOutput: before!,
					})
					this.manager.setPauseState(false)
				}
				break
			}
			case Action.ACCEPT_CANCEL_CLOSE_REQUEST: {
				const user = this.manager.getUser(quote.partyA)
				let before: AcceptCancelCloseRequestValidatorBeforeOutput
				if (validate) {
					this.manager.setPauseState(true)
					before = await (validator as AcceptCancelCloseRequestValidator).before(this.context, {
						user: user,
						hedger: this.hedger,
						quoteId: quote.id,
					})
				}
				await this.hedger.acceptCancelCloseRequest(quote.id)
				if (validate) {
					await (validator as AcceptCancelCloseRequestValidator).after(this.context, {
						user: user,
						hedger: this.hedger,
						quoteId: quote.id,
						beforeOutput: before!,
					})
					this.manager.setPauseState(false)
				}
				break
			}
			case Action.OPEN_POSITION: {
				const quantity = await getQuoteQuantity(this.context, quote.id)
				let fillAmount = undefined
				let partially = false
				const symbol: SymbolStructOutput = await this.context.viewFacet.getSymbol(quote.symbolId)
				if (quote.orderType == OrderType.LIMIT) {
					const locked = await getTotalLockedValuesForQuoteIds(this.context, [quote.id])
					const minQuantity = safeDiv(symbol.minAcceptableQuoteValue.mul(quantity), locked)
					const max = quantity.sub(minQuantity)
					if (max.gt(minQuantity)) {
						const partialQuantity = randomBigNumber(quantity.sub(minQuantity), minQuantity)
						fillAmount = randomExt.pick([partialQuantity, quantity])
						partially = fillAmount.eq(partialQuantity)
					} else {
						fillAmount = quantity
					}
				} else {
					fillAmount = quantity
				}
				const price = await getPrice(symbol.name)
				const partyAUpnl = await this.manager.getUser(quote.partyA).getUpnl()
				const partyBUpnl = await this.hedger.getUpnl(quote.partyA)
				const openPrice =
				  quote.orderType == OrderType.LIMIT ? quote.requestedOpenPrice : quote.marketPrice //FIXME: Can we do anything else?

				const user = this.manager.getUser(quote.partyA)
				let before: OpenPositionValidatorBeforeOutput
				if (validate) {
					this.manager.setPauseState(true)
					before = await (validator as OpenPositionValidator).before(this.context, {
						user: user,
						hedger: this.hedger,
						quoteId: quote.id,
					})
				}
				await this.hedger.openPosition(
				  quote.id,
				  Builder<OpenRequest>()
					.filledAmount(fillAmount)
					.openPrice(openPrice)
					.upnlPartyA(partyAUpnl)
					.upnlPartyB(partyBUpnl)
					.price(price)
					.build(),
				)
				if (validate) {
					await (validator as OpenPositionValidator).after(this.context, {
						user: user,
						hedger: this.hedger,
						quoteId: quote.id,
						fillAmount: fillAmount,
						openedPrice: openPrice,
						beforeOutput: before!,
						//FIXME: newQuoteId
					})
					this.manager.setPauseState(false)
				}
				break
			}
			case Action.FILL_POSITION: {
				if (this.checkpoint.isBlockedQuote(quote.id)) {
					break
				}
				let fillAmount = undefined
				const symbol: SymbolStructOutput = await this.context.viewFacet.getSymbol(quote.symbolId)
				const minLeftQuantity = await getQuoteMinLeftQuantityForFill(
				  this.manager.context,
				  quote.id,
				)
				if (quote.orderType == OrderType.LIMIT) {
					const maxFillAmount = quote.quantityToClose.sub(minLeftQuantity)
					if (maxFillAmount.gt(0)) {
						const partialQuantity = randomBigNumber(maxFillAmount)
						fillAmount = randomExt.pick([partialQuantity, quote.quantityToClose])
					} else {
						fillAmount = quote.quantityToClose
					}
				} else {
					fillAmount = quote.quantityToClose
				}
				const price = await getPrice(symbol.name)
				const partyAUpnl = await this.manager.getUser(quote.partyA).getUpnl()
				const partyBUpnl = await this.hedger.getUpnl(quote.partyA)

				const closePrice = quote.requestedClosePrice //FIXME: Can we do anything else?

				const user = this.manager.getUser(quote.partyA)
				let before: FillCloseRequestValidatorBeforeOutput
				if (validate) {
					this.manager.setPauseState(true)
					before = await (validator as FillCloseRequestValidator).before(this.context, {
						user: user,
						hedger: this.hedger,
						quoteId: quote.id,
					})
				}
				await this.hedger.fillCloseRequest(
				  quote.id,
				  Builder<FillCloseRequest>()
					.filledAmount(fillAmount)
					.closedPrice(closePrice)
					.upnlPartyA(partyAUpnl)
					.upnlPartyB(partyBUpnl)
					.price(price)
					.build(),
				)
				if (validate) {
					await (validator as FillCloseRequestValidator).after(this.context, {
						user: user,
						hedger: this.hedger,
						quoteId: quote.id,
						fillAmount: fillAmount,
						closePrice: closePrice,
						beforeOutput: before!,
					})
					this.manager.setPauseState(false)
				}
				break
			}
			case Action.NOTHING: {
				if (actionWrapper.rethink) {
					logger.info(`Hedger::ReThinking about quote: ${quote.id}`)
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
											  logger.error("User failed to handle quote: " + quote.id, err)
											  console.error(err)
											  if (
												err.toString().indexOf("Transaction reverted without a reason string") >=
												0
											  )
												  setTimeout(() => process.exit(), 700)
											  reject(err)
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
