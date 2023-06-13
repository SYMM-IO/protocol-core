import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";

import { QuoteStruct } from "../src/types/contracts/facets/ViewFacet";
import { initializeFixture } from "./Initialize.fixture";
import { PositionType, QuoteStatus } from "./models/Enums";
import { Hedger } from "./models/Hedger";
import { RunContext } from "./models/RunContext";
import { User } from "./models/User";
import { limitQuoteRequestBuilder } from "./models/requestModels/QuoteRequest";
import { LockQuoteValidator } from "./models/validators/LockQuoteValidator";
import { UnlockQuoteValidator } from "./models/validators/UnlockQuoteValidator";
import {
  decimal,
  getTotalLockedValuesForQuoteIds,
  getTradingFeeForQuotes,
  liquidatePartyA,
  pausePartyB,
} from "./utils/Common";
import { getDummySingleUpnlSig } from "./utils/SignatureUtils";

export function shouldBehaveLikeLockQuote(): void {
  beforeEach(async function() {
    this.context = await loadFixture(initializeFixture);
    const context: RunContext = this.context;
    this.user_allocated = decimal(700);
    this.hedger_allocated = decimal(4000);

    this.user = new User(this.context, this.context.signers.user);
    await this.user.setup();
    await this.user.setBalances(decimal(2000), decimal(1000), this.user_allocated);

    this.hedger = new Hedger(this.context, this.context.signers.hedger);
    await this.hedger.setup();
    await this.hedger.setBalances(this.hedger_allocated, this.hedger_allocated);

    this.hedger2 = new Hedger(this.context, this.context.signers.hedger2);
    await this.hedger2.setup();
    await this.hedger2.setBalances(this.hedger_allocated, this.hedger_allocated);

    await this.user.sendQuote();
    await this.user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build());
    await this.user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build());
    await this.user.sendQuote(
      limitQuoteRequestBuilder()
        .partyBWhiteList([await context.signers.hedger.getAddress()])
        .build(),
    );
    await this.user.sendQuote();
  });

  it("Should fail on invalid quoteId", async function() {
    await expect(this.hedger.lockQuote(6, 0, null)).to.be.reverted;
  });

  it("Should fail on low balance", async function() {
    await expect(this.hedger.lockQuote(1, 0, null)).to.be.revertedWith(
      "PartyBFacet: insufficient available balance",
    );
  });

  it("Should fail on low balance (negative upnl)", async function() {
    await expect(this.hedger.lockQuote(1, decimal(-125))).to.be.revertedWith(
      "PartyBFacet: Available balance is lower than zero",
    );
  });

  it("Should fail on invalid partyB", async function() {
    const context: RunContext = this.context;
    await expect(
      context.partyBFacet
        .connect(context.signers.user2)
        .lockQuote(1, await getDummySingleUpnlSig()),
    ).to.be.revertedWith("Accessibility: Should be partyB");
  });

  it("Should fail on invalid state", async function() {
    await this.hedger.lockQuote(1);
    await expect(this.hedger.lockQuote(1)).to.be.revertedWith("PartyBFacet: Invalid state");
  });

  it("Should fail on liquidated partyA", async function() {
    const context: RunContext = this.context;
    await this.hedger.lockQuote(2);
    await this.hedger.openPosition(2);
    await liquidatePartyA(
      context,
      context.signers.user.getAddress(),
      context.signers.liquidator,
      this.user_allocated
        .sub(await getTotalLockedValuesForQuoteIds(context, [2], false))
        .sub(await getTradingFeeForQuotes(context, [1, 2, 3, 4, 5]))
        .add(decimal(1))
        .mul(-1),
    );
    await expect(this.hedger.lockQuote(1)).to.be.revertedWith(
      "Accessibility: PartyA isn't solvent",
    );
  });

  it("Should fail on paused partyB", async function() {
    const context: RunContext = this.context;
    await pausePartyB(context);
    await expect(this.hedger.lockQuote(1)).to.be.revertedWith("Pausable: PartyB actions paused");
  });

  it("Should fail on paused partyB", async function() {
    await expect(this.hedger2.lockQuote(4)).to.be.revertedWith(
      "PartyBFacet: Sender isn't whitelisted",
    );
  });

  it("Should fail on expired quote", async function() {
    await time.increase(1000);
    await expect(this.hedger.lockQuote(1)).to.be.revertedWith("PartyBFacet: Quote is expired");
  });

  it("Should run successfully", async function() {
    const context: RunContext = this.context;
    const validator = new LockQuoteValidator();
    const beforeOut = await validator.before(context, {
      user: this.user,
    });
    await this.hedger.lockQuote(1);
    await validator.after(context, {
      user: this.user,
      hedger: this.hedger,
      quoteId: BigNumber.from(1),
      beforeOutput: beforeOut,
    });
  });

  describe("Unlock Quote", async function() {
    beforeEach(async function() {
      await this.hedger.lockQuote(1);
    });

    it("Should liquidate on partyB being not the one", async function() {
      await expect(this.hedger2.unlockQuote(1)).to.be.revertedWith(
        "Accessibility: Should be partyB of quote",
      );
    });

    it("Should fail on paused partyB", async function() {
      const context: RunContext = this.context;
      await pausePartyB(context);
      await expect(this.hedger.unlockQuote(1)).to.be.revertedWith(
        "Pausable: PartyB actions paused",
      );
    });

    it("Should expire quote during unlock", async function() {
      const context: RunContext = this.context;
      await time.increase(1000);
      await this.hedger.unlockQuote(1);
      let q: QuoteStruct = await context.viewFacet.getQuote(1);
      expect(q.quoteStatus).to.be.equal(QuoteStatus.EXPIRED);
    });

    it("Should run successfully", async function() {
      const validator = new UnlockQuoteValidator();
      const beforeOut = await validator.before(this.context, { user: this.user });
      await this.hedger.unlockQuote(1);
      await validator.after(this.context, {
        user: this.user,
        quoteId: BigNumber.from(1),
        beforeOutput: beforeOut,
      });
    });
  });
}
