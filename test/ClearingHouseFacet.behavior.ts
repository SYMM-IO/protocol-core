import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"

import { initializeFixture } from "./Initialize.fixture"
import { PositionType, QuoteStatus } from "./models/Enums"
import { Hedger } from "./models/Hedger"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { decimal } from "./utils/Common"
import { getDummyCrossLiquidationSig } from "./utils/SignatureUtils"
import { limitQuoteRequestBuilder } from "./models/requestModels/QuoteRequest"
import { ethers } from "hardhat"
import { toUtf8Bytes, ZeroAddress } from "ethers"
import { QuoteStructOutput } from "../src/types/contracts/interfaces/ISymmio"

export function shouldBehaveLikeClearingHouseFacet(): void {
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

		await context.controlFacet.grantRole(context.signers.liquidator.address, ethers.keccak256(toUtf8Bytes("CLEARING_HOUSE_ROLE")))
		await hedger.setBalances(decimal(2000n), decimal(2000n))
		await context.accountFacet.connect(context.signers.hedger).allocateForPartyB(2000n, ZeroAddress)
	})

	describe("liquidateCrossPartyB", async function () {
		it("Should fail when partyB MasterMode not active", async function () {
			await expect(
				context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.liquidateCrossPartyB(context.signers.hedger.getAddress(), await getDummyCrossLiquidationSig()),
			).to.be.revertedWith("ClearingHouseFacet: partyB masterMode is not active")
		})

		describe("", () => {
			beforeEach(async () => {
				await context.accountFacet.connect(context.signers.hedger).activeMasterAccountMode()
			})

			it("Should fail on partyB being solvent", async function () {
				await expect(
					context.clearingHouseFacet
						.connect(context.signers.liquidator)
						.liquidateCrossPartyB(context.signers.hedger.getAddress(), await getDummyCrossLiquidationSig(undefined, BigInt(0))),
				).to.be.revertedWith("ClearingHouseFacet: partyB is solvent")
			})

			it("Should cross liquidate partyB successfully", async function () {
				await expect(
					context.clearingHouseFacet
						.connect(context.signers.liquidator)
						.liquidateCrossPartyB(
							context.signers.hedger.getAddress(),
							await getDummyCrossLiquidationSig(undefined, BigInt("-999999999999999999999999999999")),
						),
				).to.not.reverted

				expect(await context.viewFacet.getPartyBCrossLiquidationStatus(context.signers.hedger)).to.equal(true)
				const d = await context.viewFacet.getCrossLiquidationDetails(context.signers.hedger)

				expect(d.liquidationId).to.equal("0x")
				expect(d.upnl).to.equal(BigInt("-999999999999999999999999999999"))
				expect(d.liquidationFee).to.equal(0)
				expect(d.deallocateForLiquidation).to.equal(0)
				expect(await context.viewFacet.getPartyBCrossLiquidationStatus(context.signers.hedger)).to.equal(true)
			})

			it("Should fail to cross liquidate a partyB twice", async function () {
				await context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.liquidateCrossPartyB(
						context.signers.hedger.getAddress(),
						await getDummyCrossLiquidationSig(undefined, BigInt("-999999999999999999999999999999")),
					)

				await expect(
					context.clearingHouseFacet
						.connect(context.signers.liquidator)
						.liquidateCrossPartyB(
							context.signers.hedger.getAddress(),
							await getDummyCrossLiquidationSig(undefined, BigInt("-999999999999999999999999999999")),
						),
				).to.revertedWith("Accessibility: PartyB isn't solvent")
			})
		})
	})

	describe("deallocateForCrossLiquidation", () => {
		beforeEach(async () => {
			await context.accountFacet.connect(context.signers.hedger).activeMasterAccountMode()
		})

		it("should failed when partyB not marked as cross liquid", async () => {
			await expect(
				context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.deallocateForCrossLiquidation(context.signers.hedger, context.signers.user, 100n),
			).to.revertedWith("ClearingHouseFacet: partyB is not liquidated")
		})

		describe("", () => {
			beforeEach(async () => {
				await context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.liquidateCrossPartyB(
						context.signers.hedger.getAddress(),
						await getDummyCrossLiquidationSig(undefined, BigInt("-999999999999999999999999999999")),
					)
			})

			it("should failed when deallocated amount be more than partyB allocation for for partyA", async () => {
				const allocated = await context.viewFacet.allocatedBalanceOfPartyB(context.signers.hedger, context.signers.user)
				await expect(
					context.clearingHouseFacet
						.connect(context.signers.liquidator)
						.deallocateForCrossLiquidation(context.signers.hedger, context.signers.user, allocated + BigInt(10)),
				).to.revertedWith("ClearingHouseFacet: Insufficient allocated balance")
			})

			it("should deallocated amount successfully", async () => {
				const OldAllocated = await context.viewFacet.allocatedBalanceOfPartyB(context.signers.hedger, context.signers.user)
				await expect(
					context.clearingHouseFacet
						.connect(context.signers.liquidator)
						.deallocateForCrossLiquidation(context.signers.hedger, context.signers.user, OldAllocated),
				).to.not.reverted

				const newAllocated = await context.viewFacet.allocatedBalanceOfPartyB(context.signers.hedger, context.signers.user)
				const d = await context.viewFacet.getCrossLiquidationDetails(context.signers.hedger)
				expect(newAllocated).to.equal(0)
				expect(d.deallocateForLiquidation).to.equal(OldAllocated)
			})
		})

		describe("transferToPartyA", () => {
			beforeEach(async () => {
				await context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.liquidateCrossPartyB(
						context.signers.hedger.getAddress(),
						await getDummyCrossLiquidationSig(undefined, BigInt("-999999999999999999999999999999")),
					)

				context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.deallocateForCrossLiquidation(context.signers.hedger, context.signers.user, 1000n)
			})

			it("should fail when amount be more than deallocated for liquidation", async () => {
				await expect(
					context.clearingHouseFacet.connect(context.signers.liquidator).transferToPartyA(context.signers.hedger, context.signers.user, 1001n),
				).to.revertedWith("ClearingHouseFacet: Insufficient allocated balance")
			})

			it("should transfer to partyA successfully", async () => {
				const oldAloc = await context.viewFacet.allocatedBalanceOfPartyA(context.signers.user)
				await expect(
					context.clearingHouseFacet.connect(context.signers.liquidator).transferToPartyA(context.signers.hedger, context.signers.user, 1000n),
				).to.not.reverted

				const a = await context.viewFacet.getCrossLiquidationDetails(context.signers.hedger)
				const newAloc = await context.viewFacet.allocatedBalanceOfPartyA(context.signers.user)

				expect(a.deallocateForLiquidation).to.equal(0)
				expect(oldAloc + 1000n).to.equal(newAloc)
			})
		})

		describe("transferToLiquidator", () => {
			beforeEach(async () => {
				await context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.liquidateCrossPartyB(
						context.signers.hedger.getAddress(),
						await getDummyCrossLiquidationSig(undefined, BigInt("-999999999999999999999999999999")),
					)

				await context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.deallocateForCrossLiquidation(context.signers.hedger, context.signers.user, 1000n)
			})

			it("should fail when amount be more than deallocated for liquidation", async () => {
				await expect(
					context.clearingHouseFacet.connect(context.signers.liquidator).transferToLiquidator(context.signers.hedger, 1001n),
				).to.revertedWith("ClearingHouseFacet: Insufficient allocated balance")
			})

			it("should transfer to partyA successfully", async () => {
				const oldAloc = await context.viewFacet.allocatedBalanceOfPartyA(context.signers.liquidator)
				await expect(context.clearingHouseFacet.connect(context.signers.liquidator).transferToLiquidator(context.signers.hedger, 1000n)).to.not
					.reverted

				const a = await context.viewFacet.getCrossLiquidationDetails(context.signers.hedger)
				const newAloc = await context.viewFacet.allocatedBalanceOfPartyA(context.signers.liquidator)

				expect(a.deallocateForLiquidation).to.equal(0)
				expect(a.liquidationFee).to.equal(1000n)
				expect(oldAloc + 1000n).to.equal(newAloc)
			})
		})

		describe("liquidatePendingQuotes", () => {
			beforeEach(async () => {
				await context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.liquidateCrossPartyB(
						context.signers.hedger.getAddress(),
						await getDummyCrossLiquidationSig(undefined, BigInt("-999999999999999999999999999999")),
					)
			})

			it("should liquidate pending quotes successfully", async () => {
				const oldUserPendingQuotes = await context.viewFacet.getPartyAPendingQuotes(context.signers.user)
				const targetedQuotes: QuoteStructOutput[] = []

				for await (const qId of oldUserPendingQuotes) {
					const q = await context.viewFacet.getQuote(qId)
					if (
						q.partyB == context.signers.hedger.address &&
						(q.quoteStatus == BigInt(QuoteStatus.LOCKED) || q.quoteStatus == BigInt(QuoteStatus.CANCEL_PENDING))
					) {
						targetedQuotes.push(q)
					}
				}

				await context.clearingHouseFacet.connect(context.signers.liquidator).liquidatePendingQuotes(context.signers.hedger, context.signers.user)

				const newUserPendingQuotes = await context.viewFacet.getPartyAPendingQuotes(context.signers.user)

				for await (const q of targetedQuotes) {
					const qq = await context.viewFacet.getQuote(q.id)
					expect(qq.quoteStatus).to.equal(QuoteStatus.LIQUIDATED_PENDING)
					expect(newUserPendingQuotes.indexOf(qq.id)).to.equal(-1)
				}

				// expect(await context.viewFacet.getPartyBPendingQuotes(context.signers.hedger, context.signers.user)).to.equal([])
			})
		})

		describe("liquidateCrossPositionsPartyB", () => {
			beforeEach(async () => {
				await context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.liquidateCrossPartyB(
						context.signers.hedger.getAddress(),
						await getDummyCrossLiquidationSig(undefined, BigInt("-999999999999999999999999999999")),
					)
			})
		})
	})
}
