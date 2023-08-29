import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";

import { initializeFixture } from "./Initialize.fixture";
import { QuoteStatus } from "./models/Enums";
import { Hedger } from "./models/Hedger";
import { RunContext } from "./models/RunContext";
import { BalanceInfo, User } from "./models/User";
import { decimal, getTotalLockedValuesForQuoteIds, getTradingFeeForQuotes, liquidatePartyA } from "./utils/Common";
import { getDummyLiquidationSig, getDummySingleUpnlSig } from "./utils/SignatureUtils";

export function shouldBehaveLikeLiquidationFacet(): void {
  beforeEach(async function() {
    this.context = await loadFixture(initializeFixture);

    this.user = new User(this.context, this.context.signers.user);
    await this.user.setup();
    await this.user.setBalances(decimal(2000), decimal(1000), decimal(500));

    this.user2 = new User(this.context, this.context.signers.user2);
    await this.user2.setup();
    await this.user2.setBalances(decimal(2000), decimal(1000), decimal(500));

    this.liquidator = new User(this.context, this.context.signers.liquidator);
    await this.liquidator.setup();

    this.hedger = new Hedger(this.context, this.context.signers.hedger);
    await this.hedger.setup();
    await this.hedger.setBalances(decimal(2000), decimal(1000));

    this.hedger2 = new Hedger(this.context, this.context.signers.hedger2);
    await this.hedger2.setup();
    await this.hedger2.setBalances(decimal(2000), decimal(1000));

    // Quote1 -> opened
    await this.user.sendQuote();
    await this.hedger.lockQuote(1);
    await this.hedger.openPosition(1);

    // Quote2 -> locked
    await this.user.sendQuote();
    await this.hedger.lockQuote(2);

    // Quote3 -> sent
    await this.user.sendQuote();

    // Quote4 -> user2 -> opened
    await this.user2.sendQuote();
    await this.hedger.lockQuote(4);
    await this.hedger.openPosition(4);

    // Quote5 -> locked
    await this.user.sendQuote();
    await this.hedger.lockQuote(5);
  });

  describe("Liquidate PartyA", async function() {
    it("Should fail on partyA being solvent", async function() {
      const context: RunContext = this.context;
      await expect(
        context.liquidationFacet.liquidatePartyA(
          context.signers.user.getAddress(),
          await getDummyLiquidationSig("0x10", 0, [], [], 0),
        ),
      ).to.be.revertedWith("LiquidationFacet: PartyA is solvent");
    });

    it("Should liquidate pending quotes", async function() {
      const context: RunContext = this.context;
      let user = context.signers.user.getAddress();

      await liquidatePartyA(context, user);
      await context.liquidationFacet
        .connect(context.signers.liquidator)
        .liquidatePendingPositionsPartyA(await context.signers.user.getAddress());

      expect((await context.viewFacet.getQuote(2)).quoteStatus).to.be.equal(QuoteStatus.CANCELED);
      expect((await context.viewFacet.getQuote(3)).quoteStatus).to.be.equal(QuoteStatus.CANCELED);

      let balanceInfoOfPartyA: BalanceInfo = await this.user.getBalanceInfo();
      expect(balanceInfoOfPartyA.allocatedBalances).to.be.equal(
        decimal(500).sub(await getTradingFeeForQuotes(context, [1, 2, 3, 4])),
      );
      expect(balanceInfoOfPartyA.totalLocked).to.be.equal(
        await getTotalLockedValuesForQuoteIds(context, [1]),
      );
      expect(balanceInfoOfPartyA.pendingLockedCva).to.be.equal("0");
      expect(balanceInfoOfPartyA.pendingLockedMm).to.be.equal("0");
      expect(balanceInfoOfPartyA.pendingLockedLf).to.be.equal("0");
      expect(balanceInfoOfPartyA.totalPendingLocked).to.be.equal("0");

      let balanceInfoOfPartyB: BalanceInfo = await this.hedger.getBalanceInfo(user);
      expect(balanceInfoOfPartyB.allocatedBalances).to.be.equal(decimal(360).toString());
      expect(balanceInfoOfPartyB.lockedCva).to.be.equal(decimal(22).toString());
      expect(balanceInfoOfPartyB.lockedMm).to.be.equal(decimal(75).toString());
      expect(balanceInfoOfPartyB.lockedLf).to.be.equal(decimal(3).toString());
      expect(balanceInfoOfPartyB.totalLocked).to.be.equal(decimal(100).toString());
      expect(balanceInfoOfPartyB.pendingLockedCva).to.be.equal("0");
      expect(balanceInfoOfPartyB.pendingLockedMm).to.be.equal("0");
      expect(balanceInfoOfPartyB.pendingLockedLf).to.be.equal("0");
      expect(balanceInfoOfPartyB.totalPendingLocked).to.be.equal("0");
    });

    it("Should fail to liquidate a user twice", async function() {
      const context: RunContext = this.context;
      await liquidatePartyA(
        context,
        context.signers.user.getAddress(),
      );
      await expect(
        liquidatePartyA(context, context.signers.user.getAddress()),
      ).to.be.revertedWith("Accessibility: PartyA isn't solvent");
    });

    describe("Liquidate Positions", async function() {
      beforeEach(async function() {
        const context: RunContext = this.context;
        await liquidatePartyA(
          context,
          context.signers.user.getAddress(),
        );
        await liquidatePartyA(
          context,
          context.signers.user2.getAddress(),
          context.signers.liquidator,
          decimal(-475),
        );
      });

      it("Should fail on invalid state", async function() {
        const context: RunContext = this.context;
        let user = context.signers.user.getAddress();
        await expect(
          context.liquidationFacet
            .connect(context.signers.liquidator)
            .liquidatePositionsPartyA(user, [2]),
        ).to.be.revertedWith("LiquidationFacet: Invalid state");
      });

      it("Should fail on partyA being solvent", async function() {
        const context: RunContext = this.context;
        let user3 = context.signers.hedger2.getAddress();
        await expect(
          context.liquidationFacet
            .connect(context.signers.liquidator)
            .liquidatePositionsPartyA(user3, [1]),
        ).to.be.revertedWith("LiquidationFacet: PartyA is solvent"); // liquidationTimestamp[partyA] = 0
      });

      it("Should fail on partyA being the liquidator himself", async function() {
        const context: RunContext = this.context;
        let user2 = context.signers.user2.getAddress();
        await expect(
          context.liquidationFacet
            .connect(context.signers.liquidator)
            .liquidatePositionsPartyA(user2, [1]),
        ).to.be.revertedWith("LiquidationFacet: Invalid party");
      });

      it("Should liquidate positions", async function() {
        const context: RunContext = this.context;
        let user = context.signers.user.getAddress();
        let hedger = context.signers.hedger.getAddress();
        await context.liquidationFacet
          .connect(context.signers.liquidator)
          .liquidatePendingPositionsPartyA(user);

        await context.liquidationFacet
          .connect(context.signers.liquidator)
          .liquidatePositionsPartyA(user, [1]);

        expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(
          QuoteStatus.LIQUIDATED,
        );
        expect(await context.viewFacet.allocatedBalanceOfPartyB(hedger, user)).to.be.equal(
          decimal(382),
        );
        let balanceInfoOfLiquidator = await this.liquidator.getBalanceInfo();
        expect(balanceInfoOfLiquidator.allocatedBalances).to.be.equal(decimal(1));
      });
    });
  });

  describe("Liquidate PartyB", async function() {
    it("Should fail on partyB being solvent", async function() {
      const context: RunContext = this.context;
      await expect(
        context.liquidationFacet.liquidatePartyB(
          context.signers.hedger.getAddress(),
          context.signers.user.getAddress(),
          await getDummySingleUpnlSig(),
        ),
      ).to.be.revertedWith("LiquidationFacet: partyB is solvent");
    });

    it("Should run successfully", async function() {
      const context: RunContext = this.context;
      let user = context.signers.user.getAddress();
      let hedger = context.signers.hedger.getAddress();

      await context.liquidationFacet.liquidatePartyB(
        hedger,
        user,
        await getDummySingleUpnlSig(decimal(-336)),
      );
      let balanceInfo: BalanceInfo = await this.hedger.getBalanceInfo(user);
      expect(balanceInfo.allocatedBalances).to.be.equal("0");
      expect(balanceInfo.lockedCva).to.be.equal("0");
      expect(balanceInfo.lockedMm).to.be.equal("0");
      expect(balanceInfo.lockedLf).to.be.equal("0");
      expect(balanceInfo.totalLocked).to.be.equal("0");
      expect(balanceInfo.pendingLockedCva).to.be.equal("0");
      expect(balanceInfo.pendingLockedMm).to.be.equal("0");
      expect(balanceInfo.pendingLockedLf).to.be.equal("0");
      expect(balanceInfo.totalPendingLocked).to.be.equal("0");

      expect((await context.viewFacet.getQuote(5)).quoteStatus).to.be.equal(QuoteStatus.CANCELED);
    });

    it("Should fail to liquidate a partyB twice", async function() {
      const context: RunContext = this.context;
      await context.liquidationFacet.liquidatePartyB(
        context.signers.hedger.getAddress(),
        context.signers.user.getAddress(),
        await getDummySingleUpnlSig(decimal(-336)),
      );
      await expect(
        context.liquidationFacet.liquidatePartyB(
          context.signers.hedger.getAddress(),
          context.signers.user.getAddress(),
          await getDummySingleUpnlSig(decimal(-336)),
        ),
      ).to.revertedWith("Accessibility: PartyB isn't solvent");
    });
  });
}
