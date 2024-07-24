import {expect} from "chai"
import {ethers, upgrades} from "hardhat"
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers"
import {FeeCollector, MockSymmio, MockToken} from "../src/types"

describe("FeeCollector", function () {
	let feeCollector: FeeCollector
	let mockSymmio: MockSymmio
	let mockToken: MockToken
	let owner: SignerWithAddress
	let admin: SignerWithAddress
	let collector: SignerWithAddress
	let setter: SignerWithAddress
	let manager: SignerWithAddress
	let pauser: SignerWithAddress
	let unpauser: SignerWithAddress
	let symmioReceiver: SignerWithAddress
	let stakeholder1: SignerWithAddress
	let stakeholder2: SignerWithAddress

	const symmioShare = ethers.parseEther("0.5") // 50%

	beforeEach(async function () {
		[owner, admin, collector, setter, manager, pauser, unpauser, symmioReceiver, stakeholder1, stakeholder2] = await ethers.getSigners()

		// Deploy mock Symmio contract
		const MockSymmio = await ethers.getContractFactory("MockSymmio")
		mockSymmio = await MockSymmio.deploy() as any

		// Deploy mock ERC20 token
		const MockToken = await ethers.getContractFactory("MockToken")
		mockToken = await MockToken.deploy("Mock Token", "MTK") as any

		// Set mock token as collateral in mock Symmio
		await mockSymmio.setCollateral(await mockToken.getAddress())

		// Deploy FeeCollector
		const FeeCollector = await ethers.getContractFactory("FeeCollector")
		feeCollector = await upgrades.deployProxy(FeeCollector, [
			admin.address,
			await mockSymmio.getAddress(),
			symmioReceiver.address,
			symmioShare
		]) as any

		// Grant roles
		await feeCollector.connect(admin).grantRole(await feeCollector.COLLECTOR_ROLE(), collector.address)
		await feeCollector.connect(admin).grantRole(await feeCollector.SETTER_ROLE(), setter.address)
		await feeCollector.connect(admin).grantRole(await feeCollector.MANAGER_ROLE(), manager.address)
		await feeCollector.connect(admin).grantRole(await feeCollector.PAUSER_ROLE(), pauser.address)
		await feeCollector.connect(admin).grantRole(await feeCollector.UNPAUSER_ROLE(), unpauser.address)
	})

	describe("Initialization", function () {
		it("Should set the correct initial values", async function () {
			expect(await feeCollector.symmioAddress()).to.equal(await mockSymmio.getAddress())
			expect(await feeCollector.symmioReceiver()).to.equal(symmioReceiver.address)
			expect(await feeCollector.symmioShare()).to.equal(symmioShare)
		})
	})

	describe("setSymmioAddress", function () {
		it("Should allow setter to change Symmio address", async function () {
			const newSymmioAddress = ethers.Wallet.createRandom().address
			await feeCollector.connect(setter).setSymmioAddress(newSymmioAddress)
			expect(await feeCollector.symmioAddress()).to.equal(newSymmioAddress)
		})

		it("Should revert if called by non-setter", async function () {
			await expect(feeCollector.connect(owner).setSymmioAddress(ethers.ZeroAddress))
				.to.be.reverted
		})

		it("Should revert if new address is zero", async function () {
			await expect(feeCollector.connect(setter).setSymmioAddress(ethers.ZeroAddress))
				.to.be.revertedWith("FeeCollector: Zero address")
		})
	})

	describe("setSymmioStakeholder", function () {
		it("Should allow setter to change Symmio receiver and share", async function () {
			const newReceiver = ethers.Wallet.createRandom().address
			const newShare = ethers.parseEther("0.6")
			await feeCollector.connect(setter).setSymmioStakeholder(newReceiver, newShare)
			expect(await feeCollector.symmioReceiver()).to.equal(newReceiver)
			expect(await feeCollector.symmioShare()).to.equal(newShare)
		})

		it("Should revert if called by non-setter", async function () {
			await expect(feeCollector.connect(owner).setSymmioStakeholder(ethers.ZeroAddress, 0))
				.to.be.reverted
		})

		it("Should revert if new receiver is zero address", async function () {
			await expect(feeCollector.connect(setter).setSymmioStakeholder(ethers.ZeroAddress, symmioShare))
				.to.be.revertedWith("FeeCollector: Zero address")
		})

		it("Should revert if new share is greater than 100%", async function () {
			await expect(feeCollector.connect(setter).setSymmioStakeholder(symmioReceiver.address, ethers.parseEther("1.1")))
				.to.be.revertedWith("FeeCollector: Invalid share")
		})

		it("Should update stakeholders array", async function () {
			const newReceiver = ethers.Wallet.createRandom().address
			const newShare = ethers.parseEther("0.6")
			await feeCollector.connect(setter).setSymmioStakeholder(newReceiver, newShare)
			const updatedStakeholder = await feeCollector.stakeholders(0)
			expect(updatedStakeholder.receiver).to.equal(newReceiver)
			expect(updatedStakeholder.share).to.equal(newShare)
		})

		it("Should emit SymmioStakeholderUpdated event", async function () {
			const newReceiver = ethers.Wallet.createRandom().address
			const newShare = ethers.parseEther("0.6")
			await expect(feeCollector.connect(setter).setSymmioStakeholder(newReceiver, newShare))
				.to.emit(feeCollector, "SymmioStakeholderUpdated")
				.withArgs(symmioReceiver.address, newReceiver, symmioShare, newShare)
		})
	})

	describe("setStakeholders", function () {
		it("Should allow manager to set stakeholders", async function () {
			const newStakeholders = [
				{receiver: stakeholder1.address, share: ethers.parseEther("0.3")},
				{receiver: stakeholder2.address, share: ethers.parseEther("0.2")}
			]
			await feeCollector.connect(manager).setStakeholders(newStakeholders)

			expect((await feeCollector.stakeholders(1)).receiver).to.equal(stakeholder1.address)
			expect((await feeCollector.stakeholders(1)).share).to.equal(ethers.parseEther("0.3"))
			expect((await feeCollector.stakeholders(2)).receiver).to.equal(stakeholder2.address)
			expect((await feeCollector.stakeholders(2)).share).to.equal(ethers.parseEther("0.2"))
		})

		it("Should revert if called by non-manager", async function () {
			await expect(feeCollector.connect(owner).setStakeholders([]))
				.to.be.reverted
		})

		it("Should revert if total shares don't equal 100%", async function () {
			const invalidStakeholders = [
				{receiver: stakeholder1.address, share: ethers.parseEther("0.6")}
			]
			await expect(feeCollector.connect(manager).setStakeholders(invalidStakeholders))
				.to.be.revertedWith("FeeCollector: Total shares must equal 1")
		})
	})

	describe("claimFee", function () {
		beforeEach(async function () {
			// Set up stakeholders
			await feeCollector.connect(manager).setStakeholders([
				{receiver: stakeholder1.address, share: ethers.parseEther("0.3")},
				{receiver: stakeholder2.address, share: ethers.parseEther("0.2")}
			])

			// Fund mock Symmio with tokens
			let amount = ethers.parseEther("1000")
			await mockToken.connect(owner).approve(await mockSymmio.getAddress(), amount)
			await mockSymmio.connect(owner).depositFor(amount, await feeCollector.getAddress())
		})

		it("Should distribute fees correctly", async function () {
			const claimAmount = ethers.parseEther("100")

			await feeCollector.connect(collector).claimFee(claimAmount)

			expect(await mockToken.balanceOf(symmioReceiver.address)).to.equal(ethers.parseEther("50"))
			expect(await mockToken.balanceOf(stakeholder1.address)).to.equal(ethers.parseEther("30"))
			expect(await mockToken.balanceOf(stakeholder2.address)).to.equal(ethers.parseEther("20"))
		})

		it("Should revert if called by non-collector", async function () {
			await expect(feeCollector.connect(owner).claimFee(100))
				.to.be.reverted
		})

		it("Should revert when paused", async function () {
			await feeCollector.connect(pauser).pause()
			await expect(feeCollector.connect(collector).claimFee(100))
				.to.be.revertedWith("Pausable: paused")
		})
	})

	describe("Pause and Unpause", function () {
		it("Should allow pauser to pause", async function () {
			await feeCollector.connect(pauser).pause()
			expect(await feeCollector.paused()).to.be.true
		})

		it("Should allow unpauser to unpause", async function () {
			await feeCollector.connect(pauser).pause()
			await feeCollector.connect(unpauser).unpause()
			expect(await feeCollector.paused()).to.be.false
		})

		it("Should revert if non-pauser tries to pause", async function () {
			await expect(feeCollector.connect(owner).pause())
				.to.be.reverted
		})

		it("Should revert if non-unpauser tries to unpause", async function () {
			await feeCollector.connect(pauser).pause()
			await expect(feeCollector.connect(owner).unpause())
				.to.be.reverted
		})
	})
})