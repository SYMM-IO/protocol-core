import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { ethers } from "hardhat"

import { initializeFixture } from "./Initialize.fixture"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { BridgeTransactionStatus } from "./models/Enums"
import { TransferToBridgeValidator } from "./models/validators/TransferToBridgeValidator"
import { WithdrawLockedTransactionValidator } from "./models/validators/WithdrawLockedTransactionValidator"
import { decimal, pauseAccounting, suspendAddress } from "./utils/Common"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers"
import { MockVirtualBridge } from "../src/types"

export function shouldBehaveLikeBridgeFacet(): void {
	let context: RunContext, user: User, user2: User
	let bridge: SignerWithAddress, bridge2: SignerWithAddress

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		bridge = context.signers.bridge // regular bridge
		bridge2 = context.signers.bridge2 // additional regular bridge
		user = new User(context, context.signers.user)
		user2 = new User(context, context.signers.user2)

		await user.setup()
		await user.setBalances(decimal(5000n), decimal(5000n), decimal(1000n))
		await user2.setup()
		await user2.setBalances(decimal(3000n), decimal(3000n), decimal(500n))

		// Setup bridges
		await context.controlFacet.addBridge(await bridge.getAddress())
		await context.controlFacet.addBridge(await bridge2.getAddress())
	})

	describe("transferToBridge", async function () {
		it("Should fail when bridge is not registered", async function () {
			const unregisteredBridge = context.signers.user2
			await expect(
				context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await unregisteredBridge.getAddress()),
			).to.be.revertedWith("BridgeFacet: Invalid bridge")
		})

		it("Should fail when amount exceeds user balance", async function () {
			await expect(context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(7000n), await bridge.getAddress())).to.be.revertedWith(
				"BridgeFacet: Insufficient balance",
			)
		})

		it("Should fail when bridge and user are the same address", async function () {
			await expect(context.bridgeFacet.connect(context.signers.bridge).transferToBridge(decimal(100n), await bridge.getAddress())).to.be.revertedWith(
				"BridgeFacet: Bridge and user can't be the same",
			)
		})

		it("Should fail when accounting is paused", async function () {
			await pauseAccounting(context)
			await expect(context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())).to.be.revertedWith(
				"Pausable: Accounting paused",
			)
		})

		it("Should fail when user is suspended", async function () {
			await suspendAddress(context, await context.signers.user.getAddress())
			await expect(context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())).to.be.revertedWith(
				"Accessibility: Sender is Suspended",
			)
		})

		it("Should transfer to bridge successfully", async function () {
			const id = await context.viewFacet.getNextBridgeTransactionId()

			const validator = new TransferToBridgeValidator()
			const beforeOut = await validator.before(context, {
				user: user,
				transactionId: id + 1n,
				bridge: await bridge.getAddress(),
			})

			await expect(context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())).to.not.reverted

			await validator.after(context, {
				user: user,
				amount: decimal(100n),
				transactionId: id + 1n,
				beforeOutput: beforeOut,
			})
		})

		it("Should handle multiple transfers correctly", async function () {
			const amount1 = decimal(100n)
			const amount2 = decimal(200n)

			await context.bridgeFacet.connect(context.signers.user).transferToBridge(amount1, await bridge.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(amount2, await bridge2.getAddress())

			const transaction1 = await context.viewFacet.getBridgeTransaction(1)
			const transaction2 = await context.viewFacet.getBridgeTransaction(2)

			expect(transaction1.amount).to.equal(amount1)
			expect(transaction1.bridge).to.equal(await bridge.getAddress())
			expect(transaction2.amount).to.equal(amount2)
			expect(transaction2.bridge).to.equal(await bridge2.getAddress())
		})
	})

	describe("suspendBridgeTransaction", async function () {
		beforeEach(async function () {
			// Create test transactions
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(200n), await bridge2.getAddress())
		})

		it("Should fail with invalid transaction ID", async function () {
			await expect(context.bridgeFacet.connect(context.signers.admin).suspendBridgeTransaction(999)).to.be.revertedWith(
				"BridgeFacet: Invalid transactionId",
			)
		})

		it("Should fail when transaction is already withdrawn", async function () {
			await time.increase(43250) // 12h cooldown
			await context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(1)

			await expect(context.bridgeFacet.connect(context.signers.admin).suspendBridgeTransaction(1)).to.be.revertedWith("BridgeFacet: Invalid status")
		})

		it("Should fail when caller lacks SUSPENDER_ROLE", async function () {
			await expect(context.bridgeFacet.connect(context.signers.user).suspendBridgeTransaction(1)).to.be.revertedWith("Accessibility: Must has role")
		})

		it("Should suspend transaction successfully", async function () {
			await expect(context.bridgeFacet.connect(context.signers.admin).suspendBridgeTransaction(1)).to.not.reverted

			const transaction = await context.viewFacet.getBridgeTransaction(1)
			expect(transaction.status).to.equal(BridgeTransactionStatus.SUSPENDED)
		})
	})

	describe("restoreBridgeTransaction", async function () {
		beforeEach(async function () {
			// Create and suspend a transaction
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())
			await context.bridgeFacet.connect(context.signers.admin).suspendBridgeTransaction(1)
		})

		it("Should fail with invalid transaction ID", async function () {
			await expect(context.bridgeFacet.connect(context.signers.admin).restoreBridgeTransaction(999, decimal(50n))).to.be.revertedWith(
				"BridgeFacet: Invalid status",
			)
		})

		it("Should fail when transaction is not suspended", async function () {
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())

			await expect(context.bridgeFacet.connect(context.signers.admin).restoreBridgeTransaction(2, decimal(50n))).to.be.revertedWith(
				"BridgeFacet: Invalid status",
			)
		})

		it("Should fail when valid amount exceeds original amount", async function () {
			const transaction = await context.viewFacet.getBridgeTransaction(1)

			await expect(context.bridgeFacet.connect(context.signers.admin).restoreBridgeTransaction(1, transaction.amount + 1n)).to.be.revertedWith(
				"BridgeFacet: High valid amount",
			)
		})

		it("Should fail when caller lacks DISPUTE_ROLE", async function () {
			await expect(context.bridgeFacet.connect(context.signers.user).restoreBridgeTransaction(1, decimal(50n))).to.be.revertedWith(
				"Accessibility: Must has role",
			)
		})

		it("Should restore transaction successfully", async function () {
			const originalTransaction = await context.viewFacet.getBridgeTransaction(1)
			const validAmount = originalTransaction.amount / 2n

			await expect(context.bridgeFacet.connect(context.signers.admin).restoreBridgeTransaction(1, validAmount)).to.not.reverted

			const restoredTransaction = await context.viewFacet.getBridgeTransaction(1)
			expect(restoredTransaction.status).to.equal(BridgeTransactionStatus.RECEIVED)
			expect(restoredTransaction.amount).to.equal(validAmount)
		})
	})

	describe("withdrawReceivedBridgeValue", async function () {
		beforeEach(async function () {
			// Create test transactions
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(200n), await bridge2.getAddress())
		})

		it("Should fail with invalid transaction ID", async function () {
			await time.increase(43250) // 12h cooldown
			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(999)).to.be.revertedWith(
				"BridgeFacet: Invalid transactionId",
			)
		})

		it("Should fail when sender is not the transaction's bridge", async function () {
			await time.increase(43250) // 12h cooldown
			await expect(context.bridgeFacet.connect(context.signers.bridge2).withdrawReceivedBridgeValue(1)).to.be.revertedWith(
				"BridgeFacet: Sender is not the transaction's bridge",
			)
		})

		it("Should fail when cooldown period hasn't elapsed", async function () {
			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(1)).to.be.revertedWith(
				"BridgeFacet: Cooldown hasn't reached",
			)
		})

		it("Should fail when transaction is already withdrawn", async function () {
			await time.increase(43250) // 12h cooldown
			await context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(1)

			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(1)).to.be.revertedWith(
				"BridgeFacet: Already withdrawn",
			)
		})

		it("Should fail when accounting is paused", async function () {
			await time.increase(43250) // 12h cooldown
			await pauseAccounting(context)

			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(1)).to.be.revertedWith(
				"Pausable: Accounting paused",
			)
		})

		it("Should fail when bridge is suspended", async function () {
			await time.increase(43250) // 12h cooldown
			await suspendAddress(context, await bridge.getAddress())

			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(1)).to.be.revertedWith(
				"Accessibility: Sender is Suspended",
			)
		})

		it("Should withdraw successfully", async function () {
			await time.increase(43250) // 12h cooldown

			const validator = new WithdrawLockedTransactionValidator()
			const beforeOut = await validator.before(context, {
				transactionId: 1n,
				bridge: await bridge.getAddress(),
			})

			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(1)).to.not.reverted

			await validator.after(context, {
				transactionId: 1n,
				beforeOutput: beforeOut,
			})

			const transaction = await context.viewFacet.getBridgeTransaction(1)
			expect(transaction.status).to.equal(BridgeTransactionStatus.WITHDRAWN)
		})
	})

	describe("withdrawReceivedBridgeValues", async function () {
		beforeEach(async function () {
			// Create multiple test transactions for the same bridge
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(200n), await bridge.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(150n), await bridge.getAddress())
		})

		it("Should handle empty transaction IDs array", async function () {
			await time.increase(43250) // 12h cooldown
			// Empty array should succeed but transfer 0 amount
			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValues([])).to.not.be.reverted
		})

		it("Should fail with invalid transaction ID", async function () {
			await time.increase(43250) // 12h cooldown
			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValues([1, 999])).to.be.revertedWith(
				"BridgeFacet: Invalid transactionId",
			)
		})

		it("Should fail when sender is not the transaction's bridge", async function () {
			await time.increase(43250) // 12h cooldown
			await expect(context.bridgeFacet.connect(context.signers.bridge2).withdrawReceivedBridgeValues([1, 2])).to.be.revertedWith(
				"BridgeFacet: Sender is not the transaction's bridge",
			)
		})

		it("Should fail when cooldown period hasn't elapsed", async function () {
			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValues([1, 2])).to.be.revertedWith(
				"BridgeFacet: Cooldown hasn't reached",
			)
		})

		it("Should fail when any transaction is already withdrawn", async function () {
			await time.increase(43250) // 12h cooldown
			await context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(1)

			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValues([1, 2])).to.be.revertedWith(
				"BridgeFacet: Already withdrawn",
			)
		})

		it("Should withdraw multiple transactions successfully", async function () {
			await time.increase(43250) // 12h cooldown
			const transactionIds = [1, 3]

			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValues(transactionIds)).to.not.reverted

			for (const id of transactionIds) {
				const transaction = await context.viewFacet.getBridgeTransaction(id)
				expect(transaction.status).to.equal(BridgeTransactionStatus.WITHDRAWN)
			}
		})
	})

	describe("Bridge Transaction Cancellation", async function () {
		beforeEach(async function () {
			// Create multiple bridge transactions for testing
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(200n), await bridge2.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(150n), await bridge.getAddress())
		})

		describe("requestToCancelBridgeTransaction", async function () {
			it("Should fail with invalid transaction ID", async function () {
				await expect(context.bridgeFacet.connect(context.signers.user).requestToCancelBridgeTransaction(999)).to.be.revertedWith(
					"BridgeFacet: Sender is not the transaction's user",
				)
			})

			it("Should fail when sender is not the transaction's user", async function () {
				await expect(context.bridgeFacet.connect(context.signers.user2).requestToCancelBridgeTransaction(1)).to.be.revertedWith(
					"BridgeFacet: Sender is not the transaction's user",
				)
			})

			it("Should fail when transaction status is not RECEIVED", async function () {
				// Suspend a transaction first
				await context.bridgeFacet.connect(context.signers.admin).suspendBridgeTransaction(1)
				await expect(context.bridgeFacet.connect(context.signers.user).requestToCancelBridgeTransaction(1)).to.be.revertedWith(
					"BridgeFacet: Invalid status",
				)
			})

			it("Should fail when accounting is paused", async function () {
				await pauseAccounting(context)
				await expect(context.bridgeFacet.connect(context.signers.user).requestToCancelBridgeTransaction(1)).to.be.revertedWith(
					"Pausable: Accounting paused",
				)
			})

			it("Should fail when user is suspended", async function () {
				await suspendAddress(context, await context.signers.user.getAddress())
				await expect(context.bridgeFacet.connect(context.signers.user).requestToCancelBridgeTransaction(1)).to.be.revertedWith(
					"Accessibility: Sender is Suspended",
				)
			})

			it("Should request cancellation successfully", async function () {
				await expect(context.bridgeFacet.connect(context.signers.user).requestToCancelBridgeTransaction(1)).to.not.reverted

				const transaction = await context.viewFacet.getBridgeTransaction(1)
				expect(transaction.status).to.equal(BridgeTransactionStatus.CANCEL_REQUESTED)
			})
		})

		describe("acceptCancelBridgeTransaction", async function () {
			beforeEach(async function () {
				// Request cancellation first
				await context.bridgeFacet.connect(context.signers.user).requestToCancelBridgeTransaction(1)
			})

			it("Should fail with invalid transaction ID", async function () {
				await expect(context.bridgeFacet.connect(context.signers.bridge).acceptCancelBridgeTransaction(999)).to.be.revertedWith(
					"BridgeFacet: Sender is not the transaction's bridge",
				)
			})

			it("Should fail when sender is not the transaction's bridge", async function () {
				await expect(context.bridgeFacet.connect(context.signers.bridge2).acceptCancelBridgeTransaction(1)).to.be.revertedWith(
					"BridgeFacet: Sender is not the transaction's bridge",
				)
			})

			it("Should fail when transaction status is not CANCEL_REQUESTED", async function () {
				await expect(context.bridgeFacet.connect(context.signers.bridge2).acceptCancelBridgeTransaction(2)).to.be.revertedWith(
					"BridgeFacet: Invalid status",
				)
			})

			it("Should fail when accounting is paused", async function () {
				await pauseAccounting(context)
				await expect(context.bridgeFacet.connect(context.signers.bridge).acceptCancelBridgeTransaction(1)).to.be.revertedWith(
					"Pausable: Accounting paused",
				)
			})

			it("Should fail when bridge is suspended", async function () {
				await suspendAddress(context, await bridge.getAddress())
				await expect(context.bridgeFacet.connect(context.signers.bridge).acceptCancelBridgeTransaction(1)).to.be.revertedWith(
					"Accessibility: Sender is Suspended",
				)
			})

			it("Should accept cancellation successfully", async function () {
				const userBalanceBefore = await context.viewFacet.balanceOf(await context.signers.user.getAddress())

				await expect(context.bridgeFacet.connect(context.signers.bridge).acceptCancelBridgeTransaction(1)).to.not.reverted

				const transaction = await context.viewFacet.getBridgeTransaction(1)
				expect(transaction.status).to.equal(BridgeTransactionStatus.CANCELED)

				// User should get refund
				const userBalanceAfter = await context.viewFacet.balanceOf(await context.signers.user.getAddress())
				expect(userBalanceAfter).to.be.gt(userBalanceBefore)
			})
		})

		describe("rejectCancelBridgeTransaction", async function () {
			beforeEach(async function () {
				// Request cancellation first
				await context.bridgeFacet.connect(context.signers.user).requestToCancelBridgeTransaction(1)
			})

			it("Should fail with invalid transaction ID", async function () {
				await expect(context.bridgeFacet.connect(context.signers.bridge).rejectCancelBridgeTransaction(999)).to.be.revertedWith(
					"BridgeFacet: Sender is not the transaction's bridge",
				)
			})

			it("Should fail when sender is not the transaction's bridge", async function () {
				await expect(context.bridgeFacet.connect(context.signers.bridge2).rejectCancelBridgeTransaction(1)).to.be.revertedWith(
					"BridgeFacet: Sender is not the transaction's bridge",
				)
			})

			it("Should fail when transaction status is not CANCEL_REQUESTED", async function () {
				await expect(context.bridgeFacet.connect(context.signers.bridge2).rejectCancelBridgeTransaction(2)).to.be.revertedWith(
					"BridgeFacet: Invalid status",
				)
			})

			it("Should fail when accounting is paused", async function () {
				await pauseAccounting(context)
				await expect(context.bridgeFacet.connect(context.signers.bridge).rejectCancelBridgeTransaction(1)).to.be.revertedWith(
					"Pausable: Accounting paused",
				)
			})

			it("Should fail when bridge is suspended", async function () {
				await suspendAddress(context, await bridge.getAddress())
				await expect(context.bridgeFacet.connect(context.signers.bridge).rejectCancelBridgeTransaction(1)).to.be.revertedWith(
					"Accessibility: Sender is Suspended",
				)
			})

			it("Should reject cancellation successfully", async function () {
				const userBalanceBefore = await context.viewFacet.balanceOf(await context.signers.user.getAddress())

				await expect(context.bridgeFacet.connect(context.signers.bridge).rejectCancelBridgeTransaction(1)).to.not.reverted

				const transaction = await context.viewFacet.getBridgeTransaction(1)
				expect(transaction.status).to.equal(BridgeTransactionStatus.RECEIVED)

				// User should not get refund on rejection
				const userBalanceAfter = await context.viewFacet.balanceOf(await context.signers.user.getAddress())
				expect(userBalanceAfter).to.equal(userBalanceBefore)
			})
		})
	})

	describe("Virtual Bridge Functionality", async function () {
		let mockVirtualBridge: MockVirtualBridge
		beforeEach(async function () {
			const MockVirtualBridge = await ethers.getContractFactory("MockVirtualBridge")
			mockVirtualBridge = await MockVirtualBridge.deploy()
			await context.controlFacet.addVirtualBridge(await mockVirtualBridge.getAddress())
		})

		describe("transferToVirtualBridge", async function () {
			it("Should fail when bridge is not registered as virtual", async function () {
				await expect(
					context.bridgeFacet
						.connect(context.signers.user)
						.transferToVirtualBridge(decimal(100n), await context.signers.bridge.getAddress(), "0x"),
				).to.be.revertedWith("BridgeFacet: Invalid bridge")
			})

			it("Should transfer to virtual bridge successfully and call the callback", async function () {
				const nextId = await context.viewFacet.getNextBridgeTransactionId()
				const userBalanceBefore = await context.viewFacet.balanceOf(await context.signers.user.getAddress())

				const data = "0x1234"
				await expect(
					context.bridgeFacet
						.connect(context.signers.user)
						.transferToVirtualBridge(decimal(100n), await mockVirtualBridge.getAddress(), data),
				).to.not.reverted

				const createdTx = await context.viewFacet.getBridgeTransaction(nextId + 1n)
				expect(createdTx.bridge).to.equal(await mockVirtualBridge.getAddress())
				expect(createdTx.amount).to.equal(decimal(100n))
				expect(createdTx.status).to.equal(BridgeTransactionStatus.RECEIVED)

				const userBalanceAfter = await context.viewFacet.balanceOf(await context.signers.user.getAddress())
				expect(userBalanceAfter).to.equal(userBalanceBefore - decimal(100n))

				// Verify callback parameters via mock
				const [cbUser, cbAmount, cbCollateral, cbData, cbCount] = await mockVirtualBridge.getLastTransferCall()
				expect(cbUser).to.equal(await context.signers.user.getAddress())
				expect(cbAmount).to.equal(decimal(100n))
				expect(cbCollateral).to.equal(await context.viewFacet.getCollateral())
				expect(cbData).to.equal(data)
				expect(cbCount).to.equal(1n)
			})
		})

		describe("completeVirtualBridge", async function () {
			beforeEach(async function () {
				// Create a virtual bridge transaction
				await context.bridgeFacet
					.connect(context.signers.user)
					.transferToVirtualBridge(decimal(100n), await mockVirtualBridge.getAddress(), "0x")
			})

			it("Should fail with invalid transaction ID", async function () {
				await time.increase(43250) // cooldown
				await expect(context.bridgeFacet.connect(context.signers.hedger).withdrawReceivedBridgeValue(999)).to.be.revertedWith(
					"BridgeFacet: Invalid transactionId",
				)
			})

			it("Should fail when cooldown period hasn't elapsed", async function () {
				await expect(context.bridgeFacet.connect(context.signers.user).withdrawReceivedBridgeValue(1)).to.be.revertedWith(
					"BridgeFacet: Cooldown hasn't reached",
				)
			})

			it("Should fail when accounting is paused", async function () {
				await time.increase(43250) // cooldown
				await pauseAccounting(context)
				await expect(context.bridgeFacet.connect(context.signers.user).withdrawReceivedBridgeValue(1)).to.be.revertedWith("Pausable: Accounting paused")
			})

			it("Should complete virtual bridge successfully and call the callback", async function () {
				await time.increase(43250) // cooldown
				await expect(context.bridgeFacet.connect(context.signers.user).withdrawReceivedBridgeValue(1)).to.not.reverted

				const transaction = await context.viewFacet.getBridgeTransaction(1)
				expect(transaction.status).to.equal(BridgeTransactionStatus.WITHDRAWN)

				const [cbUser, cbAmount, cbCollateral, cbData, cbCount] = await mockVirtualBridge.getLastCompleteCall()
				expect(cbUser).to.equal(await context.signers.user.getAddress())
				expect(cbAmount).to.equal(decimal(100n))
				expect(cbCollateral).to.equal(await context.viewFacet.getCollateral())
				expect(cbData).to.equal("0x")
				expect(cbCount).to.equal(1n)
			})
		})
	})
}
