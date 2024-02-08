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

export function shouldBehaveLikeLiquidationFacet(): void {
	let context: RunContext, user: User, user2: User, liquidator: User, hedger: Hedger, hedger2: Hedger

	beforeEach(async function() {
		context = await loadFixture(initializeFixture)
		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(2000), decimal(1000), decimal(500))

		user2 = new User(context, context.signers.user2)
		await user2.setup()
		await user2.setBalances(decimal(2000), decimal(1000), decimal(500))

		liquidator = new User(context, context.signers.liquidator)
		await liquidator.setup()

		hedger = new Hedger(context, context.signers.hedger)
		await hedger.setup()
		await hedger.setBalances(decimal(2000), decimal(1000))

		hedger2 = new Hedger(context, context.signers.hedger2)
		await hedger2.setup()
		await hedger2.setBalances(decimal(2000), decimal(1000))

		// Quote1 -> opened
		await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
		await hedger.lockQuote(1)
		await hedger.openPosition(1)

		// Quote2 -> locked
		await user.sendQuote()
		await hedger.lockQuote(2)

		// Quote3 -> sent
		await user.sendQuote()

		// Quote4 -> user2 -> opened
		await user2.sendQuote()
		await hedger.lockQuote(4)
		await hedger.openPosition(4)

		// Quote5 -> locked
		await user.sendQuote()
		await hedger.lockQuote(5)
	})

	describe("Liquidate PartyA", async function() {
		it("Should fail on partyA being solvent", async function() {
			await expect(
			  context.liquidationFacet.liquidatePartyA(
				context.signers.user.getAddress(),
				await getDummyLiquidationSig("0x10", 0, [], [], 0),
			  ),
			).to.be.revertedWith("LiquidationFacet: PartyA is solvent")
		})

		it("Should liquidate pending quotes", async function() {
			await user.liquidateAndSetSymbolPrices([1], [decimal(8)])
			await user.liquidatePendingPositions()

			expect((await context.viewFacet.getQuote(2)).quoteStatus).to.be.equal(QuoteStatus.CANCELED)
			expect((await context.viewFacet.getQuote(3)).quoteStatus).to.be.equal(QuoteStatus.CANCELED)

			let balanceInfoOfPartyA: BalanceInfo = await user.getBalanceInfo()
			expect(balanceInfoOfPartyA.allocatedBalances).to.be.equal(
			  decimal(500).sub(await getTradingFeeForQuotes(context, [1, 2, 3, 4])),
			)
			expect(balanceInfoOfPartyA.totalLockedPartyA).to.be.equal(
			  await getTotalLockedValuesForQuoteIds(context, [1]),
			)
			expect(balanceInfoOfPartyA.pendingLockedCva).to.be.equal("0")
			expect(balanceInfoOfPartyA.pendingLockedMmPartyA).to.be.equal("0")
			expect(balanceInfoOfPartyA.pendingLockedLf).to.be.equal("0")
			expect(balanceInfoOfPartyA.totalPendingLockedPartyA).to.be.equal("0")

			let balanceInfoOfPartyB: BalanceInfo = await hedger.getBalanceInfo(await user.getAddress())
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

		it("Should fail to liquidate a user twice", async function() {
			await user.liquidateAndSetSymbolPrices([1], [decimal(8)])
			await expect(
			  user.liquidateAndSetSymbolPrices([1], [decimal(8)]),
			).to.be.revertedWith("Accessibility: PartyA isn't solvent")
		})

		describe("Test normal branch", async function() {
			const price = decimal(572, 16)
			beforeEach(async function() {
				this.signature1 = await user.liquidateAndSetSymbolPrices([1], [price])
				const liquidationState = await user.getLiquidatedStateOfPartyA()
				expect(liquidationState["liquidationType"]).to.be.equal(LiquidationType.NORMAL)
			})

			it("Should fail on invalid state", async function() {
				await expect(
				  user.liquidatePositions([2]),
				).to.be.revertedWith("LiquidationFacet: Invalid state")
			})

			it("Should fail on partyA being solvent", async function() {
				let user3 = context.signers.hedger2.getAddress()
				await expect(
				  context.liquidationFacet
					.connect(context.signers.liquidator)
					.liquidatePositionsPartyA(user3, [1]),
				).to.be.revertedWith("LiquidationFacet: PartyA is solvent")
			})

			it("Should fail on partyA being the liquidator himself", async function() {
				await expect(
				  user2.liquidatePositions([2]),
				).to.be.revertedWith("LiquidationFacet: PartyA is solvent")
			})

			it("Should liquidate positions", async function() {
				await user.liquidatePendingPositions()
				await user.liquidatePositions([1])
				expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(
				  QuoteStatus.LIQUIDATED,
				)
			})

			describe("Settle liquidation", async function() {
				beforeEach(async function() {
					await user.liquidatePendingPositions()
					await user.liquidatePositions([1])
				})

				it("Should settle liquidation", async function() {
					let userAddress = context.signers.user.getAddress()
					let hedgerAddress = context.signers.hedger.getAddress()

					const hedgerBalance = await hedger.getBalanceInfo(await user.getAddress())
					const userBalance = await user.getBalanceInfo()
					const available = userBalance.allocatedBalances.sub(userBalance.lockedCva)
					const pnl = unDecimal(price.sub(decimal(1)).mul(decimal(100)))
					const diff = available.sub(pnl)
					const partyBAfter = hedgerBalance.allocatedBalances.add(pnl).add(userBalance.lockedCva)

					await user.settleLiquidation()
					expect(await context.viewFacet.allocatedBalanceOfPartyB(hedgerAddress, userAddress)).to.be.equal(
					  partyBAfter,
					)
					let balanceInfoOfLiquidator = await liquidator.getBalanceInfo()
					expect(balanceInfoOfLiquidator.allocatedBalances).to.be.equal(diff)
				})
			})
		})

		describe("Test late branches", async function() {
			it("Late liquidation", async function() {
				const price = decimal(594, 16)
				await user.liquidateAndSetSymbolPrices([1], [price])
				const liquidationState = await user.getLiquidatedStateOfPartyA()
				expect(liquidationState["liquidationType"]).to.be.equal(LiquidationType.LATE)

				const hedgerBalance = await hedger.getBalanceInfo(await user.getAddress())
				const userBalance = await user.getBalanceInfo()
				const available = userBalance.allocatedBalances.sub(userBalance.lockedCva)
				const pnl = unDecimal(price.sub(decimal(1)).mul(decimal(100)))
				const diff = available.sub(pnl)
				const partyBAfter = hedgerBalance.allocatedBalances.add(pnl).add(userBalance.lockedCva).add(diff)

				await user.liquidatePendingPositions()
				await user.liquidatePositions([1])
				await user.settleLiquidation()
				expect((await hedger.getBalanceInfo(await user.getAddress())).allocatedBalances)
				  .to.be.equal(partyBAfter)
				let balanceInfoOfLiquidator = await liquidator.getBalanceInfo()
				expect(balanceInfoOfLiquidator.allocatedBalances).to.be.equal(decimal(0))
			})

			it("Overdue liquidation", async function() {
				await user.liquidateAndSetSymbolPrices([1], [decimal(599, 16)])
				const liquidationState = await user.getLiquidatedStateOfPartyA()
				expect(liquidationState["liquidationType"]).to.be.equal(LiquidationType.OVERDUE)
				await user.liquidatePendingPositions()
				await user.liquidatePositions([1])
				await user.settleLiquidation()

				expect(await context.viewFacet.allocatedBalanceOfPartyB(hedger.getAddress(), user.getAddress())).to.be.equal(
				  decimal(856),
				)
				let balanceInfoOfLiquidator = await liquidator.getBalanceInfo()
				expect(balanceInfoOfLiquidator.allocatedBalances).to.be.equal(decimal(0))
			})

		})
	})

	describe("Liquidate PartyB", async function() {
		it("Should fail on partyB being solvent", async function() {
			await expect(
			  context.liquidationFacet.liquidatePartyB(
				context.signers.hedger.getAddress(),
				context.signers.user.getAddress(),
				await getDummySingleUpnlSig(),
			  ),
			).to.be.revertedWith("LiquidationFacet: partyB is solvent")
		})

		it("Should run successfully", async function() {
			let userAddress = await context.signers.user.getAddress()
			let hedgerAddress = await context.signers.hedger.getAddress()

			await context.liquidationFacet.liquidatePartyB(
			  hedgerAddress,
			  userAddress,
			  await getDummySingleUpnlSig(decimal(-336)),
			)
			let balanceInfo: BalanceInfo = await hedger.getBalanceInfo(userAddress)
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

		it("Should fail to liquidate a partyB twice", async function() {
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
