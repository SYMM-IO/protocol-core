import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { RunContext } from "./models/RunContext"
import { initializeFixture } from "./Initialize.fixture"
import { expect } from "chai"
import { constants, BigNumber } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { keccak256 } from "js-sha3"

const DISPUTE_ROLE = `0x${keccak256("DISPUTE_ROLE")}`
const PARTY_B_MANAGER_ROLE = `0x${keccak256("PARTY_B_MANAGER_ROLE")}`
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

		await context.controlFacet.transferOwnership(owner.address)
		await context.controlFacet.connect(owner).setAdmin(owner.address)
		await context.controlFacet.connect(owner).grantRole(owner.address, PARTY_B_MANAGER_ROLE)
		await context.controlFacet.connect(owner).grantRole(owner.address, SYMBOL_MANAGER_ROLE)
		await context.controlFacet.connect(owner).grantRole(owner.address, SETTER_ROLE)
		await context.controlFacet.connect(owner).grantRole(owner.address, PAUSER_ROLE)
		await context.controlFacet.connect(owner).grantRole(owner.address, SUSPENDER_ROLE)
		await context.controlFacet.connect(owner).grantRole(owner.address, UNPAUSER_ROLE)
	})

	describe("transferOwnership", () => {
		it("Should transferOwnership successfully", async function () {
			await expect(context.controlFacet.connect(owner).transferOwnership(user2.address)).to.not.reverted
		})

		it("Should not transferOwnership to Address zero", async function () {
			await expect(context.controlFacet.connect(owner).transferOwnership(constants.AddressZero)).to.be.revertedWith("ControlFacet: Zero address")
		})
	})

	describe("grantRole", () => {
		it("Should grantRole successfully", async function () {
			await expect(context.controlFacet.connect(owner).grantRole(user2.address, DISPUTE_ROLE)).to.not.reverted
			expect(await context.viewFacet.hasRole(user2.address, DISPUTE_ROLE)).to.be.equal(true)
		})

		it("Should not grantRole to Address zero", async function () {
			await expect(context.controlFacet.connect(owner).grantRole(constants.AddressZero, DISPUTE_ROLE)).to.be.revertedWith(
				"ControlFacet: Zero address",
			)
		})
	})

	describe("revokeRole", () => {
		it("Should revokeRole successfully", async function () {
			await context.controlFacet.connect(owner).grantRole(user2.address, DISPUTE_ROLE)
			await expect(context.controlFacet.connect(owner).revokeRole(user2.address, DISPUTE_ROLE)).to.not.reverted
			expect(await context.viewFacet.hasRole(user2.address, DISPUTE_ROLE)).to.be.equal(false)
		})
	})

	describe("registerPartyB", () => {
		it("Should registerPartyB successfully", async function () {
			await expect(context.controlFacet.connect(owner).registerPartyB(hedger3.address)).to.not.reverted
			expect(await context.viewFacet.isPartyB(hedger3.address)).to.be.equal(true)
		})

		it("Should not registerPartyB if partyB exist", async function () {
			await expect(context.controlFacet.connect(owner).registerPartyB(hedger.address)).to.revertedWith("ControlFacet: Address is already registered")
		})
	})

	describe("deregisterPartyB", () => {
		it("Should deregisterPartyB successfully", async function () {
			await expect(context.controlFacet.connect(owner).deregisterPartyB(hedger.address, 0)).to.not.reverted
			expect(await context.viewFacet.isPartyB(hedger.address)).to.be.equal(false)
		})

		it("Should not deregisterPartyB if Collateral is zero address", async function () {
			await expect(context.controlFacet.connect(owner).deregisterPartyB(constants.AddressZero, 0)).to.be.revertedWith("ControlFacet: Zero address")
		})

		it("Should not deregisterPartyB if address is not register", async function () {
			await expect(context.controlFacet.connect(owner).deregisterPartyB(hedger3.address, 0)).to.be.revertedWith(
				"ControlFacet: Address is not registered",
			)
		})

		it("Should not deregisterPartyB if address is not register", async function () {
			await expect(context.controlFacet.connect(owner).deregisterPartyB(hedger.address, 1)).to.be.revertedWith("ControlFacet: Invalid index")
		})
	})

	describe("setCollateral", () => {
		it("Should setCollateral successfully", async function () {
			await expect(context.controlFacet.connect(owner).setCollateral(context.collateral.address)).to.not.reverted
			expect(await context.viewFacet.getCollateral()).to.be.equal(context.collateral.address)
		})

		it("Should not setCollateral if Collateral is zero address", async function () {
			await expect(context.controlFacet.connect(owner).setCollateral(constants.AddressZero)).to.be.revertedWith("ControlFacet: Zero address")
		})
	})

	describe("addSymbol", () => {
		it("Should addSymbol successfully", async function () {
			const windowTime = BigNumber.from(28800)
			const period = BigNumber.from(900)
			const baseUnit = BigNumber.from(4000000000000000)
			const quoteUnit = BigNumber.from(1000000000000000)
			const minQty = BigNumber.from("100000000000000000000")
			const maxQty = BigNumber.from("60000000000000000000")

			await expect(context.controlFacet.connect(owner).addSymbol("ETHUSDT", maxQty, baseUnit, quoteUnit, minQty, windowTime, period)).to.not.reverted
			expect((await context.viewFacet.getSymbol(2)).name).to.be.equal("ETHUSDT")
		})

		it("Should not addSymbol if windowTime be high", async function () {
			const windowTime = BigNumber.from(800)
			const period = BigNumber.from(900)
			const baseUnit = BigNumber.from("4000000000000000")
			const quoteUnit = BigNumber.from("1000000000000000")
			const minQty = BigNumber.from("100000000000000000000")
			const maxQty = BigNumber.from("60000000000000000000")

			await expect(context.controlFacet.connect(owner).addSymbol("ETHUSDT", maxQty, baseUnit, quoteUnit, minQty, windowTime, period)).to.revertedWith(
				"ControlFacet: High window time",
			)
		})

		it("Should not addSymbol if tradingFee be high", async function () {
			const windowTime = BigNumber.from(28800)
			const period = BigNumber.from(900)
			const baseUnit = BigNumber.from("4000000000000000")
			const quoteUnit = BigNumber.from("100000000000000000000")
			const minQty = BigNumber.from("100000000000000000000")
			const maxQty = BigNumber.from("60000000000000000000")

			await expect(context.controlFacet.connect(owner).addSymbol("ETHUSDT", maxQty, baseUnit, quoteUnit, minQty, windowTime, period)).to.revertedWith(
				"ControlFacet: High trading fee",
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
			await expect(context.controlFacet.connect(owner).setSymbolMaxLeverage(1, BigNumber.from("3000000000000000"))).to.not.reverted
			expect((await context.viewFacet.getSymbol(1)).maxLeverage).to.be.equal(BigNumber.from("3000000000000000"))
		})

		it("Should not setSymbolFundingState if invalid symbol id", async function () {
			await expect(context.controlFacet.connect(owner).setSymbolMaxLeverage(0, BigNumber.from("1000000000000000"))).to.revertedWith(
				"ControlFacet: Invalid id",
			)
			await expect(context.controlFacet.connect(owner).setSymbolMaxLeverage(3, BigNumber.from("1000000000000000"))).to.revertedWith(
				"ControlFacet: Invalid id",
			)
		})
	})

	describe("setSymbolAcceptableValues", () => {
		it("Should setSymbolAcceptableValues successfully", async function () {
			await expect(
				context.controlFacet
					.connect(owner)
					.setSymbolAcceptableValues(1, BigNumber.from("200000000000000000000"), BigNumber.from("300000000000000000000")),
			).to.not.reverted
			expect((await context.viewFacet.getSymbol(1)).minAcceptablePortionLF).to.be.equal(BigNumber.from("300000000000000000000"))
			expect((await context.viewFacet.getSymbol(1)).minAcceptableQuoteValue).to.be.equal(BigNumber.from("200000000000000000000"))
		})

		it("Should not setSymbolFundingState if invalid symbol id", async function () {
			await expect(
				context.controlFacet
					.connect(owner)
					.setSymbolAcceptableValues(0, BigNumber.from("200000000000000000000"), BigNumber.from("300000000000000000000")),
			).to.revertedWith("ControlFacet: Invalid id")
			await expect(
				context.controlFacet
					.connect(owner)
					.setSymbolAcceptableValues(4, BigNumber.from("200000000000000000000"), BigNumber.from("300000000000000000000")),
			).to.revertedWith("ControlFacet: Invalid id")
		})
	})

	describe("setSymbolTradingFee", () => {
		it("Should setSymbolTradingFee successfully", async function () {
			await expect(context.controlFacet.connect(owner).setSymbolTradingFee(1, BigNumber.from("200000000000000000000"))).to.not.reverted
			expect((await context.viewFacet.getSymbol(1)).tradingFee).to.be.equal(BigNumber.from("200000000000000000000"))
		})

		it("Should not setSymbolTradingFee if invalid symbol id", async function () {
			await expect(context.controlFacet.connect(owner).setSymbolTradingFee(0, BigNumber.from("200000000000000000000"))).to.revertedWith(
				"ControlFacet: Invalid id",
			)
			await expect(context.controlFacet.connect(owner).setSymbolTradingFee(6, BigNumber.from("200000000000000000000"))).to.revertedWith(
				"ControlFacet: Invalid id",
			)
		})
	})

	describe("setForceCancelCooldown", () => {
		it("Should setSymbolTradingFee successfully", async function () {
			await expect(context.controlFacet.connect(owner).setForceCancelCooldown(BigNumber.from("1708784117"))).to.not.reverted
			expect((await context.viewFacet.coolDownsOfMA())[1]).to.be.equal(BigNumber.from("1708784117"))
		})
	})

	describe("setDeallocateCooldown", () => {
		it("Should setDeallocateCooldown successfully", async function () {
			await expect(context.controlFacet.connect(owner).setDeallocateCooldown(BigNumber.from("1708784117"))).to.not.reverted
			expect((await context.viewFacet.coolDownsOfMA())[0]).to.be.equal(BigNumber.from("1708784117"))
		})
	})

	describe("setForceCloseCooldowns", () => {
		it("Should setForceCloseCooldowns successfully", async function () {
			await expect(context.controlFacet.connect(owner).setForceCloseCooldowns(BigNumber.from("1708784117"),BigNumber.from("1708794117"))).to.not.reverted
			expect((await context.viewFacet.coolDownsOfMA())[3]).to.be.equal(BigNumber.from("1708784117"))
			expect((await context.viewFacet.coolDownsOfMA())[4]).to.be.equal(BigNumber.from("1708794117"))
		})
	})

	describe("setForceClosePricePenalty", () => {
		it("Should setForceClosePricePenalty successfully", async function () {
			await expect(context.controlFacet.connect(owner).setForceClosePricePenalty(BigNumber.from("200"))).to.not.reverted
			expect(await context.viewFacet.forceClosePricePenalty()).to.be.equal(BigNumber.from("200"))
		})
	})

	describe("setForceCancelCloseCooldown", () => {
		it("Should setForceCancelCloseCooldown successfully", async function () {
			await expect(context.controlFacet.connect(owner).setForceCancelCloseCooldown(BigNumber.from("1708784117"))).to.not.reverted
			expect((await context.viewFacet.coolDownsOfMA())[2]).to.be.equal(BigNumber.from("1708784117"))
		})
	})

	describe("setForceCloseGapRatio", () => {
		it("Should setForceCloseGapRatio successfully", async function () {
			await expect(context.controlFacet.connect(owner).setForceCloseGapRatio(BigNumber.from("200"))).to.not.reverted
			expect((await context.viewFacet.forceCloseGapRatio())).to.be.equal(BigNumber.from("200"))
		})
	})

	describe("setFeeCollector", () => {
		it("Should setFeeCollector successfully", async function () {
			await expect(context.controlFacet.connect(owner).setFeeCollector(user2.address)).to.not.reverted
			expect((await context.viewFacet.getFeeCollector())).to.be.equal(user2.address)
		})

		it("Should not setFeeCollector when address is zero", async function () {
			await expect(context.controlFacet.connect(owner).setFeeCollector(constants.AddressZero)).to.be.revertedWith('ControlFacet: Zero address')
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
