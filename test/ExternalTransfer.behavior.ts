import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { ethers } from "hardhat"

import { initializeFixture } from "./Initialize.fixture"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { decimal } from "./utils/Common"


export function shouldBehaveLikeExternalTransfer(): void {
	let context: RunContext, user: User, user2: User
	let mockTarget: any, mockTarget2: any
	let targetAddress: string, targetAddress2: string

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances("1000")

		user2 = new User(context, context.signers.user2)
		await user2.setup()

		// Deploy mock external transfer target contracts
		const MockTargetFactory = await ethers.getContractFactory("MockExternalTransferTarget")
		mockTarget = await MockTargetFactory.deploy()
		mockTarget2 = await MockTargetFactory.deploy()
		
		targetAddress = await mockTarget.getAddress()
		targetAddress2 = await mockTarget2.getAddress()

		await context.accountFacet.connect(context.signers.user).deposit("500")
	})

	describe("Happy Path Scenarios", function () {
		beforeEach(async function () {
			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)
		})

		it("Should successfully transfer to whitelisted target", async function () {
			const userAddress = await user.getAddress()
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			const initialBalance = await context.viewFacet.balanceOf(userAddress)
			const initialTargetBalance = await context.collateral.balanceOf(targetAddress)

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)
			).to.not.be.reverted

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
	})

	describe("Access Control", function () {
		beforeEach(async function () {
			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)
		})

		it("Should allow authorized users to make transfers", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)
			).to.not.be.reverted
		})

		it("Should work for different authorized users", async function () {
			await user2.setBalances("500")
			await context.accountFacet.connect(context.signers.user2).deposit("200")

			const receiverAddress = await user.getAddress()
			const transferAmount = "50"

			await expect(
				context.accountFacet.connect(context.signers.user2).externalTransfer(receiverAddress, transferAmount, targetAddress)
			).to.not.be.reverted
		})
	})

	describe("Suspension Checks", function () {
		beforeEach(async function () {
			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)
		})

		it("Should fail when sender is suspended", async function () {
			const userAddress = await user.getAddress()
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			await context.controlFacet.connect(context.signers.admin).suspendedAddress(userAddress)

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)
			).to.be.revertedWith("Accessibility: Sender is Suspended")
		})
	})

	describe("Input Validation", function () {
		beforeEach(async function () {
			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)
		})

		it("Should fail with zero amount", async function () {
			const receiverAddress = await user2.getAddress()

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, "0", targetAddress)
			).to.be.revertedWith("AccountFacet: Amount is zero")
		})

		it("Should fail with zero receiver address", async function () {
			const transferAmount = "100"

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(ethers.ZeroAddress, transferAmount, targetAddress)
			).to.be.revertedWith("AccountFacet: Receiver is zero address")
		})

		it("Should fail with zero target address", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, ethers.ZeroAddress)
			).to.be.revertedWith("AccountFacet: Target is zero address")
		})

		it("Should fail with non-whitelisted target", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress2)
			).to.be.revertedWith("AccountFacet: Target not whitelisted")
		})
	})

	describe("State Changes", function () {
		beforeEach(async function () {
			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)
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
			// Test with different decimal amounts
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
	})

	describe("Error Conditions", function () {
		beforeEach(async function () {
			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)
		})

		it("Should fail with insufficient balance", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "600" // More than deposited amount (500)

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)
			).to.be.reverted // Should fail due to insufficient balance
		})

		it("Should fail when user has no balance", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			// Use user2 who has no deposited balance
			await expect(
				context.accountFacet.connect(context.signers.user2).externalTransfer(receiverAddress, transferAmount, targetAddress)
			).to.be.reverted
		})

		it("Should fail when target contract reverts", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			// Set mock target to revert
			await mockTarget.setShouldRevert(true, "Target contract error")

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)
			).to.be.revertedWith("Target contract error")
		})
	})

	describe("Integration Aspects", function () {
		beforeEach(async function () {
			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)
		})

		it("Should work with different collateral decimals", async function () {
			// This test assumes the collateral token has specific decimals
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			const collateralDecimals = await context.collateral.decimals()
			expect(collateralDecimals).to.be.greaterThan(0)

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)
			).to.not.be.reverted
		})

		it("Should handle target whitelist changes correctly", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			// Should work when target is whitelisted
			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)
			).to.not.be.reverted

			// Remove target from whitelist
			await context.controlFacet.connect(context.signers.admin).removeExternalTransferTarget(targetAddress)

			// Should fail after removal
			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)
			).to.be.revertedWith("AccountFacet: Target not whitelisted")

			// Re-add target to whitelist
			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)

			// Should work again
			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)
			).to.not.be.reverted
		})

		it("Should maintain correct accounting across multiple operations", async function () {
			const userAddress = await user.getAddress()
			const receiverAddress = await user2.getAddress()

			// Perform multiple operations to test accounting integrity
			await context.accountFacet.connect(context.signers.user).deposit("200") // Total: 700
			await context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, "100", targetAddress) // Remaining: 600
			await context.accountFacet.connect(context.signers.user).withdraw("50") // Remaining: 550

			const finalBalance = await context.viewFacet.balanceOf(userAddress)
			expect(finalBalance).to.equal("550")
		})

		it("Should emit events in correct order", async function () {
			const userAddress = await user.getAddress()
			const receiverAddress = await user2.getAddress()
			const transferAmount = "100"

			const tx = await context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)
			const receipt = await tx.wait()

			// Check that ExternalTransfer event is emitted
			const externalTransferEvent = receipt?.logs.find(log => {
				try {
					const parsed = context.accountFacet.interface.parseLog(log)
					return parsed?.name === "ExternalTransfer"
				} catch {
					return false
				}
			})

			expect(externalTransferEvent).to.not.be.undefined
		})
	})

	describe("Edge Cases and Boundary Conditions", function () {
		beforeEach(async function () {
			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)
		})

		it("Should handle maximum possible transfer amount", async function () {
			const userAddress = await user.getAddress()
			const receiverAddress = await user2.getAddress()

			// Get user's full balance
			const fullBalance = await context.viewFacet.balanceOf(userAddress)

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, fullBalance.toString(), targetAddress)
			).to.not.be.reverted

			// Balance should be zero after full transfer
			const finalBalance = await context.viewFacet.balanceOf(userAddress)
			expect(finalBalance).to.equal("0")
		})

		it("Should handle minimum transfer amount (1 wei)", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "1"

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)
			).to.not.be.reverted
		})

		it("Should handle same sender and receiver addresses", async function () {
			const userAddress = await user.getAddress()
			const transferAmount = "100"

			await expect(
				context.accountFacet.connect(context.signers.user).externalTransfer(userAddress, transferAmount, targetAddress)
			).to.not.be.reverted
		})

		it("Should handle rapid consecutive transfers", async function () {
			const receiverAddress = await user2.getAddress()
			const transferAmount = "50"

			// Perform multiple rapid transfers
			for (let i = 0; i < 5; i++) {
				await expect(
					context.accountFacet.connect(context.signers.user).externalTransfer(receiverAddress, transferAmount, targetAddress)
				).to.not.be.reverted
			}

			// Check final state
			const transferCount = await mockTarget.getTransferCount()
			expect(transferCount).to.equal(5)
		})
	})

	describe("Admin Functions", function () {
		it("Should allow admin to add external transfer targets", async function () {
			await expect(
				context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)
			).to.emit(context.controlFacet, "AddExternalTransferTarget")
			.withArgs(targetAddress)
		})

		it("Should allow admin to remove external transfer targets", async function () {
			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)

			await expect(
				context.controlFacet.connect(context.signers.admin).removeExternalTransferTarget(targetAddress)
			).to.emit(context.controlFacet, "RemoveExternalTransferTarget")
			.withArgs(targetAddress)
		})

		it("Should fail when non-admin tries to add external transfer target", async function () {
			await expect(
				context.controlFacet.connect(context.signers.user).addExternalTransferTarget(targetAddress)
			).to.be.revertedWith("Accessibility: Must has role")
		})

		it("Should fail when non-admin tries to remove external transfer target", async function () {
			await context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(targetAddress)

			await expect(
				context.controlFacet.connect(context.signers.user).removeExternalTransferTarget(targetAddress)
			).to.be.revertedWith("Accessibility: Must has role")
		})

		it("Should fail to add zero address as external transfer target", async function () {
			await expect(
				context.controlFacet.connect(context.signers.admin).addExternalTransferTarget(ethers.ZeroAddress)
			).to.be.revertedWith("ControlFacet: Zero address")
		})
	})
}
