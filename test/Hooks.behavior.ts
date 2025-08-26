import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { ethers } from "hardhat"

import { initializeFixture } from "./Initialize.fixture"
import { Hedger } from "./models/Hedger"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { limitOpenRequestBuilder } from "./models/requestModels/OpenRequest"
import { limitQuoteRequestBuilder } from "./models/requestModels/QuoteRequest"
import { limitFillCloseRequestBuilder } from "./models/requestModels/FillCloseRequest"
import { decimal, getQuoteQuantity } from "./utils/Common"
import { PositionType } from "./models/Enums"

export function shouldBehaveLikeHooks(): void {
  let user: User, hedger: Hedger
  let context: RunContext

  beforeEach(async function () {
    context = await loadFixture(initializeFixture)

    this.user_allocated = decimal(500n)
    this.hedger_allocated = decimal(4000n)

    user = new User(context, context.signers.user)
    await user.setup()
    await user.setBalances(decimal(2000n), decimal(1000n), this.user_allocated)

    hedger = new Hedger(context, context.signers.hedger)
    await hedger.setup()
    await hedger.setBalances(this.hedger_allocated, this.hedger_allocated)
  })

  describe("setHook", () => {
    it("Should set affiliate-specific hook by SETTER_ROLE and record via view", async function () {
      const MockHook = await ethers.getContractFactory("MockHook")
      const mockHook = await MockHook.deploy()
      await mockHook.waitForDeployment()

      // Only SETTER_ROLE can call setHook
      await expect(
        context.controlFacet
          .connect(context.signers.user)
          .registerHook(context.multiAccount, await mockHook.getAddress()),
      ).to.be.revertedWith("Accessibility: Must has role")

      // Admin has SETTER_ROLE in fixture
      await expect(
        context.controlFacet
          .connect(context.signers.admin)
          .registerHook(context.multiAccount, await mockHook.getAddress()),
      ).to.not.reverted

      const current = await context.viewFacet.getAffiliateHook(context.multiAccount)
      expect(current).to.equal(await mockHook.getAddress())
    })

    it("Should set system-wide hook (affiliate = address(0))", async function () {
      const MockHook = await ethers.getContractFactory("MockHook")
      const mockHook = await MockHook.deploy()
      await mockHook.waitForDeployment()

      await expect(
        context.controlFacet
          .connect(context.signers.admin)
          .registerHook(ethers.ZeroAddress, await mockHook.getAddress()),
      ).to.not.reverted

      const current = await context.viewFacet.getAffiliateHook(ethers.ZeroAddress)
      expect(current).to.equal(await mockHook.getAddress())
    })

    it("Should allow clearing a hook by setting to zero address", async function () {
      const MockHook = await ethers.getContractFactory("MockHook")
      const mockHook = await MockHook.deploy()
      await mockHook.waitForDeployment()

      await context.controlFacet
        .connect(context.signers.admin)
        .registerHook(context.multiAccount, await mockHook.getAddress())

      await context.controlFacet
        .connect(context.signers.admin)
        .registerHook(context.multiAccount, ethers.ZeroAddress)

      const current = await context.viewFacet.getAffiliateHook(context.multiAccount)
      expect(current).to.equal(ethers.ZeroAddress)
    })
  })

  describe("hook callbacks on open/close", () => {
    it("Should call affiliate hook and system hook on openPosition; swallow hook revert", async function () {
      const MockHook = await ethers.getContractFactory("MockHook")
      const affiliateHook = await MockHook.deploy()
      await affiliateHook.waitForDeployment()
      const systemHook = await MockHook.deploy()
      await systemHook.waitForDeployment()

      // Configure hooks
      await context.controlFacet.connect(context.signers.admin).registerHook(context.multiAccount, await affiliateHook.getAddress())
      await context.controlFacet.connect(context.signers.admin).registerHook(ethers.ZeroAddress, await systemHook.getAddress())

      // Prepare a LONG quote with this affiliate
      await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.LONG).build())
      await hedger.lockQuote(1)

      const openPrice = decimal(1n)
      const filledAmount = await getQuoteQuantity(context, 1n)

      // Make affiliate hook revert to ensure it's swallowed
      await affiliateHook.setRevertOnOpen(true, "affiliate open revert")

      // Open position
      await expect(
        hedger.openPosition(
          1,
          limitOpenRequestBuilder()
            .filledAmount(filledAmount)
            .openPrice(openPrice)
            .price(decimal(1n, 17))
            .build(),
        ),
      ).to.not.reverted

      // Verify system hook received the call
      const [oq, oamount, oprice, opartyA, opartyB, ocalls] = await systemHook.getLastOpenCall()
      expect(oq).to.equal(1n)
      expect(oamount).to.equal(filledAmount)
      expect(oprice).to.equal(openPrice)
      const q = await context.viewFacet.getQuote(1)
      expect(opartyA).to.equal(q.partyA)
      expect(opartyB).to.equal(q.partyB)
      expect(ocalls).to.equal(1n)

      // Affiliate hook reverted; its openCallCount should be 0 and last data default (zeros)
      const [, , , , , affiliateOpenCalls] = await affiliateHook.getLastOpenCall()
      expect(affiliateOpenCalls).to.equal(0n)
    })

    it("Should call affiliate and system hook on closePosition; swallow hook revert", async function () {
      const MockHook = await ethers.getContractFactory("MockHook")
      const affiliateHook = await MockHook.deploy()
      await affiliateHook.waitForDeployment()
      const systemHook = await MockHook.deploy()
      await systemHook.waitForDeployment()

      await context.controlFacet.connect(context.signers.admin).registerHook(context.multiAccount, await affiliateHook.getAddress())
      await context.controlFacet.connect(context.signers.admin).registerHook(ethers.ZeroAddress, await systemHook.getAddress())

      // Open a position first
      await user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.LONG).build())
      await hedger.lockQuote(1)
      const openPrice = decimal(1n)
      const filledAmount = await getQuoteQuantity(context, 1n)
      await hedger.openPosition(
        1,
        limitOpenRequestBuilder().filledAmount(filledAmount).openPrice(openPrice).price(decimal(1n, 17)).build(),
      )

      // Request close and fill
      await user.requestToClosePosition(1)

      // Make system hook revert on close to ensure it's swallowed, affiliate should receive
      await systemHook.setRevertOnClose(true, "system close revert")

      const closeFilled = filledAmount
      const closePrice = decimal(1n)
      await expect(
        hedger.fillCloseRequest(
          1,
          limitFillCloseRequestBuilder().filledAmount(closeFilled).closedPrice(closePrice).price(decimal(1n)).build(),
        ),
      ).to.not.reverted

      // Verify affiliate hook received close call
      const [cq, camount, cprice, cpartyA, cpartyB, ccalls] = await affiliateHook.getLastCloseCall()
      expect(cq).to.equal(1n)
      expect(camount).to.equal(closeFilled)
      expect(cprice).to.equal(closePrice)
      const q = await context.viewFacet.getQuote(1)
      expect(cpartyA).to.equal(q.partyA)
      expect(cpartyB).to.equal(q.partyB)
      expect(ccalls).to.equal(1n)

      // System hook reverted; its closeCallCount should be 0
      const [, , , , , systemCloseCalls] = await systemHook.getLastCloseCall()
      expect(systemCloseCalls).to.equal(0n)
    })
  })
}

