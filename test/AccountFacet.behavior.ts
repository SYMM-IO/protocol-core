import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"

import { initializeFixture } from "./Initialize.fixture"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { getDummySingleUpnlSig } from "./utils/SignatureUtils"
import { Hedger } from "./models/Hedger"
import { decimal, unDecimal } from "./utils/Common"
import { ethers } from "hardhat"

export function shouldBehaveLikeAccountFacet(): void {
	let context: RunContext, user: User, user2: User, hedger: Hedger
	let mockTarget: any, mockTarget2: any
	let targetAddress: string, targetAddress2: string

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances("500")
	})

	describe("Deposit", async function () {
		it("Should fail when accounting is paused", async function () {
			await context.controlFacet.pauseAccounting()
			await expect(context.accountFacet.connect(context.signers.user).deposit("300")).to.be.revertedWith("Pausable: Accounting paused")
		})

		it("Should fail on low collateral", async function () {
			await expect(context.accountFacet.connect(context.signers.user2).deposit("300")).to.be.revertedWith("ERC20: insufficient allowance")
			await context.collateral.connect(context.signers.user2).approve(context.diamond, ethers.MaxUint256)
			await expect(context.accountFacet.connect(context.signers.user2).deposit("300")).to.be.revertedWith("ERC20: transfer amount exceeds balance")
		})

		it("Should deposit collateral", async function () {
			const userAddress = context.signers.user.getAddress()

			await context.accountFacet.connect(context.signers.user).deposit("300")
			expect(await context.viewFacet.balanceOf(userAddress)).to.equal("300")
			expect(await context.collateral.balanceOf(userAddress)).to.equal("200")
		})

		it("Should deposit collateral for another user", async function () {
			const userAddress = context.signers.user.getAddress()
			const user2Address = context.signers.user2.getAddress()

			await context.accountFacet.connect(context.signers.user).depositFor(user2Address, "300")
			expect(await context.viewFacet.balanceOf(userAddress)).to.equal("0")
			expect(await context.viewFacet.balanceOf(user2Address)).to.equal("300")
			expect(await context.collateral.balanceOf(userAddress)).to.equal("200")
		})
	})

	describe("Withdraw", async function () {
		beforeEach(async function () {
			await context.accountFacet.connect(context.signers.user).deposit("300")
		})

		it("Should fail to withdraw collateral more than deposit", async function () {
			await expect(context.accountFacet.connect(context.signers.user).withdraw("350")).to.be.reverted
		})

		it("Should fail when accounting is paused", async function () {
			await context.controlFacet.pauseAccounting()
			await expect(context.accountFacet.connect(context.signers.user).withdraw("300")).to.be.revertedWith("Pausable: Accounting paused")
		})

		it("Should withdraw collateral", async function () {
			const userAddress = context.signers.user.getAddress()
			await context.accountFacet.connect(context.signers.user).withdraw("200")
			expect(await context.viewFacet.balanceOf(userAddress)).to.equal("100")
			expect(await context.collateral.balanceOf(userAddress)).to.equal("400")
		})

		it("Should withdraw collateral to another user", async function () {
			const userAddress = context.signers.user.getAddress()
			const user2Address = context.signers.user2.getAddress()
			await context.accountFacet.connect(context.signers.user).withdrawTo(user2Address, "50")
			expect(await context.viewFacet.balanceOf(userAddress)).to.equal("250")
			expect(await context.viewFacet.balanceOf(user2Address)).to.equal("0")
			expect(await context.collateral.balanceOf(userAddress)).to.equal("200")
			expect(await context.collateral.balanceOf(user2Address)).to.equal("50")
		})
	})

	describe("Allocate", async function () {
		beforeEach(async function () {
			await context.accountFacet.connect(context.signers.user).deposit("300")
		})

		it("Should fail on reaching balance limit", async function () {
			await context.controlFacet.connect(context.signers.admin).setBalanceLimitPerUser("100")
			await expect(context.accountFacet.connect(context.signers.user).allocate("300")).to.be.revertedWith(
				"AccountFacet: Allocated balance limit reached",
			)
		})

		it("Should fail when accounting is paused", async function () {
			await context.controlFacet.pauseAccounting()
			await expect(context.accountFacet.connect(context.signers.user).allocate("300")).to.be.revertedWith("Pausable: Accounting paused")
		})

		it("Should fail on Insufficient balance", async function () {
			await expect(context.accountFacet.connect(context.signers.user).allocate("400")).to.be.revertedWith("AccountFacet: Insufficient balance")
		})

		it("Should allocate", async function () {
			const userAddress = context.signers.user.getAddress()
			await context.accountFacet.connect(context.signers.user).allocate("100")

			expect(await context.viewFacet.balanceOf(userAddress)).to.equal("200")
			expect(await context.viewFacet.allocatedBalanceOfPartyA(userAddress)).to.equal("100")
		})

		it("Should deposit and allocate collateral", async function () {
			const userAddress = context.signers.user.getAddress()

			await context.accountFacet.connect(context.signers.user).depositAndAllocate("200")
			expect(await context.viewFacet.balanceOf(userAddress)).to.equal("300")
			expect(await context.viewFacet.allocatedBalanceOfPartyA(userAddress)).to.equal("200")
			expect(await context.collateral.balanceOf(userAddress)).to.equal("0")
		})

		describe("Deallocate", async function () {
			beforeEach(async function () {
				await context.accountFacet.connect(context.signers.user).allocate("300")
			})

			it("Should fail on insufficient allocated Balance", async function () {
				await expect(context.accountFacet.connect(context.signers.user).deallocate("400", await getDummySingleUpnlSig())).to.be.revertedWith(
					"AccountFacet: Insufficient allocated Balance",
				)
			})

			it("Should fail when accounting is paused", async function () {
				await context.controlFacet.pauseAccounting()
				await expect(context.accountFacet.connect(context.signers.user).deallocate("300", await getDummySingleUpnlSig())).to.be.revertedWith(
					"Pausable: Accounting paused",
				)
			})

			it("Should fail on available balance is lower than zero", async function () {
				await expect(context.accountFacet.connect(context.signers.user).deallocate("300", await getDummySingleUpnlSig(-350n))).to.be.revertedWith(
					"AccountFacet: Available balance is lower than zero",
				)
			})

			it("Should fail on partyA becoming liquidatable", async function () {
				await expect(context.accountFacet.connect(context.signers.user).deallocate("300", await getDummySingleUpnlSig(-50n))).to.be.revertedWith(
					"AccountFacet: partyA will be liquidatable",
				)
			})

			it("Should deallocate", async function () {
				const userAddress = context.signers.user.getAddress()
				await context.accountFacet.connect(context.signers.user).deallocate("50", await getDummySingleUpnlSig())
				expect(await context.viewFacet.balanceOf(userAddress)).to.equal("50")
				expect(await context.viewFacet.allocatedBalanceOfPartyA(userAddress)).to.equal("250")
			})

			it("Should fail to deallocate too often", async function () {
				const userAddress = context.signers.user.getAddress()
				await context.accountFacet.connect(context.signers.user).deallocate("25", await getDummySingleUpnlSig())
				await expect(context.accountFacet.connect(context.signers.user).deallocate("25", await getDummySingleUpnlSig())).to.be.revertedWith(
					"AccountFacet: Too many deallocate in a short window",
				)
				await time.increase((await context.viewFacet.getDeallocateDebounceTime()) + 1n)
				await context.accountFacet.connect(context.signers.user).deallocate("25", await getDummySingleUpnlSig())
				expect(await context.viewFacet.balanceOf(userAddress)).to.equal("50")
			})

			it("Should fail to withdraw due to cooldown", async function () {
				await context.accountFacet.connect(context.signers.user).deallocate("50", await getDummySingleUpnlSig())
				await expect(context.accountFacet.connect(context.signers.user).withdraw("50")).to.be.revertedWith("AccountFacet: Cooldown hasn't reached")
			})

			it("Should withdraw after cooldown", async function () {
				await context.accountFacet.connect(context.signers.user).deallocate("50", await getDummySingleUpnlSig())
				await time.increase(1000)
				await context.accountFacet.connect(context.signers.user).withdraw("50")
			})
		})

		describe("deallocateForPartyB", () => {
			beforeEach(async () => {
				context = await loadFixture(initializeFixture)

				user = new User(context, context.signers.user)
				await user.setup()
				await user.setBalances(decimal(500n), decimal(500n), decimal(500n))

				hedger = new Hedger(context, context.signers.hedger)
				await hedger.setup()
				await hedger.setBalances(decimal(700n), decimal(700n))

				const quoteId = await user.sendQuote()
				const quote = await context.viewFacet.getQuote(quoteId)

				const notional = unDecimal(quote.quantity * quote.requestedOpenPrice)
				await context.accountFacet.connect(context.signers.hedger).allocateForPartyB(unDecimal(notional * decimal(12n, 17)), quote.partyA)

				await context.partyBQuoteActionsFacet.connect(context.signers.hedger).lockQuote(quoteId, await getDummySingleUpnlSig(0n))
			})

			it("should failed if amount be higher than partyBAllocatedBalances", async () => {
				await expect(
					context.accountFacet
						.connect(context.signers.hedger)
						.deallocateForPartyB(decimal(210n), await user.getAddress(), await getDummySingleUpnlSig()),
				).to.be.revertedWith("AccountFacet: Insufficient allocated balance")
			})

			it("should failed if amount be higher than partyBAllocatedBalances", async () => {
				await expect(
					context.accountFacet
						.connect(context.signers.hedger)
						.deallocateForPartyB(decimal(101n), await user.getAddress(), await getDummySingleUpnlSig()),
				).to.be.revertedWith("AccountFacet: Will be liquidatable")
			})

			it("should deallocate for partyB successfully", async () => {
				expect(
					await context.accountFacet
						.connect(context.signers.hedger)
						.deallocateForPartyB(decimal(50n), await user.getAddress(), await getDummySingleUpnlSig()),
				).to.not.reverted

				const newAllocatedBalanceOfPartyB = await context.viewFacet.allocatedBalanceOfPartyB(await hedger.getAddress(), await user.getAddress())

				expect(newAllocatedBalanceOfPartyB).to.be.equal(decimal(120n) - decimal(50n))
			})
		})
	})

	describe("InternalTransfer", async function () {
		beforeEach(async () => {
			user2 = new User(context, context.signers.user2)
			await user2.setup()
			await user2.setBalances("500")

			hedger = new Hedger(context, context.signers.hedger)
			await hedger.setup()
			await hedger.setBalances("500")

			await context.accountFacet.connect(context.signers.user).deposit("300")
		})

		it("should internal transfer successfully", async () => {
			await context.accountFacet.connect(context.signers.user).internalTransfer(await user2.getAddress(), "250")
			expect(await context.viewFacet.balanceOf(await user2.getAddress())).to.be.equal("0")
			expect(await context.viewFacet.allocatedBalanceOfPartyA(await user2.getAddress())).to.be.equal("250")

			expect(await context.viewFacet.balanceOf(await user.getAddress())).to.be.equal("50")
		})
	})

	describe("ExternalTransfer", async function () {
		beforeEach(async function () {
			context = await loadFixture(initializeFixture)
			user = new User(context, context.signers.user)
			await user.setup()
			await user.setBalances("1000", "1000")

			user2 = new User(context, context.signers.user2)
			await user2.setup()

			// Deploy mock external transfer target contracts
			const MockTargetFactory = await ethers.getContractFactory("MockExternalTransferTarget")
			mockTarget = await MockTargetFactory.deploy()
			mockTarget2 = await MockTargetFactory.deploy()

			targetAddress = await mockTarget.getAddress()
			targetAddress2 = await mockTarget2.getAddress()

			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)
		})

		it("Should successfully transfer to whitelisted target", async function () {
			const userAddress = await user.getAddress()
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			const initialBalance = await context.viewFacet.balanceOf(userAddress)
			const initialTargetBalance = await context.collateral.balanceOf(targetAddress)

			await expect(context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)).to.not.be
				.reverted

			const finalBalance = await context.viewFacet.balanceOf(userAddress)
			const finalTargetBalance = await context.collateral.balanceOf(targetAddress)

			expect(initialBalance - finalBalance).to.equal(transferAmount)
			expect(finalTargetBalance - initialTargetBalance).to.equal(transferAmount)
		})

		it("Should call onTransfer on target contract", async function () {
			const userAddress = await user.getAddress()
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			await context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)

			const lastTransfer = await mockTarget.lastTransfer()
			expect(lastTransfer.collateral).to.equal(await context.collateral.getAddress())
			expect(lastTransfer.sender).to.equal(userAddress)
			expect(lastTransfer.receiver).to.equal(receiverAddress)
			expect(lastTransfer.amount).to.equal(transferAmount)
		})

		it("Should allow authorized users to make transfers", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			await expect(context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)).to.not.be
				.reverted
		})

		it("Should work for different authorized users", async function () {
			await user2.setBalances("500")
			await context.accountFacet.connect(context.signers.user2).deposit("200")

			const receiverAddress = await user.getAddress()
			const transferAmount = "50"

			await expect(context.accountFacet.connect(context.signers.user2).externalTransfer(receiverAddress, transferAmount, targetAddress)).to.not.be
				.reverted
		})

		it("Should fail when sender is suspended", async function () {
			const userAddress = await user.getAddress()
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			await context.controlFacet.connect(context.signers.admin).suspendedAddress(userAddress)

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress),
			).to.be.revertedWith("Accessibility: Sender is Suspended")
		})

		it("Should fail with zero amount", async function () {
			const receiverAddress = await user2.getAddress()

			await expect(context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, "0", targetAddress)).to.be.revertedWith(
				"AccountFacet: Amount is zero",
			)
		})

		it("Should fail with zero receiver address", async function () {
			const transferAmount = "100"

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(ethers.ZeroAddress, transferAmount, targetAddress),
			).to.be.revertedWith("AccountFacet: Receiver is zero address")
		})

		it("Should fail with zero target address", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, ethers.ZeroAddress),
			).to.be.revertedWith("AccountFacet: Target is zero address")
		})

		it("Should fail with non-whitelisted target", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress2),
			).to.be.revertedWith("AccountFacet: Target not whitelisted")
		})

		it("Should correctly update sender balance", async function () {
			const userAddress = await user.getAddress()
			const receiverAddress = await user2.getAddress()
			const transferAmount = "150"

			const initialBalance = await context.viewFacet.balanceOf(userAddress)

			await context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)

			const finalBalance = await context.viewFacet.balanceOf(userAddress)
			expect(initialBalance - finalBalance).to.equal(transferAmount)
		})

		it("Should transfer correct amount to target contract", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "200"

			const initialTargetBalance = await context.collateral.balanceOf(targetAddress)

			await context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)

			const finalTargetBalance = await context.collateral.balanceOf(targetAddress)
			expect(finalTargetBalance - initialTargetBalance).to.equal(transferAmount)
		})

		it("Should handle decimal conversion correctly", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "123"

			const userAddress = await user.getAddress()
			const initialBalance = await context.viewFacet.balanceOf(userAddress)
			const initialTargetBalance = await context.collateral.balanceOf(targetAddress)

			await context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)

			const finalBalance = await context.viewFacet.balanceOf(userAddress)
			const finalTargetBalance = await context.collateral.balanceOf(targetAddress)

			expect(initialBalance - finalBalance).to.equal(transferAmount)
			expect(finalTargetBalance - initialTargetBalance).to.equal(transferAmount)
		})

		it("Should fail with insufficient balance", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "1001"

			await expect(context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)).to.be.reverted
		})

		it("Should fail when user has no balance", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			await expect(context.accountFacet.connect(context.signers.user2).externalTransfer(receiverAddress, transferAmount, targetAddress)).to.be
				.reverted
		})

		it("Should handle target whitelist changes correctly", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			await expect(context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)).to.not.be
				.reverted

			await context.controlFacet.connect(context.signers.admin).removeExternalTransferTarget(targetAddress)

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress),
			).to.be.revertedWith("AccountFacet: Target not whitelisted")

			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)

			await expect(context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)).to.not.be
				.reverted
		})
	})
}
