import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"

import { initializeFixture } from "./Initialize.fixture"
import { PositionType, QuoteStatus } from "./models/Enums"
import { Hedger } from "./models/Hedger"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { decimal } from "./utils/Common"
import { getDummyCrossLiquidationSig, getDummyPriceSig } from "./utils/SignatureUtils"
import { ethers } from "hardhat"
import { toUtf8Bytes, ZeroAddress } from "ethers"
import { QuoteStructOutput } from "../src/types/contracts/interfaces/ISymmio"
import { limitQuoteRequestBuilder } from "./models/requestModels/QuoteRequest"

export function shouldBehaveLikeClearingHouseFacet(): void {
	let context: RunContext, user: User, user2: User, liquidator: User, hedger: Hedger, hedger2: Hedger

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(2000n), decimal(2000n), decimal(2000n))

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

		// Quote4 -> user -> opened
		await user.sendQuote()
		await hedger.lockQuote(4)
		await hedger.openPosition(4)

		// Quote5 -> locked
		await user.sendQuote()
		await hedger.lockQuote(5)

		await context.controlFacet.grantRole(context.signers.liquidator.address, ethers.keccak256(toUtf8Bytes("CLEARING_HOUSE_ROLE")))
		await hedger.setBalances(decimal(2000n), decimal(2000n))
		await context.accountFacet.connect(context.signers.hedger).allocateForPartyB(2000n, ZeroAddress)
	})

	describe("Access Control", async function () {
		it("Should fail when caller doesn't have CLEARING_HOUSE_ROLE", async function () {
			await expect(
				context.clearingHouseFacet
					.connect(context.signers.user)
					.liquidateCrossPartyB(context.signers.hedger.address, await getDummyCrossLiquidationSig()),
			).to.be.revertedWith("Accessibility: Must has role")
		})

		it("Should succeed when caller has CLEARING_HOUSE_ROLE", async function () {
			await context.controlFacet
				.connect(context.signers.admin)
				.grantRole(context.signers.user2.address, ethers.keccak256(toUtf8Bytes("CLEARING_HOUSE_ROLE")))

			// Activate master mode for hedger
			await context.accountFacet.connect(context.signers.hedger).activateMasterAccountMode()

			await expect(
				context.clearingHouseFacet
					.connect(context.signers.user2)
					.liquidateCrossPartyB(
						context.signers.hedger.address,
						await getDummyCrossLiquidationSig(undefined, BigInt("-999999999999999999999999999999")),
					),
			).to.not.be.reverted
		})

		it("Should fail when liquidation is paused", async function () {
			await context.controlFacet.connect(context.signers.admin).pauseLiquidation()

			await expect(
				context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.liquidateCrossPartyB(context.signers.hedger.address, await getDummyCrossLiquidationSig()),
			).to.be.revertedWith("Pausable: Liquidation paused")
		})

		it("Should fail when globally paused", async function () {
			await context.controlFacet.connect(context.signers.admin).pauseGlobal()

			await expect(
				context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.liquidateCrossPartyB(context.signers.hedger.address, await getDummyCrossLiquidationSig()),
			).to.be.revertedWith("Pausable: Global paused")
		})
	})

	describe("liquidateCrossPartyB", async function () {
		it("Should fail when partyB MasterMode not active", async function () {
			await expect(
				context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.liquidateCrossPartyB(context.signers.hedger.getAddress(), await getDummyCrossLiquidationSig()),
			).to.be.revertedWith("ClearingHouseFacet: partyB is not using master account mode")
		})

		describe("With Master Mode Active", () => {
			beforeEach(async () => {
				await context.accountFacet.connect(context.signers.hedger).activateMasterAccountMode()
			})

			it("Should fail on partyB being solvent", async function () {
				await expect(
					context.clearingHouseFacet
						.connect(context.signers.liquidator)
						.liquidateCrossPartyB(context.signers.hedger.getAddress(), await getDummyCrossLiquidationSig(undefined, BigInt(0))),
				).to.be.revertedWith("ClearingHouseFacet: partyB is solvent")
			})

			it("Should fail with positive UPNL", async function () {
				await expect(
					context.clearingHouseFacet
						.connect(context.signers.liquidator)
						.liquidateCrossPartyB(context.signers.hedger.getAddress(), await getDummyCrossLiquidationSig(undefined, BigInt("1000000000000000000"))),
				).to.be.revertedWith("ClearingHouseFacet: partyB is solvent")
			})

			it("Should cross liquidate partyB successfully", async function () {
				const liquidationSig = await getDummyCrossLiquidationSig(undefined, BigInt("-999999999999999999999999999999"))

				await expect(
					context.clearingHouseFacet.connect(context.signers.liquidator).liquidateCrossPartyB(context.signers.hedger.getAddress(), liquidationSig),
				).to.not.reverted

				expect(await context.viewFacet.getPartyBCrossLiquidationStatus(context.signers.hedger)).to.equal(true)
				const details = await context.viewFacet.getCrossLiquidationDetails(context.signers.hedger)

				expect(details.liquidationId).to.equal("0x")
				expect(details.upnl).to.equal(BigInt("-999999999999999999999999999999"))
				expect(details.deallocateForLiquidation).to.equal(0)
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
			await context.accountFacet.connect(context.signers.hedger).activateMasterAccountMode()
		})

		it("should failed when partyB not marked as cross liquid", async () => {
			await expect(
				context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.deallocateForCrossLiquidation(context.signers.hedger, [context.signers.user], [100n]),
			).to.revertedWith("ClearingHouseFacet: PartyB is solvent")
		})

		describe("After PartyB Liquidation", () => {
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
						.deallocateForCrossLiquidation(context.signers.hedger, [context.signers.user], [allocated + BigInt(10)]),
				).to.revertedWith("ClearingHouseFacet: Insufficient allocated balance")
			})

			it("should deallocated amount successfully", async () => {
				const OldAllocated = await context.viewFacet.allocatedBalanceOfPartyB(context.signers.hedger, context.signers.user)
				await expect(
					context.clearingHouseFacet
						.connect(context.signers.liquidator)
						.deallocateForCrossLiquidation(context.signers.hedger, [context.signers.user], [OldAllocated]),
				).to.not.reverted

				const newAllocated = await context.viewFacet.allocatedBalanceOfPartyB(context.signers.hedger, context.signers.user)
				const d = await context.viewFacet.getCrossLiquidationDetails(context.signers.hedger)
				expect(newAllocated).to.equal(0)
				expect(d.deallocateForLiquidation).to.equal(OldAllocated)
			})

			it("should deallocate for multiple partyAs in batch", async () => {
				const OldAllocatedUser = await context.viewFacet.allocatedBalanceOfPartyB(context.signers.hedger, context.signers.user)
				const OldAllocatedUser2 = await context.viewFacet.allocatedBalanceOfPartyB(context.signers.hedger, context.signers.user2)

				const deallocateAmount1 = OldAllocatedUser / 2n
				const deallocateAmount2 = OldAllocatedUser2 / 2n

				await expect(
					context.clearingHouseFacet
						.connect(context.signers.liquidator)
						.deallocateForCrossLiquidation(
							context.signers.hedger,
							[context.signers.user, context.signers.user2],
							[deallocateAmount1, deallocateAmount2]
						),
				).to.not.reverted

				const newAllocatedUser = await context.viewFacet.allocatedBalanceOfPartyB(context.signers.hedger, context.signers.user)
				const newAllocatedUser2 = await context.viewFacet.allocatedBalanceOfPartyB(context.signers.hedger, context.signers.user2)
				const d = await context.viewFacet.getCrossLiquidationDetails(context.signers.hedger)

				expect(newAllocatedUser).to.equal(OldAllocatedUser - deallocateAmount1)
				expect(newAllocatedUser2).to.equal(OldAllocatedUser2 - deallocateAmount2)
				expect(d.deallocateForLiquidation).to.equal(deallocateAmount1 + deallocateAmount2)
			})
		})

		describe("distribute", () => {
			beforeEach(async () => {
				await context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.liquidateCrossPartyB(
						context.signers.hedger.getAddress(),
						await getDummyCrossLiquidationSig(undefined, BigInt("-999999999999999999999999999999")),
					)

				await context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.deallocateForCrossLiquidation(context.signers.hedger, [context.signers.user], [1000n])
			})

			it("should fail when amount be more than deallocated for liquidation", async () => {
				await expect(
					context.clearingHouseFacet.connect(context.signers.liquidator).distributeForCrossLiquidation(context.signers.hedger, [context.signers.user], [1001n]),
				).to.revertedWith("ClearingHouseFacet: Insufficient allocated balance")
			})

			it("should distribute to receiver successfully", async () => {
				const oldAllocation = await context.viewFacet.allocatedBalanceOfPartyA(context.signers.user)
				const transferAmount = 1000n

				await expect(
					context.clearingHouseFacet
						.connect(context.signers.liquidator)
						.distributeForCrossLiquidation(context.signers.hedger, [context.signers.user], [transferAmount]),
				).to.not.reverted

				const details = await context.viewFacet.getCrossLiquidationDetails(context.signers.hedger)
				const newAllocation = await context.viewFacet.allocatedBalanceOfPartyA(context.signers.user)

				expect(details.deallocateForLiquidation).to.equal(0)
				expect(newAllocation).to.equal(oldAllocation + transferAmount)
			})

			it("should handle partial distributions correctly", async () => {
				const partialAmount = 500n
				const detailsBefore = await context.viewFacet.getCrossLiquidationDetails(context.signers.hedger)

				await context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.distributeForCrossLiquidation(context.signers.hedger, [context.signers.user], [partialAmount])

				const detailsAfter = await context.viewFacet.getCrossLiquidationDetails(context.signers.hedger)
				expect(detailsAfter.deallocateForLiquidation).to.equal(detailsBefore.deallocateForLiquidation - partialAmount)
			})

			it("should fail when partyB is not liquidated", async () => {
				await expect(
					context.clearingHouseFacet.connect(context.signers.liquidator).distributeForCrossLiquidation(context.signers.hedger2, [context.signers.user], [1n]),
				).to.be.revertedWith("ClearingHouseFacet: PartyB is solvent")
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

				await expect(
					context.clearingHouseFacet.connect(context.signers.liquidator).liquidatePendingPositionsForCrossLiquidation(context.signers.hedger, [context.signers.user]),
				).to.not.reverted

				const newUserPendingQuotes = await context.viewFacet.getPartyAPendingQuotes(context.signers.user)

				for await (const q of targetedQuotes) {
					const qq = await context.viewFacet.getQuote(q.id)
					expect(qq.quoteStatus).to.equal(QuoteStatus.LIQUIDATED_PENDING)
					expect(newUserPendingQuotes.indexOf(qq.id)).to.equal(-1)
				}
			})

			it("should liquidate pending quotes for multiple partyAs in batch", async () => {
				const oldUserPendingQuotes = await context.viewFacet.getPartyAPendingQuotes(context.signers.user)
				const oldUser2PendingQuotes = await context.viewFacet.getPartyAPendingQuotes(context.signers.user2)

				await expect(
					context.clearingHouseFacet.connect(context.signers.liquidator).liquidatePendingPositionsForCrossLiquidation(context.signers.hedger, [context.signers.user, context.signers.user2]),
				).to.not.reverted

				const newUserPendingQuotes = await context.viewFacet.getPartyAPendingQuotes(context.signers.user)
				const newUser2PendingQuotes = await context.viewFacet.getPartyAPendingQuotes(context.signers.user2)

				expect(newUserPendingQuotes.length).to.be.lessThanOrEqual(oldUserPendingQuotes.length)
				expect(newUser2PendingQuotes.length).to.be.lessThanOrEqual(oldUser2PendingQuotes.length)
			})

			it("should fail when partyB is not liquidated", async () => {
				await expect(
					context.clearingHouseFacet.connect(context.signers.liquidator).liquidatePendingPositionsForCrossLiquidation(context.signers.hedger2, [context.signers.user]),
				).to.be.revertedWith("ClearingHouseFacet: PartyB is solvent")
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

			it("should liquidate cross positions successfully", async () => {
				const priceSig = await getDummyPriceSig([1n], [decimal(1n)])

				await expect(
					context.clearingHouseFacet
						.connect(context.signers.liquidator)
						.liquidatePositionsForCrossLiquidation(context.signers.hedger, context.signers.user, priceSig),
				).to.not.reverted

				const quote1: QuoteStructOutput = await context.viewFacet.getQuote(1)

				expect(quote1.quoteStatus).to.equal(QuoteStatus.LIQUIDATED)
			})

			it("should fail when partyB is not liquidated", async () => {
				const priceSig = await getDummyPriceSig([1n], [decimal(1n)])

				await expect(
					context.clearingHouseFacet
						.connect(context.signers.liquidator)
						.liquidatePositionsForCrossLiquidation(context.signers.hedger2, context.signers.user, priceSig),
				).to.be.revertedWith("ClearingHouseFacet: PartyB is solvent")
			})

			it("should update position statuses correctly", async () => {
				const priceSig = await getDummyPriceSig([1n, 4n], [decimal(1n), decimal(1n)])

				const quote1Before: QuoteStructOutput = await context.viewFacet.getQuote(1)
				const quote4Before: QuoteStructOutput = await context.viewFacet.getQuote(4)

				expect(quote1Before.quoteStatus).to.equal(QuoteStatus.OPENED)
				expect(quote4Before.quoteStatus).to.equal(QuoteStatus.OPENED)

				await context.clearingHouseFacet
					.connect(context.signers.liquidator)
					.liquidatePositionsForCrossLiquidation(context.signers.hedger, context.signers.user, priceSig)

				const quote1After: QuoteStructOutput = await context.viewFacet.getQuote(1)
				const quote4After: QuoteStructOutput = await context.viewFacet.getQuote(4)

				expect(quote1After.quoteStatus).to.equal(QuoteStatus.LIQUIDATED)
				expect(quote4After.quoteStatus).to.equal(QuoteStatus.LIQUIDATED)
			})
		})
	})
}
