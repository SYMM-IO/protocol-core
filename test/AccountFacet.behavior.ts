import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers"
import {expect} from "chai"

import {initializeFixture} from "./Initialize.fixture"
import {RunContext} from "./models/RunContext"
import {User} from "./models/User"
import {getDummySingleUpnlSig} from "./utils/SignatureUtils"
import {Hedger} from "./models/Hedger"
import {decimal, unDecimal} from "./utils/Common"
import {ethers} from "hardhat"

export function shouldBehaveLikeAccountFacet(): void {
	let context: RunContext, user: User, user2: User, hedger: Hedger

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
				await expect(
					context.accountFacet.connect(context.signers.user).deallocate("25", await getDummySingleUpnlSig())
				).to.be.revertedWith("AccountFacet: Too many deallocate in a short window")
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
				).to.be.revertedWith("PartyBFacet: Insufficient allocated balance")
			})

			it("should failed if amount be higher than partyBAllocatedBalances", async () => {
				await expect(
					context.accountFacet
						.connect(context.signers.hedger)
						.deallocateForPartyB(decimal(101n), await user.getAddress(), await getDummySingleUpnlSig()),
				).to.be.revertedWith("PartyBFacet: Will be liquidatable")
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

		it('should internal transfer successfully', async () => {
			await context.accountFacet.connect(context.signers.user).internalTransfer(await user2.getAddress(), "250")
			expect(await context.viewFacet.balanceOf(await user2.getAddress())).to.be.equal('0')
			expect(await context.viewFacet.allocatedBalanceOfPartyA(await user2.getAddress())).to.be.equal('250')

			expect(await context.viewFacet.balanceOf(await user.getAddress())).to.be.equal('50')
		})

		it('should fail internal transfer if one of sides be partyB', async () => {
			await expect(context.accountFacet.connect(context.signers.user).internalTransfer(await hedger.getAddress(), "250")).to.be.revertedWith("Accessibility: Shouldn't be partyB")
			await expect(context.accountFacet.connect(context.signers.hedger).internalTransfer(await user.getAddress(), "250")).to.be.revertedWith("Accessibility: Shouldn't be partyB")
		})
	})
}
