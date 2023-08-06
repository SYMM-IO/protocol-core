import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";

import { initializeFixture } from "./Initialize.fixture";
import { QuoteStatus } from "./models/Enums";
import { Hedger } from "./models/Hedger";
import { RunContext } from "./models/RunContext";
import { User } from "./models/User";
import { limitOpenRequestBuilder } from "./models/requestModels/OpenRequest";
import { AcceptCancelRequestValidator } from "./models/validators/AcceptCancelRequestValidator";
import { CancelQuoteValidator } from "./models/validators/CancelQuoteValidator";
import { OpenPositionValidator } from "./models/validators/OpenPositionValidator";
import {
  decimal,
  getQuoteQuantity,
  getTotalLockedValuesForQuoteIds,
  getTradingFeeForQuotes,
  liquidatePartyA,
  pausePartyA,
  pausePartyB,
} from "./utils/Common";

export function shouldBehaveLikeCancelQuote(): void {
  beforeEach(async function () {
    this.context = await loadFixture(initializeFixture);
    this.user_allocated = decimal(500);
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
  });

  it("Should fail due to invalid quoteId", async function () {
    await expect(this.user.requestToCancelQuote(3)).to.be.reverted;
  });

  it("Should fail on invalid partyA", async function () {
    const context: RunContext = this.context;
    await expect(context.partyAFacet.requestToCancelQuote(1)).to.be.revertedWith(
      "Accessibility: Should be partyA of quote",
    );
  });

  it("Should fail on paused partyA", async function () {
    const context: RunContext = this.context;
    await pausePartyA(context);
    await expect(this.user.requestToCancelQuote(1)).to.be.revertedWith(
      "Pausable: PartyA actions paused",
    );
  });

  it("Should fail on liquidated partyA", async function () {
    const context: RunContext = this.context;
    await this.user.sendQuote();
    await this.hedger.lockQuote(2);
    await this.hedger.openPosition(2);
    await liquidatePartyA(
      context,
      context.signers.user.getAddress(),
      context.signers.liquidator,
      this.user_allocated
        .sub(await getTradingFeeForQuotes(context, [1, 2]))
        .sub(await getTotalLockedValuesForQuoteIds(context, [2], false))
        .add(decimal(1))
        .mul(-1),
    );
    await expect(this.user.requestToCancelQuote(1)).to.be.revertedWith(
      "Accessibility: PartyA isn't solvent",
    );
  });

  it("Should fail on invalid state", async function () {
    await this.user.sendQuote();
    await this.hedger.lockQuote(2);
    await this.hedger.openPosition(2);
    await expect(this.user.requestToCancelQuote(2)).to.be.revertedWith(
      "PartyAFacet: Invalid state",
    );
  });

  it("Should cancel a pending quote", async function () {
    const context: RunContext = this.context;
    const validator = new CancelQuoteValidator();
    const beforeOut = await validator.before(context, {
      user: this.user,
      quoteId: BigNumber.from(1),
    });
    await this.user.requestToCancelQuote(1);
    await validator.after(context, {
      user: this.user,
      quoteId: BigNumber.from(1),
      beforeOutput: beforeOut,
      targetStatus: QuoteStatus.CANCELED,
    });
  });

  it("Should cancel a expired pending quote", async function () {
    const context: RunContext = this.context;
    const validator = new CancelQuoteValidator();
    const beforeOut = await validator.before(context, {
      user: this.user,
      quoteId: BigNumber.from(1),
    });
    await time.increase(1000);
    await this.user.requestToCancelQuote(1);
    await validator.after(context, {
      user: this.user,
      quoteId: BigNumber.from(1),
      beforeOutput: beforeOut,
      targetStatus: QuoteStatus.EXPIRED,
    });
  });

  describe("Should cancel a locked quote", async function () {
    beforeEach(async function () {
      await this.hedger.lockQuote(1);
    });

    it("Should fail to accept cancel request on invalid quoteId", async function () {
      await expect(this.hedger.acceptCancelRequest(2)).to.be.reverted;
    });

    it("Should fail to accept cancel request on invalid partyB", async function () {
      await this.user.requestToCancelQuote(1);
      await expect(this.hedger2.acceptCancelRequest(1)).to.be.revertedWith(
        "Accessibility: Should be partyB of quote",
      );
    });

    it("Should fail to accept cancel request on paused partyB", async function () {
      const context: RunContext = this.context;
      await this.user.requestToCancelQuote(1);
      await pausePartyB(context);
      await expect(this.hedger.acceptCancelRequest(1)).to.be.revertedWith(
        "Pausable: PartyB actions paused",
      );
    });

    describe("Should cancel successfully", async function () {
      it("Accept cancel request", async function () {
        const context: RunContext = this.context;
        const cqValidator = new CancelQuoteValidator();
        const cqBeforeOut = await cqValidator.before(context, {
          user: this.user,
          quoteId: BigNumber.from(1),
        });
        await this.user.requestToCancelQuote(1);
        await cqValidator.after(context, {
          user: this.user,
          quoteId: BigNumber.from(1),
          beforeOutput: cqBeforeOut,
        });

        const accValidator = new AcceptCancelRequestValidator();
        const accBeforeOut = await accValidator.before(context, {
          user: this.user,
          quoteId: BigNumber.from(1),
        });
        await this.hedger.acceptCancelRequest(1);
        await accValidator.after(context, {
          user: this.user,
          quoteId: BigNumber.from(1),
          beforeOutput: accBeforeOut,
        });
      });

      it("Open position partially", async function () {
        const context: RunContext = this.context;
        const quantity = await getQuoteQuantity(context, 1);
        await this.user.requestToCancelQuote(1);
        const validator = new OpenPositionValidator();
        const beforeOut = await validator.before(context, {
          user: this.user,
          hedger: this.hedger,
          quoteId: BigNumber.from(1),
        });
        const openedPrice = decimal(1);
        const filledAmount = quantity.div(2);
        await this.hedger.openPosition(
          1,
          limitOpenRequestBuilder()
            .filledAmount(filledAmount)
            .openPrice(openedPrice)
            .price(decimal(1, 17))
            .build(),
        );
        await validator.after(context, {
          user: this.user,
          hedger: this.hedger,
          quoteId: BigNumber.from(1),
          openedPrice: openedPrice,
          fillAmount: filledAmount,
          beforeOutput: beforeOut,
          newQuoteId: BigNumber.from(2),
          newQuoteTargetStatus: QuoteStatus.CANCELED,
        });
      });

      it("Open position fully", async function () {
        const context: RunContext = this.context;
        const quantity = await getQuoteQuantity(context, 1);
        await this.user.requestToCancelQuote(1);
        const validator = new OpenPositionValidator();
        const beforeOut = await validator.before(context, {
          user: this.user,
          hedger: this.hedger,
          quoteId: BigNumber.from(1),
        });
        const openedPrice = decimal(1);
        const filledAmount = quantity;
        await this.hedger.openPosition(
          1,
          limitOpenRequestBuilder()
            .filledAmount(quantity)
            .openPrice(openedPrice)
            .price(decimal(1, 17))
            .build(),
        );
        await validator.after(context, {
          user: this.user,
          hedger: this.hedger,
          quoteId: BigNumber.from(1),
          openedPrice: openedPrice,
          fillAmount: filledAmount,
          beforeOutput: beforeOut,
        });
      });
    });
  });
}
