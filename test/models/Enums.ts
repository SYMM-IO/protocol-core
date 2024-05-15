export enum QuoteStatus {
	PENDING,
	LOCKED,
	CANCEL_PENDING,
	CANCELED,
	OPENED,
	CLOSE_PENDING,
	CANCEL_CLOSE_PENDING,
	CLOSED,
	LIQUIDATED,
	EXPIRED,
	LIQUIDATED_PENDING,
}

export enum PositionType {
	LONG,
	SHORT,
}

export enum OrderType {
	LIMIT,
	MARKET,
}

export enum Event {
	SEND_QUOTE = "SendQuote",
	REQUEST_TO_CANCEL_QUOTE = "RequestToCancelQuote",
	REQUEST_TO_CLOSE_POSITION = "RequestToClosePosition",
	REQUEST_TO_CANCEL_CLOSE_REQUEST = "RequestToCancelCloseRequest",
	LOCK_QUOTE = "LockQuote",
	UNLOCK_QUOTE = "UnlockQuote",
	ACCEPT_CANCEL_REQUEST = "AcceptCancelRequest",
	OPEN_POSITION = "OpenPosition",
	ACCEPT_CANCEL_CLOSE_REQUEST = "AcceptCancelCloseRequest",
	FILL_CLOSE_REQUEST = "FillCloseRequest",
	DEPOSIT = "Deposit",
	WITHDRAW = "Withdraw",
	ALLOCATE_PARTYA = "AllocatePartyA",
	DEALLOCATE_PARTYA = "DeallocatePartyA",
	LIQUIDATE_PARTYA = "LiquidatePartyA",
	LIQUIDATE_POSITIONS_PARTYA = "LiquidatePositionsPartyA",
	FULLY_LIQUIDATED_PARTYA = "FullyLiquidatedPartyA",
	LIQUIDATE_PARTYB = "LiquidatePartyB",
	LIQUIDATE_POSITIONS_PARTYB = "LiquidatePositionsPartyB",
	FULLY_LIQUIDATED_PARTYB = "FullyLiquidatedPartyB",
	EXPIRE_QUOTE = "ExpireQuote",
}

export enum LiquidationType {
	NONE,
	NORMAL,
	LATE,
	OVERDUE,
}

export enum BridgeTransactionStatus {
	RECEIVED,
	SUSPENDED,
	WITHDRAWN,
}

export enum BridgeStatus {
	NOT_WHITELIST,
	WHITELIST,
	SUSPEND,
	REMOVE,
}
