import {loadFixture} from "@nomicfoundation/hardhat-network-helpers"
import {RunContext} from "./models/RunContext"
import {initializeFixture} from "./Initialize.fixture"
import {expect} from "chai"
import {keccak256} from "js-sha3"
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers"
import {ethers} from "hardhat"

const DISPUTE_ROLE = `0x${keccak256("DISPUTE_ROLE")}`
const PARTY_B_MANAGER_ROLE = `0x${keccak256("PARTY_B_MANAGER_ROLE")}`
const AFFILIATE_MANAGER_ROLE = `0x${keccak256("AFFILIATE_MANAGER_ROLE")}`
const SYMBOL_MANAGER_ROLE = `0x${keccak256("SYMBOL_MANAGER_ROLE")}`
const SETTER_ROLE = `0x${keccak256("SETTER_ROLE")}`
const SUSPENDER_ROLE = `0x${keccak256("SUSPENDER_ROLE")}`
const PAUSER_ROLE = `0x${keccak256("PAUSER_ROLE")}`
const UNPAUSER_ROLE = `0x${keccak256("UNPAUSER_ROLE")}`

export function shouldBehaveLikeControlFacet(): void {
	let context: RunContext
	let owner: SignerWithAddress
	let user2: SignerWithAddress
	let hedger: SignerWithAddress
	let hedger2: SignerWithAddress
	let hedger3: SignerWithAddress

	beforeEach(async function () {
		context = await loadFixture(initializeFixture)
		owner = context.signers.user
		user2 = context.signers.user2
		hedger = context.signers.hedger
		hedger2 = context.signers.hedger2
		hedger3 = context.signers.others[0]

		await context.controlFacet.transferOwnership(await owner.getAddress())
		await context.controlFacet.connect(owner).setAdmin(await owner.getAddress())
		await context.controlFacet.connect(owner).grantRole(await owner.getAddress(), PARTY_B_MANAGER_ROLE)
		await context.controlFacet.connect(owner).grantRole(await owner.getAddress(), SYMBOL_MANAGER_ROLE)
		await context.controlFacet.connect(owner).grantRole(await owner.getAddress(), SETTER_ROLE)
		await context.controlFacet.connect(owner).grantRole(await owner.getAddress(), PAUSER_ROLE)
		await context.controlFacet.connect(owner).grantRole(await owner.getAddress(), SUSPENDER_ROLE)
		await context.controlFacet.connect(owner).grantRole(await owner.getAddress(), UNPAUSER_ROLE)
		await context.controlFacet.connect(owner).grantRole(await owner.getAddress(), AFFILIATE_MANAGER_ROLE)
	})

	describe("transferOwnership", () => {
		it("Should transferOwnership successfully", async function () {
			await expect(context.controlFacet.connect(owner).transferOwnership(await user2.getAddress())).to.not.reverted
		})

		it("Should not transferOwnership to Address zero", async function () {
			await expect(context.controlFacet.connect(owner).transferOwnership(ethers.ZeroAddress)).to.be.revertedWith("ControlFacet: Zero address")
		})
	})

	describe("grantRole", () => {
		it("Should grantRole successfully", async function () {
			await expect(context.controlFacet.connect(owner).grantRole(await user2.getAddress(), DISPUTE_ROLE)).to.not.reverted
			expect(await context.viewFacet.hasRole(await user2.getAddress(), DISPUTE_ROLE)).to.be.equal(true)
		})

		it("Should not grantRole to Address zero", async function () {
			await expect(context.controlFacet.connect(owner).grantRole(ethers.ZeroAddress, DISPUTE_ROLE)).to.be.revertedWith(
				"ControlFacet: Zero address",
			)
		})
	})

	describe("revokeRole", () => {
		it("Should revokeRole successfully", async function () {
			await context.controlFacet.connect(owner).grantRole(await user2.getAddress(), DISPUTE_ROLE)
			await expect(context.controlFacet.connect(owner).revokeRole(await user2.getAddress(), DISPUTE_ROLE)).to.not.reverted
			expect(await context.viewFacet.hasRole(await user2.getAddress(), DISPUTE_ROLE)).to.be.equal(false)
		})
	})

	describe("registerPartyB", () => {
		it("Should registerPartyB successfully", async function () {
			await expect(context.controlFacet.connect(owner).registerPartyB(await hedger3.getAddress())).to.not.reverted
			expect(await context.viewFacet.isPartyB(await hedger3.getAddress())).to.be.equal(true)
		})

		it("Should not registerPartyB if partyB exist", async function () {
			await expect(context.controlFacet.connect(owner).registerPartyB(await hedger.getAddress())).to.revertedWith("ControlFacet: Address is already registered")
		})
	})

	describe("deregisterPartyB", () => {
		it("Should deregisterPartyB successfully", async function () {
			await expect(context.controlFacet.connect(owner).deregisterPartyB(await hedger.getAddress(), 0)).to.not.reverted
			expect(await context.viewFacet.isPartyB(await hedger.getAddress())).to.be.equal(false)
		})

		it("Should not deregisterPartyB if Collateral is zero address", async function () {
			await expect(context.controlFacet.connect(owner).deregisterPartyB(ethers.ZeroAddress, 0)).to.be.revertedWith("ControlFacet: Zero address")
		})

		it("Should not deregisterPartyB if address is not register", async function () {
			await expect(context.controlFacet.connect(owner).deregisterPartyB(await hedger3.getAddress(), 0)).to.be.revertedWith(
				"ControlFacet: Address is not registered",
			)
		})

		it("Should not deregisterPartyB if address is not register", async function () {
			await expect(context.controlFacet.connect(owner).deregisterPartyB(await hedger.getAddress(), 1)).to.be.revertedWith("ControlFacet: Invalid index")
		})
	})

	describe("setCollateral", () => {
		it("Should setCollateral successfully", async function () {
			await expect(context.controlFacet.connect(owner).setCollateral(await context.collateral.getAddress())).to.not.reverted
			expect(await context.viewFacet.getCollateral()).to.be.equal(await context.collateral.getAddress())
		})

		it("Should not setCollateral if Collateral is zero address", async function () {
			await expect(context.controlFacet.connect(owner).setCollateral(ethers.ZeroAddress)).to.be.revertedWith("ControlFacet: Zero address")
		})
	})

	describe("addSymbol", () => {
		it("Should addSymbol successfully", async function () {
			const windowTime = BigInt(28800)
			const period = BigInt(900)
			const baseUnit = BigInt(4000000000000000)
			const quoteUnit = BigInt(1000000000000000)
			const minQty = BigInt("100000000000000000000")
			const maxQty = BigInt("60000000000000000000")

			await expect(context.controlFacet.connect(owner).addSymbol("ETHUSDT", maxQty, baseUnit, quoteUnit, minQty, windowTime, period)).to.not.be.reverted
			expect((await context.viewFacet.getSymbol(2)).name).to.be.equal("ETHUSDT")
		})

		it("Should not addSymbol if windowTime be high", async function () {
			const windowTime = BigInt(800)
			const period = BigInt(900)
			const baseUnit = BigInt(4000000000000000)
			const quoteUnit = BigInt(1000000000000000)
			const minQty = BigInt("100000000000000000000")
			const maxQty = BigInt("60000000000000000000")

			await expect(context.controlFacet.connect(owner).addSymbol("ETHUSDT", maxQty, baseUnit, quoteUnit, minQty, windowTime, period)).to.be.revertedWith(
				"ControlFacet: High window time"
			)
		})

		it("Should not addSymbol if tradingFee be high", async function () {
			const windowTime = BigInt(28800)
			const period = BigInt(900)
			const baseUnit = BigInt(4000000000000000)
			const quoteUnit = BigInt("100000000000000000000")
			const minQty = BigInt("100000000000000000000")
			const maxQty = BigInt("60000000000000000000")

			await expect(context.controlFacet.connect(owner).addSymbol("ETHUSDT", maxQty, baseUnit, quoteUnit, minQty, windowTime, period)).to.be.revertedWith(
				"ControlFacet: High trading fee"
			)
		})

	})

	describe("setSymbolFundingState", () => {
		it("Should setSymbolFundingState successfully", async function () {
			await expect(context.controlFacet.connect(owner).setSymbolFundingState(1, 28900, 910)).to.not.reverted
			expect((await context.viewFacet.getSymbol(1)).fundingRateEpochDuration).to.be.equal(28900)
			expect((await context.viewFacet.getSymbol(1)).fundingRateWindowTime).to.be.equal(910)
		})

		it("Should not setSymbolFundingState if windowTime be high", async function () {
			await expect(context.controlFacet.connect(owner).setSymbolFundingState(1, 910, 28900)).to.revertedWith("ControlFacet: High window time")
		})

		it("Should not setSymbolFundingState if invalid symbol id", async function () {
			await expect(context.controlFacet.connect(owner).setSymbolFundingState(0, 910, 28900)).to.revertedWith("ControlFacet: Invalid id")
			await expect(context.controlFacet.connect(owner).setSymbolFundingState(3, 910, 28900)).to.revertedWith("ControlFacet: Invalid id")
		})
	})

	describe("setSymbolValidationState", () => {
		it("Should setSymbolValidationState successfully", async function () {
			await expect(context.controlFacet.connect(owner).setSymbolValidationState(1, false)).to.not.reverted
			expect((await context.viewFacet.getSymbol(1)).isValid).to.be.equal(false)
			await expect(context.controlFacet.connect(owner).setSymbolValidationState(1, true)).to.not.reverted
			expect((await context.viewFacet.getSymbol(1)).isValid).to.be.equal(true)
		})

		it("Should not setSymbolFundingState if invalid symbol id", async function () {
			await expect(context.controlFacet.connect(owner).setSymbolValidationState(0, false)).to.revertedWith("ControlFacet: Invalid id")
			await expect(context.controlFacet.connect(owner).setSymbolValidationState(3, false)).to.revertedWith("ControlFacet: Invalid id")
		})
	})

	describe("setSymbolMaxLeverage", () => {
		it("Should setSymbolMaxLeverage successfully", async function () {
			await expect(context.controlFacet.connect(owner).setSymbolMaxLeverage(1, BigInt("3000000000000000"))).to.not.be.reverted
			expect((await context.viewFacet.getSymbol(1)).maxLeverage).to.equal(BigInt("3000000000000000"))
		})

		it("Should not setSymbolFundingState if invalid symbol id", async function () {
			await expect(context.controlFacet.connect(owner).setSymbolMaxLeverage(0, BigInt("1000000000000000"))).to.be.revertedWith("ControlFacet: Invalid id")
			await expect(context.controlFacet.connect(owner).setSymbolMaxLeverage(3, BigInt("1000000000000000"))).to.be.revertedWith("ControlFacet: Invalid id")
		})
	})

	describe("setSymbolAcceptableValues", () => {
		it("Should setSymbolAcceptableValues successfully", async function () {
			await expect(
				context.controlFacet.connect(owner).setSymbolAcceptableValues(1, BigInt("200000000000000000000"), BigInt("300000000000000000000"))
			).to.not.be.reverted
			expect((await context.viewFacet.getSymbol(1)).minAcceptablePortionLF).to.equal(BigInt("300000000000000000000"))
			expect((await context.viewFacet.getSymbol(1)).minAcceptableQuoteValue).to.equal(BigInt("200000000000000000000"))
		})

		it("Should not setSymbolFundingState if invalid symbol id", async function () {
			await expect(
				context.controlFacet.connect(owner).setSymbolAcceptableValues(0, BigInt("200000000000000000000"), BigInt("300000000000000000000"))
			).to.be.revertedWith("ControlFacet: Invalid id")
			await expect(
				context.controlFacet.connect(owner).setSymbolAcceptableValues(4, BigInt("200000000000000000000"), BigInt("300000000000000000000"))
			).to.be.revertedWith("ControlFacet: Invalid id")
		})
	})

	describe("setSymbolTradingFee", () => {
		it("Should setSymbolTradingFee successfully", async function () {
			await expect(context.controlFacet.connect(owner).setSymbolTradingFee(1, BigInt("200000000000000000000"))).to.not.be.reverted
			expect((await context.viewFacet.getSymbol(1)).tradingFee).to.equal(BigInt("200000000000000000000"))
		})

		it("Should not setSymbolTradingFee if invalid symbol id", async function () {
			await expect(context.controlFacet.connect(owner).setSymbolTradingFee(0, BigInt("200000000000000000000"))).to.be.revertedWith("ControlFacet: Invalid id")
			await expect(context.controlFacet.connect(owner).setSymbolTradingFee(6, BigInt("200000000000000000000"))).to.be.revertedWith("ControlFacet: Invalid id")
		})
	})

	describe("setForceCancelCooldown", () => {
		it("Should setForceCancelCooldown successfully", async function () {
			await expect(context.controlFacet.connect(owner).setForceCancelCooldown(BigInt("1708784117"))).to.not.be.reverted
			expect((await context.viewFacet.coolDownsOfMA())[1]).to.equal(BigInt("1708784117"))
		})
	})

	describe("setDeallocateCooldown", () => {
		it("Should setDeallocateCooldown successfully", async function () {
			await expect(context.controlFacet.connect(owner).setDeallocateCooldown(BigInt("1708784117"))).to.not.be.reverted
			expect((await context.viewFacet.coolDownsOfMA())[0]).to.equal(BigInt("1708784117"))
		})
	})

	describe("setForceCloseCooldowns", () => {
		it("Should setForceCloseCooldowns successfully", async function () {
			await expect(context.controlFacet.connect(owner).setForceCloseCooldowns(BigInt("1708784117"), BigInt("1708794117"))).to.not.be.reverted
			expect((await context.viewFacet.forceCloseCooldowns())[0]).to.equal(BigInt("1708784117"))
			expect((await context.viewFacet.forceCloseCooldowns())[1]).to.equal(BigInt("1708794117"))
		})
	})

	describe("setForceClosePricePenalty", () => {
		it("Should setForceClosePricePenalty successfully", async function () {
			await expect(context.controlFacet.connect(owner).setForceClosePricePenalty(BigInt("200"))).to.not.be.reverted
			expect(await context.viewFacet.forceClosePricePenalty()).to.equal(BigInt("200"))
		})
	})


	describe("setForceCancelCloseCooldown", () => {
		it("Should setForceCancelCloseCooldown successfully", async function () {
			await expect(context.controlFacet.connect(owner).setForceCancelCloseCooldown(BigInt("1708784117"))).to.not.be.reverted
			expect((await context.viewFacet.coolDownsOfMA())[2]).to.equal(BigInt("1708784117"))
		})
	})

	describe("setForceCloseGapRatio", () => {
		it("Should setForceCloseGapRatio successfully", async function () {
			await expect(context.controlFacet.connect(owner).setForceCloseGapRatio(1, BigInt("200"))).to.not.be.reverted
			expect(await context.viewFacet.forceCloseGapRatio(1)).to.equal(BigInt("200"))
		})
	})

	describe("setFeeCollector", () => {
		it("Should setFeeCollector successfully", async function () {
			await expect(context.controlFacet.connect(owner).setFeeCollector(context.multiAccount2!, user2.address)).to.not.be.reverted
			expect(await context.viewFacet.getFeeCollector(context.multiAccount2!)).to.equal(user2.address)
		})

		it("Should not setFeeCollector when address is zero", async function () {
			await expect(context.controlFacet.connect(owner).setFeeCollector(context.multiAccount2!, ethers.ZeroAddress)).to.be.revertedWith('ControlFacet: Zero address')
		})
	})


	describe("pauseGlobal", () => {
		it("Should pauseGlobal successfully", async function () {
			await expect(context.controlFacet.connect(owner).pauseGlobal()).to.not.reverted
			expect(((await context.viewFacet.pauseState()).globalPaused)).to.be.equal(true)
		})
	})

	describe("pauseLiquidation", () => {
		it("Should pauseLiquidation successfully", async function () {
			await expect(context.controlFacet.connect(owner).pauseLiquidation()).to.not.reverted
			expect(((await context.viewFacet.pauseState()).liquidationPaused)).to.be.equal(true)
		})
	})

	describe("activeEmergencyMode", () => {
		it("Should activeEmergencyMode successfully", async function () {
			await expect(context.controlFacet.connect(owner).activeEmergencyMode()).to.not.reverted
			expect(((await context.viewFacet.pauseState()).emergencyMode)).to.be.equal(true)
		})
	})

	describe("unpauseGlobal", () => {
		it("Should unpauseGlobal successfully", async function () {
			await expect(context.controlFacet.connect(owner).unpauseGlobal()).to.not.reverted
			expect(((await context.viewFacet.pauseState()).globalPaused)).to.be.equal(false)
		})
	})

	describe("unpauseLiquidation", () => {
		it("Should unpauseLiquidation successfully", async function () {
			await expect(context.controlFacet.connect(owner).unpauseLiquidation()).to.not.reverted
			expect(((await context.viewFacet.pauseState()).liquidationPaused)).to.be.equal(false)
		})
	})

	describe("unpauseAccounting", () => {
		it("Should unpauseAccounting successfully", async function () {
			await expect(context.controlFacet.connect(owner).unpauseAccounting()).to.not.reverted
			expect(((await context.viewFacet.pauseState()).accountingPaused)).to.be.equal(false)
		})
	})

	describe("unpausePartyAActions", () => {
		it("Should unpausePartyAActions successfully", async function () {
			await expect(context.controlFacet.connect(owner).unpausePartyAActions()).to.not.reverted
			expect(((await context.viewFacet.pauseState()).partyAActionsPaused)).to.be.equal(false)
		})
	})

	describe("unpausePartyBActions", () => {
		it("Should unpausePartyBActions successfully", async function () {
			await expect(context.controlFacet.connect(owner).unpausePartyBActions()).to.not.reverted
			expect(((await context.viewFacet.pauseState()).partyBActionsPaused)).to.be.equal(false)
		})
	})

	describe("suspendedAddress", () => {
		it("Should suspendedAddress successfully", async function () {
			await expect(context.controlFacet.connect(owner).suspendedAddress(user2.address)).to.not.reverted
			expect(((await context.viewFacet.isSuspended(user2.address)))).to.be.equal(true)
		})
	})

	describe("unsuspendedAddress", () => {
		it("Should unsuspendedAddress successfully", async function () {
			await expect(context.controlFacet.connect(owner).suspendedAddress(user2.address)).to.not.reverted
			await expect(context.controlFacet.connect(owner).unsuspendedAddress(user2.address)).to.not.reverted
			expect(((await context.viewFacet.isSuspended(user2.address)))).to.be.equal(false)
		})
	})

	describe("deactiveEmergencyMode", () => {
		it("Should deactiveEmergencyMode successfully", async function () {
			await expect(context.controlFacet.connect(owner).deactiveEmergencyMode()).to.not.reverted
			expect((((await context.viewFacet.pauseState()).emergencyMode))).to.be.equal(false)
		})
	})
}
