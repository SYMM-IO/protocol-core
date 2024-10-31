import {expect} from "chai"
import {ethers, upgrades} from "hardhat"
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers"
import {MockSymmio, MockToken, SymmioFeeDistributor} from "../src/types"

export function shouldBehaveLikeFeeDistributor() {
	describe("FeeDistributor", function () {
		let feeDistributor: SymmioFeeDistributor
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
			mockSymmio = await MockSymmio.deploy()

			// Deploy mock ERC20 token
			const MockToken = await ethers.getContractFactory("MockToken")
			mockToken = await MockToken.deploy("Mock Token", "MTK")

			// Set mock token as collateral in mock Symmio
			await mockSymmio.setCollateral(await mockToken.getAddress())

			// Deploy FeeCollector
			const FeeCollector = await ethers.getContractFactory("SymmioFeeDistributor")
			feeDistributor = await upgrades.deployProxy(FeeCollector, [
				admin.address,
				await mockSymmio.getAddress(),
				symmioReceiver.address,
				symmioShare
			]) as any

			// Grant roles
			await feeDistributor.connect(admin).grantRole(await feeDistributor.COLLECTOR_ROLE(), collector.address)
			await feeDistributor.connect(admin).grantRole(await feeDistributor.SETTER_ROLE(), setter.address)
			await feeDistributor.connect(admin).grantRole(await feeDistributor.MANAGER_ROLE(), manager.address)
			await feeDistributor.connect(admin).grantRole(await feeDistributor.PAUSER_ROLE(), pauser.address)
			await feeDistributor.connect(admin).grantRole(await feeDistributor.UNPAUSER_ROLE(), unpauser.address)
		})

		describe("Initialization", function () {
			it("Should set the correct initial values", async function () {
				expect(await feeDistributor.symmioAddress()).to.equal(await mockSymmio.getAddress())
				expect(await feeDistributor.symmioReceiver()).to.equal(symmioReceiver.address)
				expect(await feeDistributor.symmioShare()).to.equal(symmioShare)
			})
		})

		describe("setSymmioAddress", function () {
			it("Should allow setter to change Symmio address", async function () {
				const newSymmioAddress = ethers.Wallet.createRandom().address
				await feeDistributor.connect(setter).setSymmioAddress(newSymmioAddress)
				expect(await feeDistributor.symmioAddress()).to.equal(newSymmioAddress)
			})

			it("Should revert if called by non-setter", async function () {
				await expect(feeDistributor.connect(owner).setSymmioAddress(ethers.ZeroAddress))
					.to.be.reverted
			})

			it("Should revert if new address is zero", async function () {
				await expect(feeDistributor.connect(setter).setSymmioAddress(ethers.ZeroAddress))
					.to.be.revertedWithCustomError(feeDistributor, "ZeroAddress")
			})
		})

		describe("setSymmioStakeholder", function () {
			it("Should allow setter to change Symmio receiver and share", async function () {
				const newReceiver = ethers.Wallet.createRandom().address
				const newShare = ethers.parseEther("0.6")
				await feeDistributor.connect(setter).setSymmioStakeholder(newReceiver, newShare)
				expect(await feeDistributor.symmioReceiver()).to.equal(newReceiver)
				expect(await feeDistributor.symmioShare()).to.equal(newShare)
			})

			it("Should revert if called by non-setter", async function () {
				await expect(feeDistributor.connect(owner).setSymmioStakeholder(ethers.ZeroAddress, 0))
					.to.be.reverted
			})

			it("Should revert if new receiver is zero address", async function () {
				await expect(feeDistributor.connect(setter).setSymmioStakeholder(ethers.ZeroAddress, symmioShare))
					.to.be.revertedWithCustomError(feeDistributor, "ZeroAddress")
			})

			it("Should revert if new share is greater than 100%", async function () {
				await expect(feeDistributor.connect(setter).setSymmioStakeholder(symmioReceiver.address, ethers.parseEther("1.1")))
					.to.be.revertedWithCustomError(feeDistributor, "InvalidShare")
			})

			it("Should update stakeholders array", async function () {
				const newReceiver = ethers.Wallet.createRandom().address
				const newShare = ethers.parseEther("0.6")
				await feeDistributor.connect(setter).setSymmioStakeholder(newReceiver, newShare)
				const updatedStakeholder = await feeDistributor.stakeholders(0)
				expect(updatedStakeholder.receiver).to.equal(newReceiver)
				expect(updatedStakeholder.share).to.equal(newShare)
			})

			it("Should emit SymmioStakeholderUpdated event", async function () {
				const newReceiver = ethers.Wallet.createRandom().address
				const newShare = ethers.parseEther("0.6")
				await expect(feeDistributor.connect(setter).setSymmioStakeholder(newReceiver, newShare))
					.to.emit(feeDistributor, "SymmioStakeholderUpdated")
					.withArgs(symmioReceiver.address, newReceiver, symmioShare, newShare)
			})
		})

		describe("setStakeholders", function () {
			it("Should allow manager to set stakeholders", async function () {
				let newStakeholders = [
					{receiver: stakeholder1.address, share: ethers.parseEther("0.3")},
					{receiver: stakeholder2.address, share: ethers.parseEther("0.1")},
					{receiver: stakeholder2.address, share: ethers.parseEther("0.1")}
				]
				await feeDistributor.connect(manager).setStakeholders(newStakeholders)

				expect((await feeDistributor.stakeholders(1)).receiver).to.equal(stakeholder1.address)
				expect((await feeDistributor.stakeholders(1)).share).to.equal(ethers.parseEther("0.3"))
				expect((await feeDistributor.stakeholders(2)).receiver).to.equal(stakeholder2.address)
				expect((await feeDistributor.stakeholders(2)).share).to.equal(ethers.parseEther("0.1"))
				expect((await feeDistributor.stakeholders(3)).receiver).to.equal(stakeholder2.address)
				expect((await feeDistributor.stakeholders(3)).share).to.equal(ethers.parseEther("0.1"))

				newStakeholders = [
					{receiver: stakeholder1.address, share: ethers.parseEther("0.1")},
					{receiver: stakeholder2.address, share: ethers.parseEther("0.4")}
				]
				await feeDistributor.connect(manager).setStakeholders(newStakeholders)
				expect((await feeDistributor.stakeholders(1)).receiver).to.equal(stakeholder1.address)
				expect((await feeDistributor.stakeholders(1)).share).to.equal(ethers.parseEther("0.1"))
				expect((await feeDistributor.stakeholders(2)).receiver).to.equal(stakeholder2.address)
				expect((await feeDistributor.stakeholders(2)).share).to.equal(ethers.parseEther("0.4"))
				await expect(feeDistributor.stakeholders(3)).to.be.reverted
			})

			it("Should revert if called by non-manager", async function () {
				await expect(feeDistributor.connect(owner).setStakeholders([]))
					.to.be.reverted
			})

			it("Should revert if total shares don't equal 100%", async function () {
				const invalidStakeholders = [
					{receiver: stakeholder1.address, share: ethers.parseEther("0.6")}
				]
				await expect(feeDistributor.connect(manager).setStakeholders(invalidStakeholders))
					.to.be.revertedWithCustomError(feeDistributor, "TotalSharesMustEqualOne")
			})
		})

		describe("claimFee", function () {
			beforeEach(async function () {
				// Set up stakeholders
				await feeDistributor.connect(manager).setStakeholders([
					{receiver: stakeholder1.address, share: ethers.parseEther("0.3")},
					{receiver: stakeholder2.address, share: ethers.parseEther("0.2")}
				])

				// Fund mock Symmio with tokens
				let amount = ethers.parseEther("1000")
				await mockToken.connect(owner).approve(await mockSymmio.getAddress(), amount)
				await mockSymmio.connect(owner).depositFor(amount, await feeDistributor.getAddress())
			})

			it("Should distribute fees correctly", async function () {
				const claimAmount = ethers.parseEther("100")

				await feeDistributor.connect(collector).claimFee(claimAmount)

				expect(await mockToken.balanceOf(symmioReceiver.address)).to.equal(ethers.parseEther("50"))
				expect(await mockToken.balanceOf(stakeholder1.address)).to.equal(ethers.parseEther("30"))
				expect(await mockToken.balanceOf(stakeholder2.address)).to.equal(ethers.parseEther("20"))
			})

			it("Should distribute fees correctly in claimAll", async function () {
				await feeDistributor.connect(collector).claimAllFee()

				expect(await mockToken.balanceOf(symmioReceiver.address)).to.equal(ethers.parseEther("500"))
				expect(await mockToken.balanceOf(stakeholder1.address)).to.equal(ethers.parseEther("300"))
				expect(await mockToken.balanceOf(stakeholder2.address)).to.equal(ethers.parseEther("200"))
			})

			it("Should check dryClaimAll", async function () {
				let data = await feeDistributor.connect(collector).dryClaimAllFee()

				expect(data[1][0]).to.equal(ethers.parseEther("500"))
				expect(data[1][1]).to.equal(ethers.parseEther("300"))
				expect(data[1][2]).to.equal(ethers.parseEther("200"))
			})

			it("Should revert if called by non-collector", async function () {
				await expect(feeDistributor.connect(owner).claimFee(100))
					.to.be.reverted
			})

			it("Should revert when paused", async function () {
				await feeDistributor.connect(pauser).pause()
				await expect(feeDistributor.connect(collector).claimFee(100))
					.to.be.revertedWith("Pausable: paused")
			})
		})

		describe("Pause and Unpause", function () {
			it("Should allow pauser to pause", async function () {
				await feeDistributor.connect(pauser).pause()
				expect(await feeDistributor.paused()).to.be.true
			})

			it("Should allow unpauser to unpause", async function () {
				await feeDistributor.connect(pauser).pause()
				await feeDistributor.connect(unpauser).unpause()
				expect(await feeDistributor.paused()).to.be.false
			})

			it("Should revert if non-pauser tries to pause", async function () {
				await expect(feeDistributor.connect(owner).pause())
					.to.be.reverted
			})

			it("Should revert if non-unpauser tries to unpause", async function () {
				await feeDistributor.connect(pauser).pause()
				await expect(feeDistributor.connect(owner).unpause())
					.to.be.reverted
			})
		})
	})
}