import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { ethers } from "ethers"

import { initializeFixture } from "./Initialize.fixture"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { getDummySingleUpnlSig } from "./utils/SignatureUtils"

export function shouldBehaveLikeAccountFacet(): void {
	beforeEach(async function () {
		this.context = await loadFixture(initializeFixture)
		this.user = new User(this.context, this.context.signers.user)
		await this.user.setup()
		await this.user.setBalances("500")
	})
	
	describe("Deposit", async function () {
		it("Should fail when accounting is paused", async function () {
			const context: RunContext = this.context
			await context.controlFacet.pauseAccounting()
			await expect(
				context.accountFacet.connect(context.signers.user).deposit("300"),
			).to.be.revertedWith("Pausable: Accounting paused")
		})
		
		it("Should fail on low collateral", async function () {
			const context: RunContext = this.context
			await expect(
				context.accountFacet.connect(context.signers.user2).deposit("300"),
			).to.be.revertedWith("ERC20: insufficient allowance")
			await context.collateral
				.connect(context.signers.user2)
				.approve(context.diamond, ethers.constants.MaxUint256)
			await expect(
				context.accountFacet.connect(context.signers.user2).deposit("300"),
			).to.be.revertedWith("ERC20: transfer amount exceeds balance")
		})
		
		it("Should deposit collateral", async function () {
			const context: RunContext = this.context
			const user = context.signers.user.getAddress()
			
			await context.accountFacet.connect(context.signers.user).deposit("300")
			expect(await context.viewFacet.balanceOf(user)).to.equal("300")
			expect(await context.collateral.balanceOf(user)).to.equal("200")
		})
		
		it("Should deposit collateral for another user", async function () {
			const context: RunContext = this.context
			const user = context.signers.user.getAddress()
			const user2 = context.signers.user2.getAddress()
			
			await context.accountFacet.connect(context.signers.user).depositFor(user2, "300")
			expect(await context.viewFacet.balanceOf(user)).to.equal("0")
			expect(await context.viewFacet.balanceOf(user2)).to.equal("300")
			expect(await context.collateral.balanceOf(user)).to.equal("200")
		})
	})
	
	describe("Withdraw", async function () {
		beforeEach(async function () {
			const context: RunContext = this.context
			await context.accountFacet.connect(context.signers.user).deposit("300")
		})
		
		it("Should fail to withdraw collateral more than deposit", async function () {
			const context: RunContext = this.context
			await expect(context.accountFacet.connect(context.signers.user).withdraw("350")).to.be
				.reverted
		})
		
		it("Should fail when accounting is paused", async function () {
			const context: RunContext = this.context
			await context.controlFacet.pauseAccounting()
			await expect(
				context.accountFacet.connect(context.signers.user).withdraw("300"),
			).to.be.revertedWith("Pausable: Accounting paused")
		})
		
		it("Should withdraw collateral", async function () {
			const context: RunContext = this.context
			const user = context.signers.user.getAddress()
			await context.accountFacet.connect(context.signers.user).withdraw("200")
			expect(await context.viewFacet.balanceOf(user)).to.equal("100")
			expect(await context.collateral.balanceOf(user)).to.equal("400")
		})
		
		it("Should withdraw collateral to another user", async function () {
			const context: RunContext = this.context
			const user = context.signers.user.getAddress()
			const user2 = context.signers.user2.getAddress()
			
			await context.accountFacet.connect(context.signers.user).withdrawTo(user2, "50")
			expect(await context.viewFacet.balanceOf(user)).to.equal("250")
			expect(await context.viewFacet.balanceOf(user2)).to.equal("0")
			expect(await context.collateral.balanceOf(user)).to.equal("200")
			expect(await context.collateral.balanceOf(user2)).to.equal("50")
		})
	})
	
	describe("Allocate", async function () {
		beforeEach(async function () {
			const context: RunContext = this.context
			await context.accountFacet.connect(context.signers.user).deposit("300")
		})
		
		it("Should fail on reaching balance limit", async function () {
			const context: RunContext = this.context
			await context.controlFacet.connect(context.signers.admin).setBalanceLimitPerUser("100")
			await expect(
				context.accountFacet.connect(context.signers.user).allocate("300"),
			).to.be.revertedWith("AccountFacet: Allocated balance limit reached")
		})
		
		it("Should fail when accounting is paused", async function () {
			const context: RunContext = this.context
			await context.controlFacet.pauseAccounting()
			await expect(
				context.accountFacet.connect(context.signers.user).allocate("300"),
			).to.be.revertedWith("Pausable: Accounting paused")
		})
		
		it("Should fail on Insufficient balance", async function () {
			const context: RunContext = this.context
			await expect(
				context.accountFacet.connect(context.signers.user).allocate("400"),
			).to.be.revertedWith("AccountFacet: Insufficient balance")
		})
		
		it("Should allocate", async function () {
			const context: RunContext = this.context
			const user = context.signers.user.getAddress()
			await context.accountFacet.connect(context.signers.user).allocate("100")
			
			expect(await context.viewFacet.balanceOf(user)).to.equal("200")
			expect(await context.viewFacet.allocatedBalanceOfPartyA(user)).to.equal("100")
		})
		
		it("Should deposit and allocate collateral", async function () {
			const context: RunContext = this.context
			const user = context.signers.user.getAddress()
			
			await context.accountFacet.connect(context.signers.user).depositAndAllocate("200")
			expect(await context.viewFacet.balanceOf(user)).to.equal("300")
			expect(await context.viewFacet.allocatedBalanceOfPartyA(user)).to.equal("200")
			expect(await context.collateral.balanceOf(user)).to.equal("0")
		})
		
		describe("Deallocate", async function () {
			beforeEach(async function () {
				const context: RunContext = this.context
				await context.accountFacet.connect(context.signers.user).allocate("300")
			})
			
			it("Should fail on insufficient allocated Balance", async function () {
				const context: RunContext = this.context
				await expect(
					context.accountFacet
						.connect(context.signers.user)
						.deallocate("400", await getDummySingleUpnlSig()),
				).to.be.revertedWith("AccountFacet: Insufficient allocated Balance")
			})
			
			it("Should fail when accounting is paused", async function () {
				const context: RunContext = this.context
				await context.controlFacet.pauseAccounting()
				await expect(
					context.accountFacet
						.connect(context.signers.user)
						.deallocate("300", await getDummySingleUpnlSig()),
				).to.be.revertedWith("Pausable: Accounting paused")
			})
			
			it("Should fail on available balance is lower than zero", async function () {
				const context: RunContext = this.context
				await expect(
					context.accountFacet
						.connect(context.signers.user)
						.deallocate("300", await getDummySingleUpnlSig("-350")),
				).to.be.revertedWith("AccountFacet: Available balance is lower than zero")
			})
			
			it("Should fail on partyA becoming liquidatable", async function () {
				const context: RunContext = this.context
				await expect(
					context.accountFacet
						.connect(context.signers.user)
						.deallocate("300", await getDummySingleUpnlSig("-50")),
				).to.be.revertedWith("AccountFacet: partyA will be liquidatable")
			})
			
			it("Should deallocate", async function () {
				const context: RunContext = this.context
				const user = context.signers.user.getAddress()
				await context.accountFacet
					.connect(context.signers.user)
					.deallocate("50", await getDummySingleUpnlSig())
				expect(await context.viewFacet.balanceOf(user)).to.equal("50")
				expect(await context.viewFacet.allocatedBalanceOfPartyA(user)).to.equal("250")
			})
			
			it("Should fail to withdraw due to cooldown", async function () {
				const context: RunContext = this.context
				await context.accountFacet
					.connect(context.signers.user)
					.deallocate("50", await getDummySingleUpnlSig())
				await expect(
					context.accountFacet.connect(context.signers.user).withdraw("50"),
				).to.be.revertedWith("AccountFacet: Cooldown hasn't reached")
			})
			
			it("Should withdraw after cooldown", async function () {
				const context: RunContext = this.context
				await context.accountFacet
					.connect(context.signers.user)
					.deallocate("50", await getDummySingleUpnlSig())
				await time.increase(1000)
				await context.accountFacet.connect(context.signers.user).withdraw("50")
			})
		})
	})
}
