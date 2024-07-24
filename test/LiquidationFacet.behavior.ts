import {loadFixture} from "@nomicfoundation/hardhat-network-helpers"
import {expect} from "chai"

import {initializeFixture} from "./Initialize.fixture"
import {LiquidationType, PositionType, QuoteStatus} from "./models/Enums"
import {Hedger} from "./models/Hedger"
import {RunContext} from "./models/RunContext"
import {BalanceInfo, User} from "./models/User"
import {decimal, getTotalLockedValuesForQuoteIds, getTradingFeeForQuotes, unDecimal} from "./utils/Common"
import {getDummyLiquidationSig, getDummySingleUpnlSig} from "./utils/SignatureUtils"
import {limitQuoteRequestBuilder} from "./models/requestModels/QuoteRequest"

export function shouldBehaveLikeLiquidationFacet(): void {
	let context: RunContext, user: User, user2: User, liquidator: User, hedger: Hedger, hedger2: Hedger

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(2000n), decimal(1000n), decimal(500n))

		user2 = new User(context, context.signers.user2)
		await user2.setup()
		await user2.setBalances(decimal(2000n), decimal(1000n), decimal(500n))

		liquidator = new User(context, context.signers.liquidator)
		await liquidator.setup()

		hedger = new Hedger(context, context.signers.hedger)
		await hedger.setup()
		await hedger.setBalances(decimal(2000n), decimal(1000n))

		hedger2 = new Hedger(context, context.signers.hedger2)
		await hedger2.setup()
		await hedger2.setBalances(decimal(2000n), decimal(1000n))

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

	describe("Liquidate PartyA", async function () {
		it("Should fail on partyA being solvent", async function () {
			await expect(
				context.liquidationFacet.liquidatePartyA(
					context.signers.user.getAddress(),
					await getDummyLiquidationSig("0x10", 0n, [], [], 0n, (await user.getBalanceInfo()).allocatedBalances),
				),
			).to.be.revertedWith("LiquidationFacet: PartyA is solvent")
		})

		it("Should liquidate pending quotes", async function () {
			await user.liquidateAndSetSymbolPrices([1n], [decimal(8n)])
			await user.liquidatePendingPositions()

			expect((await context.viewFacet.getQuote(2)).quoteStatus).to.be.equal(QuoteStatus.LIQUIDATED_PENDING)
			expect((await context.viewFacet.getQuote(3)).quoteStatus).to.be.equal(QuoteStatus.LIQUIDATED_PENDING)

			let balanceInfoOfPartyA: BalanceInfo = await user.getBalanceInfo()
			expect(balanceInfoOfPartyA.allocatedBalances).to.be.equal(decimal(500n) - (await getTradingFeeForQuotes(context, [1n, 2n, 3n, 4n])))
			expect(balanceInfoOfPartyA.totalLockedPartyA).to.be.equal(await getTotalLockedValuesForQuoteIds(context, [1n]))
			expect(balanceInfoOfPartyA.pendingLockedCva).to.be.equal("0")
			expect(balanceInfoOfPartyA.pendingLockedMmPartyA).to.be.equal("0")
			expect(balanceInfoOfPartyA.pendingLockedLf).to.be.equal("0")
			expect(balanceInfoOfPartyA.totalPendingLockedPartyA).to.be.equal("0")

			let balanceInfoOfPartyB: BalanceInfo = await hedger.getBalanceInfo(await user.getAddress())
			expect(balanceInfoOfPartyB.allocatedBalances).to.be.equal(decimal(360n).toString())
			expect(balanceInfoOfPartyB.lockedCva).to.be.equal(decimal(22n).toString())
			expect(balanceInfoOfPartyB.lockedMmPartyB).to.be.equal(decimal(40n).toString())
			expect(balanceInfoOfPartyB.lockedLf).to.be.equal(decimal(3n).toString())
			expect(balanceInfoOfPartyB.totalLockedPartyB).to.be.equal(decimal(65n).toString())
			expect(balanceInfoOfPartyB.pendingLockedCva).to.be.equal("0")
			expect(balanceInfoOfPartyB.pendingLockedMmPartyB).to.be.equal("0")
			expect(balanceInfoOfPartyB.pendingLockedLf).to.be.equal("0")
			expect(balanceInfoOfPartyB.totalPendingLockedPartyB).to.be.equal("0")
		})

		it("Should fail to liquidate a user twice", async function () {
			await user.liquidateAndSetSymbolPrices([1n], [decimal(8n)])
			await expect(user.liquidateAndSetSymbolPrices([1n], [decimal(8n)])).to.be.revertedWith("Accessibility: PartyA isn't solvent")
		})

		describe("Test normal branch", async function () {
			const price = decimal(572n, 16)
			beforeEach(async function () {
				this.signature1 = await user.liquidateAndSetSymbolPrices([1n], [price])
				const liquidationState = await user.getLiquidatedStateOfPartyA()
				expect(liquidationState["liquidationType"]).to.be.equal(LiquidationType.NORMAL)
			})

			it("Should fail on invalid state", async function () {
				await expect(user.liquidatePositions([2])).to.be.revertedWith("LiquidationFacet: Invalid state")
			})

			it("Should fail on partyA being solvent", async function () {
				let user3 = context.signers.hedger2.getAddress()
				await expect(context.liquidationFacet.connect(context.signers.liquidator).liquidatePositionsPartyA(user3, [1])).to.be.revertedWith(
					"LiquidationFacet: PartyA is solvent",
				)
			})

			it("Should fail on partyA being the liquidator himself", async function () {
				await expect(user2.liquidatePositions([2])).to.be.revertedWith("LiquidationFacet: PartyA is solvent")
			})

			it("Should liquidate positions", async function () {
				await user.liquidatePendingPositions()
				await user.liquidatePositions([1])
				expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(QuoteStatus.LIQUIDATED)
			})

			describe("Settle liquidation", async function () {
				beforeEach(async function () {
					await user.liquidatePendingPositions()
					await user.liquidatePositions([1])
				})

				it("Should settle liquidation", async function () {
					let userAddress = context.signers.user.getAddress()
					let hedgerAddress = context.signers.hedger.getAddress()

					const hedgerBalance = await hedger.getBalanceInfo(await user.getAddress())
					const userBalance = await user.getBalanceInfo()
					const available = userBalance.allocatedBalances - userBalance.lockedCva
					const pnl = unDecimal(price - decimal(1n)) * decimal(100n)
					const diff = available - pnl
					const partyBAfter = hedgerBalance.allocatedBalances + pnl + userBalance.lockedCva

					await user.settleLiquidation()
					expect(await context.viewFacet.allocatedBalanceOfPartyB(hedgerAddress, userAddress)).to.be.equal(partyBAfter)
					let balanceInfoOfLiquidator = await liquidator.getBalanceInfo()
					expect(balanceInfoOfLiquidator.allocatedBalances).to.be.equal(diff)
				})
			})
		})

		describe("Test late branches", async function () {
			it("Late liquidation", async function () {
				const price = decimal(594n, 16)
				await user.liquidateAndSetSymbolPrices([1n], [price])
				const liquidationState = await user.getLiquidatedStateOfPartyA()
				expect(liquidationState["liquidationType"]).to.be.equal(LiquidationType.LATE)

				const hedgerBalance = await hedger.getBalanceInfo(await user.getAddress())
				const userBalance = await user.getBalanceInfo()
				const available = userBalance.allocatedBalances - userBalance.lockedCva
				const pnl = unDecimal(price - decimal(1n)) * decimal(100n)
				const diff = available - pnl
				const partyBAfter = hedgerBalance.allocatedBalances + pnl + userBalance.lockedCva + diff

				await user.liquidatePendingPositions()
				await user.liquidatePositions([1])
				await user.settleLiquidation()
				expect((await hedger.getBalanceInfo(await user.getAddress())).allocatedBalances).to.be.equal(partyBAfter)
				let balanceInfoOfLiquidator = await liquidator.getBalanceInfo()
				expect(balanceInfoOfLiquidator.allocatedBalances).to.be.equal(decimal(0n))
			})

			it("Overdue liquidation", async function () {
				await user.liquidateAndSetSymbolPrices([1n], [decimal(599n, 16)])
				const liquidationState = await user.getLiquidatedStateOfPartyA()
				expect(liquidationState["liquidationType"]).to.be.equal(LiquidationType.OVERDUE)
				await user.liquidatePendingPositions()
				await user.liquidatePositions([1])
				await user.settleLiquidation()

				expect(await context.viewFacet.allocatedBalanceOfPartyB(hedger.getAddress(), user.getAddress())).to.be.equal(decimal(856n))
				let balanceInfoOfLiquidator = await liquidator.getBalanceInfo()
				expect(balanceInfoOfLiquidator.allocatedBalances).to.be.equal(decimal(0n))
			})
		})
	})

	describe("Liquidate PartyB", async function () {
		it("Should fail on partyB being solvent", async function () {
			await expect(
				context.liquidationFacet.liquidatePartyB(
					context.signers.hedger.getAddress(),
					context.signers.user.getAddress(),
					await getDummySingleUpnlSig(),
				),
			).to.be.revertedWith("LiquidationFacet: partyB is solvent")
		})

		it("Should run successfully", async function () {
			let userAddress = await context.signers.user.getAddress()
			let hedgerAddress = await context.signers.hedger.getAddress()

			await context.liquidationFacet.liquidatePartyB(hedgerAddress, userAddress, await getDummySingleUpnlSig(decimal(-336n)))
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

			expect((await context.viewFacet.getQuote(5)).quoteStatus).to.be.equal(QuoteStatus.LIQUIDATED_PENDING)
		})

		it("Should fail to liquidate a partyB twice", async function () {
			await context.liquidationFacet.liquidatePartyB(
				context.signers.hedger.getAddress(),
				context.signers.user.getAddress(),
				await getDummySingleUpnlSig(decimal(-336n)),
			)
			await expect(
				context.liquidationFacet.liquidatePartyB(
					context.signers.hedger.getAddress(),
					context.signers.user.getAddress(),
					await getDummySingleUpnlSig(decimal(-336n)),
				),
			).to.revertedWith("Accessibility: PartyB isn't solvent")
		})
	})
}
