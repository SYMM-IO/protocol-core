import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";

import { initializeFixture } from "./Initialize.fixture";
import { PositionType, QuoteStatus } from "./models/Enums";
import { Hedger } from "./models/Hedger";
import { RunContext } from "./models/RunContext";
import { User } from "./models/User";
import { limitOpenRequestBuilder, marketOpenRequestBuilder } from "./models/requestModels/OpenRequest";
import { limitQuoteRequestBuilder, marketQuoteRequestBuilder } from "./models/requestModels/QuoteRequest";
import { OpenPositionValidator } from "./models/validators/OpenPositionValidator";
import { decimal, getQuoteQuantity, pausePartyB } from "./utils/Common";

export function shouldBehaveLikeOpenPosition(): void {
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
    await this.user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build());
    await this.user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build());
    await this.user.sendQuote(marketQuoteRequestBuilder().build());

    await this.hedger.lockQuote(1);
    await this.hedger2.lockQuote(2);
  });

  it("Should fail on not being the correct partyB", async function () {
    await expect(this.hedger.openPosition(2)).to.be.revertedWith(
      "Accessibility: Should be partyB of quote",
    );
  });

  it("Should fail on paused partyB", async function () {
    await pausePartyB(this.context);
    await expect(this.hedger.openPosition(1)).to.be.revertedWith("Pausable: PartyB actions paused");
  });

  it("Should fail on liquidated quote", async function () {
    await this.hedger2.openPosition(2);
    await this.hedger2.lockQuote(3);
    await this.user.liquidateAndSetSymbolPrices([1],[decimal(2000)]);
    await expect(this.hedger2.openPosition(3)).to.be.revertedWith(
      "Accessibility: PartyA isn't solvent",
    );
  });

  it("Should fail on invalid fill amount", async function () {
    const context: RunContext = this.context;
    // more than quantity
    await expect(
      this.hedger.openPosition(
        1,
        limitOpenRequestBuilder()
          .filledAmount((await getQuoteQuantity(context, 1)).add(decimal(1)))
          .openPrice(decimal(1))
          .build(),
      ),
    ).to.be.revertedWith("PartyBFacet: Invalid filledAmount");

    // zero
    await expect(
      this.hedger.openPosition(1, limitOpenRequestBuilder().filledAmount("0").build()),
    ).to.be.revertedWith("PartyBFacet: Invalid filledAmount");

    // market should get fully filled
    await this.hedger.lockQuote(4);
    await expect(
      this.hedger.openPosition(
        4,
        limitOpenRequestBuilder()
          .filledAmount((await getQuoteQuantity(context, 4)).sub(decimal(1)))
          .openPrice(decimal(1))
          .build(),
      ),
    ).to.be.revertedWith("PartyBFacet: Invalid filledAmount");
  });

  it("Should fail on invalid open price", async function () {
    const context: RunContext = this.context;
    const quantity = await getQuoteQuantity(context, 1);
    await expect(
      this.hedger.openPosition(
        1,
        limitOpenRequestBuilder().filledAmount(quantity).openPrice(decimal(2)).build(),
      ),
    ).to.be.revertedWith("PartyBFacet: Opened price isn't valid");

    await expect(
      this.hedger2.openPosition(
        2,
        limitOpenRequestBuilder().filledAmount(quantity).openPrice(decimal(5, 17)).build(),
      ),
    ).to.be.revertedWith("PartyBFacet: Opened price isn't valid");
  });

  it("Should fail if PartyB will be liquidatable", async function () {
    const context: RunContext = this.context;
    await expect(
      this.hedger.openPosition(
        1,
        limitOpenRequestBuilder()
          .filledAmount(await getQuoteQuantity(context, 1))
          .openPrice(decimal(1))
          .price(decimal(2))
          .build(),
      ),
    ).to.be.revertedWith("LibSolvency: PartyB will be liquidatable");

    await expect(
      this.hedger2.openPosition(
        2,
        limitOpenRequestBuilder()
          .filledAmount(await getQuoteQuantity(context, 2))
          .openPrice(decimal(1))
          .price(decimal(1, 17))
          .upnlPartyB(decimal(-20))
          .build(),
      ),
    ).to.be.revertedWith("LibSolvency: PartyB will be liquidatable");
  });

  it("Should fail if PartyA will become liquidatable", async function () {
    const context: RunContext = this.context;
    await expect(
      this.hedger.openPosition(
        1,
        limitOpenRequestBuilder()
          .filledAmount(await getQuoteQuantity(context, 1))
          .openPrice(decimal(1))
          .price(decimal(1, 17))
          .upnlPartyA(decimal(-400))
          .build(),
      ),
    ).to.be.revertedWith("LibSolvency: PartyA will be liquidatable");
    await expect(
      this.hedger2.openPosition(
        2,
        limitOpenRequestBuilder()
          .filledAmount(await getQuoteQuantity(context, 2))
          .openPrice(decimal(1))
          .price(decimal(2))
          .upnlPartyA(decimal(-400))
          .build(),
      ),
    ).to.be.revertedWith("LibSolvency: PartyA will be liquidatable");
  });

  it("Should fail partially opened position of quote value is low", async function () {
    const context: RunContext = this.context;
    await expect(
      this.hedger.openPosition(
        1,
        limitOpenRequestBuilder()
          .filledAmount((await getQuoteQuantity(context, 1)).sub(decimal(1)))
          .openPrice(decimal(1))
          .price(decimal(1, 17))
          .build(),
      ),
    ).to.be.revertedWith("PartyBFacet: Quote value is low");

    await expect(
      this.hedger.openPosition(
        1,
        limitOpenRequestBuilder()
          .filledAmount(decimal(1))
          .openPrice(decimal(1))
          .price(decimal(1, 17))
          .build(),
      ),
    ).to.be.revertedWith("PartyBFacet: Quote value is low");
  });

  it("Should fail to open expired quote", async function () {
    const context: RunContext = this.context;
    await time.increase(1000);
    await expect(
      this.hedger.openPosition(
        1,
        limitOpenRequestBuilder()
          .filledAmount(await getQuoteQuantity(context, 1))
          .openPrice(decimal(1))
          .price(decimal(1, 17))
          .build(),
      ),
    ).to.be.revertedWith("PartyBFacet: Quote is expired");
  });

  it("Should run successfully for limit", async function () {
    const context: RunContext = this.context;
    const validator = new OpenPositionValidator();
    const beforeOut = await validator.before(context, {
      user: this.user,
      hedger: this.hedger,
      quoteId: BigNumber.from(1),
    });
    const openedPrice = decimal(1);
    const filledAmount = await getQuoteQuantity(context, 1);
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
    });
  });

  it("Should run successfully partially for limit", async function () {
    const context: RunContext = this.context;
    const oldQuote = await context.viewFacet.getQuote(1);
    const validator = new OpenPositionValidator();
    const beforeOut = await validator.before(context, {
      user: this.user,
      hedger: this.hedger,
      quoteId: BigNumber.from(1),
    });
    const filledAmount = oldQuote.quantity.div(4);
    const openedPrice = decimal(9, 17);
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
      newQuoteId: BigNumber.from(5),
      newQuoteTargetStatus: QuoteStatus.PENDING,
    });
  });

  it("Should run successfully for market", async function () {
    const context: RunContext = this.context;
    await this.hedger.lockQuote(4);
    const validator = new OpenPositionValidator();
    const beforeOut = await validator.before(context, {
      user: this.user,
      hedger: this.hedger,
      quoteId: BigNumber.from(4),
    });
    const openedPrice = decimal(1);
    const filledAmount = await getQuoteQuantity(context, 4);
    await this.hedger.openPosition(
      4,
      marketOpenRequestBuilder()
        .filledAmount(filledAmount)
        .openPrice(openedPrice)
        .price(decimal(1))
        .build(),
    );
    await validator.after(context, {
      user: this.user,
      hedger: this.hedger,
      quoteId: BigNumber.from(4),
      openedPrice: openedPrice,
      fillAmount: filledAmount,
      beforeOutput: beforeOut,
    });
  });
}
