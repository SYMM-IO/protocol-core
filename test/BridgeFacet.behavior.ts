import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers"
import {RunContext} from "./models/RunContext"
import {User} from "./models/User"
import {initializeFixture} from "./Initialize.fixture"
import {expect} from "chai"
import {TransferToBridgeValidator} from "./models/validators/TransferToBridgeValidator"
import {decimal} from "./utils/Common"
import {WithdrawLockedTransactionValidator} from "./models/validators/WithdrawLockedTransactionValidator"
import {BridgeTransactionStatus} from "./models/Enums"
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers"

export function shouldBehaveLikeBridgeFacet(): void {
	let context: RunContext, user: User
	let bridge: SignerWithAddress, bridge2: SignerWithAddress

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		bridge = context.signers.bridge // whitelisted
		bridge2 = context.signers.bridge2 // not whitelist
		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(5000n), decimal(5000n), decimal(1000n))

		await context.controlFacet.addBridge(await bridge.getAddress())
	})

	it("Should fail when bridge status is wrong", async function () {
		await expect(context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge2.getAddress())).to.be.revertedWith(
			"BridgeFacet: Invalid bridge",
		)
	})

	it("Should fail when amount is more than user balance", async function () {
		await expect(context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(7000n), await bridge.getAddress())).to.be.reverted
	})

	it("Should fail when bridge and user are same", async function () {
		await expect(context.bridgeFacet.connect(context.signers.bridge).transferToBridge(decimal(100n), await bridge.getAddress())).to.be.revertedWith(
			"BridgeFacet: Bridge and user can't be the same",
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
		await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())

		await validator.after(context, {
			user: user,
			amount: decimal(100n),
			transactionId: id + 1n,
			beforeOutput: beforeOut,
		})
	})

	describe("suspend bridge request", () => {
		beforeEach(async function () {
			await context.controlFacet.addBridge(await bridge2.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge2.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())
		})

		it('should suspend successfully', async () => {
			await expect(context.bridgeFacet.connect(context.signers.admin).suspendBridgeTransaction(10))
				.to.be.revertedWith("BridgeFacet: Invalid transactionId")
			await context.bridgeFacet.connect(context.signers.admin).suspendBridgeTransaction(1)
			expect((await context.viewFacet.getBridgeTransaction(1)).status).to.be.eq(BridgeTransactionStatus.SUSPENDED)
			await time.increase(43250) //12h
			await context.bridgeFacet.connect(context.signers.bridge2).withdrawReceivedBridgeValue(2)
			await expect(context.bridgeFacet.connect(context.signers.admin).suspendBridgeTransaction(2))
				.to.be.revertedWith("BridgeFacet: Invalid status")
		})

		it('should restore successfully', async () => {
			let tx = await context.viewFacet.getBridgeTransaction(1)

			await expect(context.bridgeFacet.connect(context.signers.admin).restoreBridgeTransaction(2, tx.amount))
				.to.be.revertedWith("BridgeFacet: Invalid status")

			await context.bridgeFacet.connect(context.signers.admin).suspendBridgeTransaction(1)

			await expect(context.bridgeFacet.connect(context.signers.admin).restoreBridgeTransaction(1, tx.amount + 1n))
				.to.be.revertedWith("BridgeFacet: High valid amount")

			await context.bridgeFacet.connect(context.signers.admin).restoreBridgeTransaction(1, tx.amount / 2n)
			expect((await context.viewFacet.getBridgeTransaction(1)).status).to.be.eq(BridgeTransactionStatus.RECEIVED)
			expect((await context.viewFacet.getBridgeTransaction(1)).amount).to.be.eq(tx.amount / 2n)
		})
	})

	describe("withdraw locked amount", () => {
		beforeEach(async function () {
			await context.controlFacet.addBridge(await bridge2.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge2.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100n), await bridge.getAddress())
		})

		it("Should fail when sender is not the transaction's bridge", async function () {
			await time.increase(43250) //12h
			await expect(context.bridgeFacet.connect(context.signers.bridge2).withdrawReceivedBridgeValue(1)).to.be.revertedWith(
				"BridgeFacet: Sender is not the transaction's bridge",
			)
		})

		it("Should fail when Cooldown hasn't reached", async function () {
			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(1)).to.be.revertedWith(
				"BridgeFacet: Cooldown hasn't reached",
			)
		})

		it("Should fail when bridgeTransaction status in not valid", async function () {
			await time.increase(43250) //12h
			await context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(1)
			await expect(context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(1)).to.be.revertedWith(
				"BridgeFacet: Already withdrawn",
			)
		})

		it("Should single withdraw successfully", async function () {
			await time.increase(43250) //12h
			const validator = new WithdrawLockedTransactionValidator()
			const beforeOut = await validator.before(context, {
				transactionId: BigInt(3),
				bridge: await bridge.getAddress(),
			})

			await context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(3)

			await validator.after(context, {
				transactionId: BigInt(3),
				beforeOutput: beforeOut,
			})
		})

		it("Should withdraw Received Bridge Values successfully", async function () {
			await context.controlFacet.addBridge(await bridge.getAddress())
			await time.increase(43250) //12h
			await context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValues([1, 3])

			expect((await context.viewFacet.getBridgeTransaction(1)).status).to.be.equal(BridgeTransactionStatus.WITHDRAWN)
			expect((await context.viewFacet.getBridgeTransaction(3)).status).to.equal(BridgeTransactionStatus.WITHDRAWN)

		})
	})
}
