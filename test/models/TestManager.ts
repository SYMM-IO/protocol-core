import { BehaviorSubject, concatMap, from, Subject } from "rxjs"

import { logger } from "../utils/LoggerUtils"
import { pause } from "../utils/Pauser"
import { Action } from "./Actions"
import { QuoteStatus } from "./Enums"
import { EventListener } from "./EventListener"
import { Hedger } from "./Hedger"
import { RunContext } from "./RunContext"
import { SymbolManager } from "./SymbolManager"
import { User } from "./User"
import { AcceptCancelCloseRequestValidator } from "./validators/AcceptCancelCloseRequestValidator"
import { AcceptCancelRequestValidator } from "./validators/AcceptCancelRequestValidator"
import { CancelCloseRequestValidator } from "./validators/CancelCloseRequestValidator"
import { CancelQuoteValidator } from "./validators/CancelQuoteValidator"
import { CloseRequestValidator } from "./validators/CloseRequestValidator"
import { FillCloseRequestValidator } from "./validators/FillCloseRequestValidator"
import { LockQuoteValidator } from "./validators/LockQuoteValidator"
import { OpenPositionValidator } from "./validators/OpenPositionValidator"
import { TransactionValidator } from "./validators/TransactionValidator"
import { UnlockQuoteValidator } from "./validators/UnlockQuoteValidator"

type LoopAction = {
	title: string;
	action: () => Promise<void>;
};

export class TestManager {
	users: Map<string, User> = new Map<string, User>()
	hedgers: Map<string, Hedger> = new Map<string, Hedger>()
	symbolManager: SymbolManager
	private pause = new BehaviorSubject<boolean>(false)
	
	private eventListener?: EventListener
	
	actionsLoop = new Subject<LoopAction>()
	
	validators: Map<Action, TransactionValidator> = new Map([
		[ Action.CANCEL_REQUEST, new CancelQuoteValidator() ],
		[ Action.ACCEPT_CANCEL_REQUEST, new AcceptCancelRequestValidator() ],
		[ Action.LOCK_QUOTE, new LockQuoteValidator() ],
		[ Action.UNLOCK_QUOTE, new UnlockQuoteValidator() ],
		[ Action.OPEN_POSITION, new OpenPositionValidator() ],
		[ Action.CLOSE_REQUEST, new CloseRequestValidator() ],
		[ Action.CANCEL_CLOSE_REQUEST, new CancelCloseRequestValidator() ],
		[ Action.ACCEPT_CANCEL_CLOSE_REQUEST, new AcceptCancelCloseRequestValidator() ],
		[ Action.FILL_POSITION, new FillCloseRequestValidator() ],
	])
	
	constructor(public context: RunContext, onlyInitialize: boolean) {
		this.symbolManager = new SymbolManager()
		if (!onlyInitialize) this.eventListener = new EventListener(context)
		this.actionsLoop
			.pipe(
				pause(this.pause),
				concatMap(action => {
					// console.log(action.title + "{");
					return from(action.action())
				}),
			)
			.subscribe({
				next: () => {
					// console.log("}");
				},
				error: error => {
					// console.log("}");
					logger.error("Error happened in the action loop")
					console.error(error)
				},
			})
	}
	
	public async start() {
		await this.symbolManager.loadSymbols()
	}
	
	public async registerHedger(hedger: Hedger) {
		this.hedgers.set(await hedger.getAddress(), hedger)
	}
	
	public async registerUser(user: User) {
		this.users.set(await user.getAddress(), user)
	}
	
	public getUser(address: string): User {
		return this.users.get(address)!
	}
	
	public getHedger(address: string): Hedger {
		return this.hedgers.get(address)!
	}
	
	public getQueueObservable(status: QuoteStatus) {
		return this.eventListener!.queues.get(status)!.pipe(pause(this.pause))
	}
	
	public setPauseState(b: boolean) {
		logger.detailedDebug("Pause : " + b)
		return this.pause.next(b)
	}
	
	public getPauseState(): boolean {
		return this.pause.value
	}
}
