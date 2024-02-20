import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { initializeFixture } from "./Initialize.fixture"
import { expect } from "chai"
import { BigNumber } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { TransferToBridgeValidator } from "./models/validators/TransferToBridgeValidator"
import { decimal } from "./utils/Common"
import { WithdrawLockedTransactionValidator } from "./models/validators/WithdrawLockedTransactionValidator"

export function shouldBehaveLikeBridgeFacet(): void {
	let context: RunContext, user: User
	let bridge: SignerWithAddress, bridge2: SignerWithAddress

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		bridge = context.signers.bridge // whitelisted
		bridge2 = context.signers.bridge2 // not whitelist
		user = new User(context, context.signers.user)
		await user.setup()
		await user.setBalances(decimal(500), decimal(500), decimal(100))

		await context.controlFacet.addBridge(await bridge.getAddress())
	})

	it("Should fail when bridge status is wrong", async function () {
		await expect(context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100), await bridge2.getAddress())).to.be.revertedWith(
			"BridgeFacet: Invalid bridge",
		)
	})

	it("Should fail when amount is more than user balance", async function () {
		await expect(context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(700), await bridge.getAddress())).to.be.reverted
	})

	it("Should fail when bridge and user are same", async function () {
		await expect(context.bridgeFacet.connect(context.signers.bridge).transferToBridge(decimal(100), await bridge.getAddress())).to.be.revertedWith(
			"BridgeFacet: Bridge and user can't be the same",
		)
	})

	it("Should transfer to bridge successfully", async function () {
		const id = await context.viewFacet.getNextBridgeTransactionId()

		const validator = new TransferToBridgeValidator()
		const beforeOut = await validator.before(context, {
			user: user,
			transactionId: id.add(1),
			bridge: await bridge.getAddress(),
		})
		await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100), await bridge.getAddress())

		await validator.after(context, {
			user: user,
			amount: decimal(100),
			transactionId: id.add(1),
			beforeOutput: beforeOut,
		})
	})

	describe("withdraw locked amount", () => {
		beforeEach(async function () {
			await context.controlFacet.addBridge(await bridge2.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100), await bridge.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100), await bridge2.getAddress())
			await context.bridgeFacet.connect(context.signers.user).transferToBridge(decimal(100), await bridge.getAddress())
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

		it("Should withdraw successfully", async function () {
			await time.increase(43250) //12h
			const validator = new WithdrawLockedTransactionValidator()
			const beforeOut = await validator.before(context, {
				transactionId: BigNumber.from(3),
				bridge: await bridge.getAddress(),
			})

			await context.bridgeFacet.connect(context.signers.bridge).withdrawReceivedBridgeValue(3)

			await validator.after(context, {
				transactionId: BigNumber.from(3),
				beforeOutput: beforeOut,
			})
		})
	})
}
