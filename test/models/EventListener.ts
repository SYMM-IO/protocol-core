import { BigNumber } from "ethers";
import { Subject } from "rxjs";

import {
  AllocatePartyAEventObject,
  DeallocatePartyAEventObject,
  DepositEventObject,
  WithdrawEventObject,
} from "../../src/types/contracts/facets/Account/AccountFacet";
import {
  ExpireQuoteEventObject,
  RequestToCancelCloseRequestEventObject,
  RequestToCancelQuoteEventObject,
  RequestToClosePositionEventObject,
  SendQuoteEventObject,
} from "../../src/types/contracts/facets/PartyA/IPartyAEvents";
import {
  AcceptCancelCloseRequestEventObject,
  AcceptCancelRequestEventObject,
  FillCloseRequestEventObject,
  LockQuoteEventObject,
  OpenPositionEventObject,
  UnlockQuoteEventObject,
} from "../../src/types/contracts/facets/PartyB/IPartyBEvents";
import {
  FullyLiquidatedPartyAEventObject,
  FullyLiquidatedPartyBEventObject,
  LiquidatePartyAEventObject,
  LiquidatePartyBEventObject,
  LiquidatePositionsPartyAEventObject,
  LiquidatePositionsPartyBEventObject,
} from "../../src/types/contracts/facets/liquidation/ILiquidationEvents";
import { logger } from "../utils/LoggerUtils";
import { Event, QuoteStatus } from "./Enums";
import { RunContext } from "./RunContext";

export class EventListener {
  queues: Map<QuoteStatus, Subject<BigNumber>> = new Map([
    [QuoteStatus.PENDING, new Subject<BigNumber>()],
    [QuoteStatus.LOCKED, new Subject<BigNumber>()],
    [QuoteStatus.CANCEL_PENDING, new Subject<BigNumber>()],
    [QuoteStatus.CANCELED, new Subject<BigNumber>()],
    [QuoteStatus.OPENED, new Subject<BigNumber>()],
    [QuoteStatus.CLOSE_PENDING, new Subject<BigNumber>()],
    [QuoteStatus.CANCEL_CLOSE_PENDING, new Subject<BigNumber>()],
    [QuoteStatus.CLOSED, new Subject<BigNumber>()],
    [QuoteStatus.LIQUIDATED, new Subject<BigNumber>()],
    [QuoteStatus.EXPIRED, new Subject<BigNumber>()],
  ]);

  eventTrackQueues: Map<Event, Subject<any>> = new Map<Event, Subject<any>>([
    [Event.SEND_QUOTE, new Subject<SendQuoteEventObject>()],
    [Event.REQUEST_TO_CANCEL_QUOTE, new Subject<RequestToCancelQuoteEventObject>()],
    [Event.REQUEST_TO_CLOSE_POSITION, new Subject<RequestToClosePositionEventObject>()],
    [Event.REQUEST_TO_CANCEL_CLOSE_REQUEST, new Subject<RequestToCancelCloseRequestEventObject>()],
    [Event.LOCK_QUOTE, new Subject<LockQuoteEventObject>()],
    [Event.UNLOCK_QUOTE, new Subject<UnlockQuoteEventObject>()],
    [Event.ACCEPT_CANCEL_REQUEST, new Subject<AcceptCancelCloseRequestEventObject>()],
    [Event.OPEN_POSITION, new Subject<OpenPositionEventObject>()],
    [Event.ACCEPT_CANCEL_CLOSE_REQUEST, new Subject<AcceptCancelCloseRequestEventObject>()],
    [Event.FILL_CLOSE_REQUEST, new Subject<FillCloseRequestEventObject>()],
    [Event.DEPOSIT, new Subject<DepositEventObject>()],
    [Event.WITHDRAW, new Subject<WithdrawEventObject>()],
    [Event.ALLOCATE_PARTYA, new Subject<AllocatePartyAEventObject>()],
    [Event.DEALLOCATE_PARTYA, new Subject<DeallocatePartyAEventObject>()],
    [Event.LIQUIDATE_PARTYA, new Subject<LiquidatePartyAEventObject>()],
    [Event.LIQUIDATE_POSITIONS_PARTYA, new Subject<LiquidatePositionsPartyAEventObject>()],
    [Event.FULLY_LIQUIDATED_PARTYA, new Subject<FullyLiquidatedPartyAEventObject>()],
    [Event.LIQUIDATE_PARTYB, new Subject<LiquidatePartyBEventObject>()],
    [Event.LIQUIDATE_POSITIONS_PARTYB, new Subject<LiquidatePositionsPartyBEventObject>()],
    [Event.FULLY_LIQUIDATED_PARTYB, new Subject<FullyLiquidatedPartyBEventObject>()],
    [Event.EXPIRE_QUOTE, new Subject<ExpireQuoteEventObject>()],
  ]);

  constructor(public context: RunContext) {
    (context.partyAFacet.provider as any).pollingInterval = 500;
    (context.partyBFacet.provider as any).pollingInterval = 500;

    context.accountFacet.on(Event.DEPOSIT, async (...args) => {
      let value: DepositEventObject = args[args.length - 1].args;
      this.eventTrackQueues.get(Event.DEPOSIT)!.next(value);
    });

    context.accountFacet.on(Event.WITHDRAW, async (...args) => {
      let value: WithdrawEventObject = args[args.length - 1].args;
      this.eventTrackQueues.get(Event.WITHDRAW)!.next(value);
    });

    context.accountFacet.on(Event.ALLOCATE_PARTYA, async (...args) => {
      let value: AllocatePartyAEventObject = args[args.length - 1].args;
      this.eventTrackQueues.get(Event.ALLOCATE_PARTYA)!.next(value);
    });

    context.accountFacet.on(Event.DEALLOCATE_PARTYA, async (...args) => {
      let value: DeallocatePartyAEventObject = args[args.length - 1].args;
      this.eventTrackQueues.get(Event.DEALLOCATE_PARTYA)!.next(value);
    });

    context.partyBFacet.on(Event.SEND_QUOTE, async (...args) => {
      let value: SendQuoteEventObject = args[args.length - 1].args;
      this.eventTrackQueues.get(Event.SEND_QUOTE)!.next(value);
      this.queues.get(QuoteStatus.PENDING)!.next(value.quoteId);
    });
    context.partyAFacet.on(Event.REQUEST_TO_CANCEL_QUOTE, async (...args) => {
      let value: RequestToCancelQuoteEventObject = args[args.length - 1].args;
      this.eventTrackQueues.get(Event.REQUEST_TO_CANCEL_QUOTE)!.next(value);
      this.queues.get(QuoteStatus.CANCEL_PENDING)!.next(value.quoteId);
    });
    context.partyAFacet.on(Event.REQUEST_TO_CLOSE_POSITION, async (...args) => {
      let value: RequestToClosePositionEventObject = args[args.length - 1].args;
      this.eventTrackQueues.get(Event.REQUEST_TO_CLOSE_POSITION)!.next(value);
      this.queues.get(QuoteStatus.CLOSE_PENDING)!.next(value.quoteId);
    });
    context.partyAFacet.on(Event.REQUEST_TO_CANCEL_CLOSE_REQUEST, async (...args) => {
      let value: RequestToCancelCloseRequestEventObject = args[args.length - 1].args;
      this.eventTrackQueues.get(Event.REQUEST_TO_CANCEL_CLOSE_REQUEST)!.next(value);
      this.queues.get(QuoteStatus.CANCEL_CLOSE_PENDING)!.next(value.quoteId);
    });
    context.partyBFacet.on(Event.LOCK_QUOTE, async (...args) => {
      let value: LockQuoteEventObject = args[args.length - 1].args;
      logger.detailedEventDebug("LockQuote event received");
      logger.detailedEventDebug(value);
      this.eventTrackQueues.get(Event.LOCK_QUOTE)!.next(value);
      this.queues.get(QuoteStatus.LOCKED)!.next(value.quoteId);
    });
    context.partyBFacet.on(Event.UNLOCK_QUOTE, async (...args) => {
      let value: UnlockQuoteEventObject = args[args.length - 1].args;
      logger.detailedEventDebug("UnLockQuote event received");
      logger.detailedEventDebug(value);
      this.eventTrackQueues.get(Event.UNLOCK_QUOTE)!.next(value);
      this.queues.get(QuoteStatus.PENDING)!.next(value.quoteId);
    });
    context.partyBFacet.on(Event.ACCEPT_CANCEL_REQUEST, async (...args) => {
      let value: AcceptCancelRequestEventObject = args[args.length - 1].args;
      logger.detailedEventDebug("AcceptCancelRequest event received");
      logger.detailedEventDebug(value);
      this.eventTrackQueues.get(Event.ACCEPT_CANCEL_REQUEST)!.next(value);
      this.queues.get(QuoteStatus.CANCELED)!.next(value.quoteId);
    });
    context.partyBFacet.on(Event.OPEN_POSITION, async (...args) => {
      let value: OpenPositionEventObject = args[args.length - 1].args;
      logger.detailedEventDebug("OpenPosition event received");
      logger.detailedEventDebug(value);
      this.eventTrackQueues.get(Event.OPEN_POSITION)!.next(value);
      this.queues.get(QuoteStatus.OPENED)!.next(value.quoteId);
    });
    context.partyBFacet.on(Event.ACCEPT_CANCEL_CLOSE_REQUEST, async (...args) => {
      let value: AcceptCancelCloseRequestEventObject = args[args.length - 1].args;
      logger.detailedEventDebug("AcceptCancelCloseRequest event received");
      logger.detailedEventDebug(value);
      this.eventTrackQueues.get(Event.ACCEPT_CANCEL_CLOSE_REQUEST)!.next(value);
      this.queues.get(QuoteStatus.OPENED)!.next(value.quoteId);
    });
    context.partyBFacet.on(Event.FILL_CLOSE_REQUEST, async (...args) => {
      let value: FillCloseRequestEventObject = args[args.length - 1].args;
      logger.detailedEventDebug("FillCloseRequest event received");
      logger.detailedEventDebug(value);
      this.eventTrackQueues.get(Event.FILL_CLOSE_REQUEST)!.next(value);
      let id = value.quoteId;
      if (value.quoteStatus == QuoteStatus.CLOSED) this.queues.get(QuoteStatus.CLOSED)!.next(id);
      else this.queues.get(QuoteStatus.OPENED)!.next(id);
    });

    try {
      //Contract dev logging
      context.partyBFacet.on("LogString", async (...args) => {
        logger.contractLogs("Contract:: " + args[0]);
      });
      context.partyBFacet.on("LogAddress", async (...args) => {
        logger.contractLogs("Contract:: " + args[0]);
      });
      context.partyBFacet.on("LogUint", async (...args) => {
        logger.contractLogs("Contract:: " + args[0]);
      });
      context.partyBFacet.on("LogInt", async (...args) => {
        logger.contractLogs("Contract:: " + args[0]);
      });
    } catch (ex) {
    }
  }
}
