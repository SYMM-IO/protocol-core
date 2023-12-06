import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"

import { initializeFixture } from "./Initialize.fixture"
import { LiquidationType, PositionType, QuoteStatus } from "./models/Enums"
import { Hedger } from "./models/Hedger"
import { RunContext } from "./models/RunContext"
import { BalanceInfo, User } from "./models/User"
import { decimal, getTotalLockedValuesForQuoteIds, getTradingFeeForQuotes, unDecimal } from "./utils/Common"
import { getDummyLiquidationSig, getDummySingleUpnlSig } from "./utils/SignatureUtils"
import { limitQuoteRequestBuilder } from "./models/requestModels/QuoteRequest"
import { LiquidationSigStruct } from "../src/types/contracts/facets/liquidation/LiquidationFacet"

export function shouldBehaveLikeLiquidationFacet(): void {
	let user: User
	let user2: User
	let liquidator: User
	let hedger: Hedger
	let hedger2: Hedger
	let signature1: LiquidationSigStruct
	let signature2: LiquidationSigStruct
	
	beforeEach(async function () {
		this.context = await loadFixture(initializeFixture)
		
		this.user = new User(this.context, this.context.signers.user)
		await this.user.setup()
		await this.user.setBalances(decimal(2000), decimal(1000), decimal(500))
		
		this.user2 = new User(this.context, this.context.signers.user2)
		await this.user2.setup()
		await this.user2.setBalances(decimal(2000), decimal(1000), decimal(500))
		
		this.liquidator = new User(this.context, this.context.signers.liquidator)
		await this.liquidator.setup()
		
		this.hedger = new Hedger(this.context, this.context.signers.hedger)
		await this.hedger.setup()
		await this.hedger.setBalances(decimal(2000), decimal(1000))
		
		this.hedger2 = new Hedger(this.context, this.context.signers.hedger2)
		await this.hedger2.setup()
		await this.hedger2.setBalances(decimal(2000), decimal(1000))
		
		// Quote1 -> opened
		await this.user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
		await this.hedger.lockQuote(1)
		await this.hedger.openPosition(1)
		
		// Quote2 -> locked
		await this.user.sendQuote()
		await this.hedger.lockQuote(2)
		
		// Quote3 -> sent
		await this.user.sendQuote()
		
		// Quote4 -> user2 -> opened
		await this.user2.sendQuote()
		await this.hedger.lockQuote(4)
		await this.hedger.openPosition(4)
		
		// Quote5 -> locked
		await this.user.sendQuote()
		await this.hedger.lockQuote(5)
	})
	
	describe("Liquidate PartyA", async function () {
		it("Should fail on partyA being solvent", async function () {
			const context: RunContext = this.context
			await expect(
				context.liquidationFacet.liquidatePartyA(
					context.signers.user.getAddress(),
					await getDummyLiquidationSig("0x10", 0, [], [], 0),
				),
			).to.be.revertedWith("LiquidationFacet: PartyA is solvent")
		})
		
		it("Should liquidate pending quotes", async function () {
			const context: RunContext = this.context
			
			await this.user.liquidateAndSetSymbolPrices([ 1 ], [ decimal(8) ])
			await this.user.liquidatePendingPositions()
			
			expect((await context.viewFacet.getQuote(2)).quoteStatus).to.be.equal(QuoteStatus.CANCELED)
			expect((await context.viewFacet.getQuote(3)).quoteStatus).to.be.equal(QuoteStatus.CANCELED)
			
			let balanceInfoOfPartyA: BalanceInfo = await this.user.getBalanceInfo()
			expect(balanceInfoOfPartyA.allocatedBalances).to.be.equal(
				decimal(500).sub(await getTradingFeeForQuotes(context, [ 1, 2, 3, 4 ])),
			)
			expect(balanceInfoOfPartyA.totalLockedPartyA).to.be.equal(
				await getTotalLockedValuesForQuoteIds(context, [ 1 ]),
			)
			expect(balanceInfoOfPartyA.pendingLockedCva).to.be.equal("0")
			expect(balanceInfoOfPartyA.pendingLockedMmPartyA).to.be.equal("0")
			expect(balanceInfoOfPartyA.pendingLockedLf).to.be.equal("0")
			expect(balanceInfoOfPartyA.totalPendingLockedPartyA).to.be.equal("0")
			
			let balanceInfoOfPartyB: BalanceInfo = await this.hedger.getBalanceInfo(await this.user.getAddress())
			expect(balanceInfoOfPartyB.allocatedBalances).to.be.equal(decimal(360).toString())
			expect(balanceInfoOfPartyB.lockedCva).to.be.equal(decimal(22).toString())
			expect(balanceInfoOfPartyB.lockedMmPartyB).to.be.equal(decimal(40).toString())
			expect(balanceInfoOfPartyB.lockedLf).to.be.equal(decimal(3).toString())
			expect(balanceInfoOfPartyB.totalLockedPartyB).to.be.equal(decimal(65).toString())
			expect(balanceInfoOfPartyB.pendingLockedCva).to.be.equal("0")
			expect(balanceInfoOfPartyB.pendingLockedMmPartyB).to.be.equal("0")
			expect(balanceInfoOfPartyB.pendingLockedLf).to.be.equal("0")
			expect(balanceInfoOfPartyB.totalPendingLockedPartyB).to.be.equal("0")
		})
		
		it("Should fail to liquidate a user twice", async function () {
			await this.user.liquidateAndSetSymbolPrices([ 1 ], [ decimal(8) ])
			
			await expect(
				this.user.liquidateAndSetSymbolPrices([ 1 ], [ decimal(8) ]),
			).to.be.revertedWith("Accessibility: PartyA isn't solvent")
		})
		
		describe("Test normal branch", async function () {
			const price = decimal(572, 16)
			
			beforeEach(async function () {
				this.signature1 = await this.user.liquidateAndSetSymbolPrices([ 1 ], [ price ])
				const liquidationState = await this.user.getLiquidatedStateOfPartyA()
				expect(liquidationState["liquidationType"]).to.be.equal(LiquidationType.NORMAL)
			})
			
			it("Should fail on invalid state", async function () {
				await expect(
					this.user.liquidatePositions([ 2 ]),
				).to.be.revertedWith("LiquidationFacet: Invalid state")
			})
			
			it("Should fail on partyA being solvent", async function () {
				const context: RunContext = this.context
				let user3 = context.signers.hedger2.getAddress()
				await expect(
					context.liquidationFacet
						.connect(context.signers.liquidator)
						.liquidatePositionsPartyA(user3, [ 1 ]),
				).to.be.revertedWith("LiquidationFacet: PartyA is solvent")
			})
			
			it("Should fail on partyA being the liquidator himself", async function () {
				await expect(
					this.user2.liquidatePositions([ 2 ]),
				).to.be.revertedWith("LiquidationFacet: PartyA is solvent")
			})
			
			it("Should liquidate positions", async function () {
				const context: RunContext = this.context
				await this.user.liquidatePendingPositions()
				await this.user.liquidatePositions([ 1 ])
				expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(
					QuoteStatus.LIQUIDATED,
				)
			})
			
			describe("Settle liquidation", async function () {
				beforeEach(async function () {
					await this.user.liquidatePendingPositions()
					await this.user.liquidatePositions([ 1 ])
				})
				
				it("Should settle liquidation", async function () {
					const context: RunContext = this.context
					let user = context.signers.user.getAddress()
					let hedger = context.signers.hedger.getAddress()
					
					const hedgerBalance = await this.hedger.getBalanceInfo(await this.user.getAddress())
					const userBalance = await this.user.getBalanceInfo()
					const available = userBalance.allocatedBalances.sub(userBalance.lockedCva)
					const pnl = unDecimal(price.sub(decimal(1)).mul(decimal(100)))
					const diff = available.sub(pnl)
					const partyBAfter = hedgerBalance.allocatedBalances.add(pnl).add(userBalance.lockedCva)
					
					await this.user.settleLiquidation()
					expect(await context.viewFacet.allocatedBalanceOfPartyB(hedger, user)).to.be.equal(
						partyBAfter,
					)
					let balanceInfoOfLiquidator = await this.liquidator.getBalanceInfo()
					expect(balanceInfoOfLiquidator.allocatedBalances).to.be.equal(diff)
				})
			})
		})
		
		describe("Test late branches", async function () {
			it("Late liquidation", async function () {
				const price = decimal(594, 16)
				await this.user.liquidateAndSetSymbolPrices([ 1 ], [ price ])
				const liquidationState = await this.user.getLiquidatedStateOfPartyA()
				expect(liquidationState["liquidationType"]).to.be.equal(LiquidationType.LATE)
				
				const hedgerBalance = await this.hedger.getBalanceInfo(await this.user.getAddress())
				const userBalance = await this.user.getBalanceInfo()
				const available = userBalance.allocatedBalances.sub(userBalance.lockedCva)
				const pnl = unDecimal(price.sub(decimal(1)).mul(decimal(100)))
				const diff = available.sub(pnl)
				const partyBAfter = hedgerBalance.allocatedBalances.add(pnl).add(userBalance.lockedCva).add(diff)
				
				await this.user.liquidatePendingPositions()
				await this.user.liquidatePositions([ 1 ])
				await this.user.settleLiquidation()
				expect((await this.hedger.getBalanceInfo(await this.user.getAddress())).allocatedBalances)
					.to.be.equal(partyBAfter)
				let balanceInfoOfLiquidator = await this.liquidator.getBalanceInfo()
				expect(balanceInfoOfLiquidator.allocatedBalances).to.be.equal(decimal(0))
			})
			
			it("Overdue liquidation", async function () {
				await this.user.liquidateAndSetSymbolPrices([ 1 ], [ decimal(599, 16) ])
				const liquidationState = await this.user.getLiquidatedStateOfPartyA()
				expect(liquidationState["liquidationType"]).to.be.equal(LiquidationType.OVERDUE)
				await this.user.liquidatePendingPositions()
				await this.user.liquidatePositions([ 1 ])
				await this.user.settleLiquidation()
				
				expect(await this.context.viewFacet.allocatedBalanceOfPartyB(this.hedger.getAddress(), this.user.getAddress())).to.be.equal(
					decimal(856),
				)
				let balanceInfoOfLiquidator = await this.liquidator.getBalanceInfo()
				expect(balanceInfoOfLiquidator.allocatedBalances).to.be.equal(decimal(0))
			})
			
		})
	})
	
	describe("Liquidate PartyB", async function () {
		it("Should fail on partyB being solvent", async function () {
			const context: RunContext = this.context
			await expect(
				context.liquidationFacet.liquidatePartyB(
					context.signers.hedger.getAddress(),
					context.signers.user.getAddress(),
					await getDummySingleUpnlSig(),
				),
			).to.be.revertedWith("LiquidationFacet: partyB is solvent")
		})
		
		it("Should run successfully", async function () {
			const context: RunContext = this.context
			let user = context.signers.user.getAddress()
			let hedger = context.signers.hedger.getAddress()
			
			await context.liquidationFacet.liquidatePartyB(
				hedger,
				user,
				await getDummySingleUpnlSig(decimal(-336)),
			)
			let balanceInfo: BalanceInfo = await this.hedger.getBalanceInfo(user)
			expect(balanceInfo.allocatedBalances).to.be.equal("0")
			expect(balanceInfo.lockedCva).to.be.equal("0")
			expect(balanceInfo.lockedMmPartyB).to.be.equal("0")
			expect(balanceInfo.lockedLf).to.be.equal("0")
			expect(balanceInfo.totalLockedPartyB).to.be.equal("0")
			expect(balanceInfo.pendingLockedCva).to.be.equal("0")
			expect(balanceInfo.pendingLockedMmPartyB).to.be.equal("0")
			expect(balanceInfo.pendingLockedLf).to.be.equal("0")
			expect(balanceInfo.totalPendingLockedPartyB).to.be.equal("0")
			
			expect((await context.viewFacet.getQuote(5)).quoteStatus).to.be.equal(QuoteStatus.CANCELED)
		})
		
		it("Should fail to liquidate a partyB twice", async function () {
			const context: RunContext = this.context
			await context.liquidationFacet.liquidatePartyB(
				context.signers.hedger.getAddress(),
				context.signers.user.getAddress(),
				await getDummySingleUpnlSig(decimal(-336)),
			)
			await expect(
				context.liquidationFacet.liquidatePartyB(
					context.signers.hedger.getAddress(),
					context.signers.user.getAddress(),
					await getDummySingleUpnlSig(decimal(-336)),
				),
			).to.revertedWith("Accessibility: PartyB isn't solvent")
		})
	})
}
