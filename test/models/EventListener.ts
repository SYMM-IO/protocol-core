import {Subject} from "rxjs"

import {logger} from "../utils/LoggerUtils"
import {Event, QuoteStatus} from "./Enums"
import {RunContext} from "./RunContext"
import {
	AcceptCancelCloseRequestEvent,
	AcceptCancelRequestEvent,
	AllocatePartyAEvent,
	DeallocatePartyAEvent,
	DepositEvent,
	ExpireQuoteCloseEvent,
	ExpireQuoteOpenEvent,
	FillCloseRequestEvent,
	FullyLiquidatedPartyBEvent,
	LiquidatePartyAEvent,
	LiquidatePartyBEvent,
	LiquidatePositionsPartyAEvent,
	LiquidatePositionsPartyBEvent,
	LockQuoteEvent,
	OpenPositionEvent,
	RequestToCancelCloseRequestEvent,
	RequestToCancelQuoteEvent,
	RequestToClosePositionEvent,
	SendQuoteEvent,
	UnlockQuoteEvent,
	WithdrawEvent
} from "../../src/types/contracts/interfaces/ISymmio"

export class EventListener {
	queues: Map<QuoteStatus, Subject<bigint>> = new Map([
		[QuoteStatus.PENDING, new Subject<bigint>()],
		[QuoteStatus.LOCKED, new Subject<bigint>()],
		[QuoteStatus.CANCEL_PENDING, new Subject<bigint>()],
		[QuoteStatus.CANCELED, new Subject<bigint>()],
		[QuoteStatus.OPENED, new Subject<bigint>()],
		[QuoteStatus.CLOSE_PENDING, new Subject<bigint>()],
		[QuoteStatus.CANCEL_CLOSE_PENDING, new Subject<bigint>()],
		[QuoteStatus.CLOSED, new Subject<bigint>()],
		[QuoteStatus.LIQUIDATED, new Subject<bigint>()],
		[QuoteStatus.EXPIRED, new Subject<bigint>()],
	])

	eventTrackQueues: Map<Event, Subject<any>> = new Map<Event, Subject<any>>([
		[Event.SEND_QUOTE, new Subject<SendQuoteEvent.OutputObject>()],
		[Event.REQUEST_TO_CANCEL_QUOTE, new Subject<RequestToCancelQuoteEvent.OutputObject>()],
		[Event.REQUEST_TO_CLOSE_POSITION, new Subject<RequestToClosePositionEvent.OutputObject>()],
		[Event.REQUEST_TO_CANCEL_CLOSE_REQUEST, new Subject<RequestToCancelCloseRequestEvent.OutputObject>()],
		[Event.LOCK_QUOTE, new Subject<LockQuoteEvent.OutputObject>()],
		[Event.UNLOCK_QUOTE, new Subject<UnlockQuoteEvent.OutputObject>()],
		[Event.ACCEPT_CANCEL_REQUEST, new Subject<AcceptCancelRequestEvent.OutputObject>()],
		[Event.OPEN_POSITION, new Subject<OpenPositionEvent.OutputObject>()],
		[Event.ACCEPT_CANCEL_CLOSE_REQUEST, new Subject<AcceptCancelCloseRequestEvent.OutputObject>()],
		[Event.FILL_CLOSE_REQUEST, new Subject<FillCloseRequestEvent.OutputObject>()],
		[Event.DEPOSIT, new Subject<DepositEvent.OutputObject>()],
		[Event.WITHDRAW, new Subject<WithdrawEvent.OutputObject>()],
		[Event.ALLOCATE_PARTYA, new Subject<AllocatePartyAEvent.OutputObject>()],
		[Event.DEALLOCATE_PARTYA, new Subject<DeallocatePartyAEvent.OutputObject>()],
		[Event.LIQUIDATE_PARTYA, new Subject<LiquidatePartyAEvent.OutputObject>()],
		[Event.LIQUIDATE_POSITIONS_PARTYA, new Subject<LiquidatePositionsPartyAEvent.OutputObject>()],
		[Event.LIQUIDATE_PARTYB, new Subject<LiquidatePartyBEvent.OutputObject>()],
		[Event.LIQUIDATE_POSITIONS_PARTYB, new Subject<LiquidatePositionsPartyBEvent.OutputObject>()],
		[Event.FULLY_LIQUIDATED_PARTYB, new Subject<FullyLiquidatedPartyBEvent.OutputObject>()],
		[Event.EXPIRE_QUOTE_OPEN, new Subject<ExpireQuoteOpenEvent.OutputObject>()],
		[Event.EXPIRE_QUOTE_CLOSE, new Subject<ExpireQuoteCloseEvent.OutputObject>()],
	])

	constructor(public context: RunContext) {
		;(context.partyAFacet.runner as any).pollingInterval = 500 // was .provider !
		;(context.partyBFacet.runner as any).pollingInterval = 500 // was .provider !

		context.accountFacet.on(context.accountFacet.filters.Deposit, async (...args) => {
			let value: DepositEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			this.eventTrackQueues.get(Event.DEPOSIT)!.next(value)
		})

		context.accountFacet.on(context.accountFacet.filters.Withdraw, async (...args) => {
			let value: WithdrawEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			this.eventTrackQueues.get(Event.WITHDRAW)!.next(value)
		})

		context.accountFacet.on(context.accountFacet.filters.AllocatePartyA, async (...args) => {
			let value: AllocatePartyAEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			this.eventTrackQueues.get(Event.ALLOCATE_PARTYA)!.next(value)
		})

		context.accountFacet.on(context.accountFacet.filters.DeallocatePartyA, async (...args) => {
			let value: DeallocatePartyAEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			this.eventTrackQueues.get(Event.DEALLOCATE_PARTYA)!.next(value)
		})

		context.partyBFacet.on(context.partyBFacet.filters.SendQuote, async (...args) => {
			let value: SendQuoteEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			this.eventTrackQueues.get(Event.SEND_QUOTE)!.next(value)
			this.queues.get(QuoteStatus.PENDING)!.next(value.quoteId)
		})
		context.partyAFacet.on(context.partyAFacet.filters.RequestToCancelQuote, async (...args) => {
			let value: RequestToCancelQuoteEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			this.eventTrackQueues.get(Event.REQUEST_TO_CANCEL_QUOTE)!.next(value)
			this.queues.get(QuoteStatus.CANCEL_PENDING)!.next(value.quoteId)
		})
		context.partyAFacet.on(context.partyAFacet.filters.RequestToClosePosition, async (...args) => {
			let value: RequestToClosePositionEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			this.eventTrackQueues.get(Event.REQUEST_TO_CLOSE_POSITION)!.next(value)
			this.queues.get(QuoteStatus.CLOSE_PENDING)!.next(value.quoteId)
		})
		context.partyAFacet.on(context.partyAFacet.filters.RequestToCancelCloseRequest, async (...args) => {
			let value: RequestToCancelCloseRequestEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			this.eventTrackQueues.get(Event.REQUEST_TO_CANCEL_CLOSE_REQUEST)!.next(value)
			this.queues.get(QuoteStatus.CANCEL_CLOSE_PENDING)!.next(value.quoteId)
		})
		context.partyBFacet.on(context.partyBFacet.filters.LockQuote, async (...args) => {
			let value: LockQuoteEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			logger.detailedEventDebug("LockQuote event received")
			logger.detailedEventDebug(value)
			this.eventTrackQueues.get(Event.LOCK_QUOTE)!.next(value)
			this.queues.get(QuoteStatus.LOCKED)!.next(value.quoteId)
		})
		context.partyBFacet.on(context.partyBFacet.filters.UnlockQuote, async (...args) => {
			let value: UnlockQuoteEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			logger.detailedEventDebug("UnLockQuote event received")
			logger.detailedEventDebug(value)
			this.eventTrackQueues.get(Event.UNLOCK_QUOTE)!.next(value)
			this.queues.get(QuoteStatus.PENDING)!.next(value.quoteId)
		})
		context.partyBFacet.on(context.partyBFacet.filters.AcceptCancelRequest, async (...args) => {
			let value: AcceptCancelRequestEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			logger.detailedEventDebug("AcceptCancelRequest event received")
			logger.detailedEventDebug(value)
			this.eventTrackQueues.get(Event.ACCEPT_CANCEL_REQUEST)!.next(value)
			this.queues.get(QuoteStatus.CANCELED)!.next(value.quoteId)
		})
		context.partyBFacet.on(context.partyBFacet.filters.OpenPosition, async (...args) => {
			let value: OpenPositionEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			logger.detailedEventDebug("OpenPosition event received")
			logger.detailedEventDebug(value)
			this.eventTrackQueues.get(Event.OPEN_POSITION)!.next(value)
			this.queues.get(QuoteStatus.OPENED)!.next(value.quoteId)
		})
		context.partyBFacet.on(context.partyBFacet.filters.AcceptCancelCloseRequest, async (...args) => {
			let value: AcceptCancelCloseRequestEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			logger.detailedEventDebug("AcceptCancelCloseRequest event received")
			logger.detailedEventDebug(value)
			this.eventTrackQueues.get(Event.ACCEPT_CANCEL_CLOSE_REQUEST)!.next(value)
			this.queues.get(QuoteStatus.OPENED)!.next(value.quoteId)
		})
		context.partyBFacet.on(context.partyBFacet.filters.FillCloseRequest, async (...args) => {
			let value: FillCloseRequestEvent.OutputObject = (args[args.length - 1]! as any).args //FIXME: Will probably not work
			logger.detailedEventDebug("FillCloseRequest event received")
			logger.detailedEventDebug(value)
			this.eventTrackQueues.get(Event.FILL_CLOSE_REQUEST)!.next(value)
			let id = value.quoteId
			if (value.quoteStatus == BigInt(QuoteStatus.CLOSED)) this.queues.get(QuoteStatus.CLOSED)!.next(id)
			else this.queues.get(QuoteStatus.OPENED)!.next(id)
		})

		try {
			//Contract dev logging
			// context.partyBFacet.on("LogString", async (...args) => {
			//     logger.contractLogs("Contract:: " + args[0])
			// })
			// context.partyBFacet.on("LogAddress", async (...args) => {
			//     logger.contractLogs("Contract:: " + args[0])
			// })
			// context.partyBFacet.on("LogUint", async (...args) => {
			//     logger.contractLogs("Contract:: " + args[0])
			// })
			// context.partyBFacet.on("LogInt", async (...args) => {
			//     logger.contractLogs("Contract:: " + args[0])
			// })
		} catch (ex) {
		}
	}
}
