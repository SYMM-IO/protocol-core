import { QuoteStatus } from "./Enums"

export enum Action {
	CANCEL_REQUEST,
	ACCEPT_CANCEL_REQUEST,
	LOCK_QUOTE,
	UNLOCK_QUOTE,
	OPEN_POSITION,
	CLOSE_REQUEST,
	CANCEL_CLOSE_REQUEST,
	ACCEPT_CANCEL_CLOSE_REQUEST,
	FILL_POSITION,
	NOTHING,
}

export class ActionWrapper {
	constructor(
		public action: Action,
		public probability: number = 1,
		public rethink: boolean = false,
	) {
	}
}

export const actionNamesMap: Map<Action, string> = new Map([
	[ Action.CANCEL_REQUEST, "CANCEL_REQUEST" ],
	[ Action.ACCEPT_CANCEL_REQUEST, "ACCEPT_CANCEL_REQUEST" ],
	[ Action.LOCK_QUOTE, "LOCK_QUOTE" ],
	[ Action.UNLOCK_QUOTE, "UNLOCK_QUOTE" ],
	[ Action.OPEN_POSITION, "OPEN_POSITION" ],
	[ Action.CLOSE_REQUEST, "CLOSE_REQUEST" ],
	[ Action.CANCEL_CLOSE_REQUEST, "CANCEL_CLOSE_REQUEST" ],
	[ Action.ACCEPT_CANCEL_CLOSE_REQUEST, "ACCEPT_CANCEL_CLOSE_REQUEST" ],
	[ Action.FILL_POSITION, "FILL_POSITION" ],
	[ Action.NOTHING, "NOTHING" ],
])

export const userActionsMap: Map<QuoteStatus, ActionWrapper[]> = new Map([
	[
		QuoteStatus.PENDING,
		[ new ActionWrapper(Action.CANCEL_REQUEST, 2), new ActionWrapper(Action.NOTHING, 8) ],
	],
	[
		QuoteStatus.LOCKED,
		[ new ActionWrapper(Action.CANCEL_REQUEST, 2), new ActionWrapper(Action.NOTHING, 8) ],
	],
	[ QuoteStatus.CANCEL_PENDING, [ new ActionWrapper(Action.NOTHING) ] ],
	[ QuoteStatus.CANCELED, [ new ActionWrapper(Action.NOTHING) ] ],
	[
		QuoteStatus.OPENED,
		[ new ActionWrapper(Action.CLOSE_REQUEST, 6), new ActionWrapper(Action.NOTHING, 4, true) ],
	],
	[
		QuoteStatus.CLOSE_PENDING,
		[ new ActionWrapper(Action.CANCEL_CLOSE_REQUEST, 1), new ActionWrapper(Action.NOTHING, 3) ],
	],
	[ QuoteStatus.CANCEL_CLOSE_PENDING, [ new ActionWrapper(Action.NOTHING) ] ],
	[ QuoteStatus.CLOSED, [ new ActionWrapper(Action.NOTHING) ] ],
	[ QuoteStatus.LIQUIDATED, [ new ActionWrapper(Action.NOTHING) ] ],
	[ QuoteStatus.EXPIRED, [ new ActionWrapper(Action.NOTHING) ] ],
])

export const hedgerActionsMap: Map<QuoteStatus, ActionWrapper[]> = new Map([
	[ QuoteStatus.PENDING, [ new ActionWrapper(Action.LOCK_QUOTE) ] ],
	[
		QuoteStatus.LOCKED,
		[ new ActionWrapper(Action.UNLOCK_QUOTE, 1), new ActionWrapper(Action.OPEN_POSITION, 4) ],
	],
	[
		QuoteStatus.CANCEL_PENDING,
		[
			new ActionWrapper(Action.ACCEPT_CANCEL_REQUEST, 1),
			new ActionWrapper(Action.OPEN_POSITION, 1),
		],
	],
	[ QuoteStatus.CANCELED, [ new ActionWrapper(Action.NOTHING) ] ],
	[ QuoteStatus.OPENED, [ new ActionWrapper(Action.NOTHING) ] ],
	[ QuoteStatus.CLOSE_PENDING, [ new ActionWrapper(Action.FILL_POSITION) ] ],
	[
		QuoteStatus.CANCEL_CLOSE_PENDING,
		[
			new ActionWrapper(Action.FILL_POSITION, 1),
			new ActionWrapper(Action.ACCEPT_CANCEL_CLOSE_REQUEST, 2),
		],
	],
	[ QuoteStatus.CLOSED, [ new ActionWrapper(Action.NOTHING) ] ],
	[ QuoteStatus.LIQUIDATED, [ new ActionWrapper(Action.NOTHING) ] ],
	[ QuoteStatus.EXPIRED, [ new ActionWrapper(Action.NOTHING) ] ],
])

export function expandActions(wrappers: ActionWrapper[]): ActionWrapper[] {
	let actions: ActionWrapper[] = []
	for (const wrapper of wrappers)
		for (let i = 0 ; i < wrapper.probability ; i++) actions.push(wrapper)
	return actions
}
