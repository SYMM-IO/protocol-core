import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

import { initializeFixture } from "./Initialize.fixture";
import { Hedger } from "./models/Hedger";
import { RunContext } from "./models/RunContext";
import { User } from "./models/User";
import { decimal, unDecimal } from "./utils/Common";
import { getDummyPairUpnlSig } from "./utils/SignatureUtils";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { limitQuoteRequestBuilder } from "./models/requestModels/QuoteRequest";
import { PositionType } from "./models/Enums";

export function shouldBehaveLikeFundingRate(): void {
  beforeEach(async function() {
    this.context = await loadFixture(initializeFixture);
    this.user = new User(this.context, this.context.signers.user);
    await this.user.setup();
    await this.user.setBalances(decimal(5000), decimal(5000), decimal(5000));

    this.user2 = new User(this.context, this.context.signers.user2);

    this.hedger = new Hedger(this.context, this.context.signers.hedger);
    await this.hedger.setBalances(decimal(5000), decimal(5000));

    this.hedger2 = new Hedger(this.context, this.context.signers.hedger2);
    await this.hedger2.setBalances(decimal(5000), decimal(5000));

    await this.user.sendQuote();
    await this.hedger.lockQuote(1);
    await this.hedger.openPosition(1);

    await this.user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build());
    await this.hedger.lockQuote(2);
    await this.hedger.openPosition(2);
    await this.user.requestToClosePosition(2);

    await this.user.sendQuote();
    await this.hedger.lockQuote(3);
    await this.hedger.openPosition(3);
    await this.user.requestToClosePosition(3);
    await this.hedger.fillCloseRequest(3);
  });

  it("Should fail on different length", async function() {
    const context: RunContext = this.context;
    await expect(this.hedger.chargeFundingRate(
      await context.signers.user.getAddress(),
      [1], [], await getDummyPairUpnlSig(),
    )).to.be.revertedWith("PartyBFacet: Length not match");
  });

  it("Should fail on invalid quote for partyB", async function() {
    const context: RunContext = this.context;
    await expect(this.hedger.chargeFundingRate(
      await context.signers.user2.getAddress(),
      [1], [1], await getDummyPairUpnlSig(),
    )).to.be.revertedWith("PartyBFacet: Invalid quote");
  });

  it("Should fail on invalid quote state", async function() {
    const context: RunContext = this.context;
    await expect(this.hedger.chargeFundingRate(
      await context.signers.user.getAddress(),
      [3], [1], await getDummyPairUpnlSig(),
    )).to.be.revertedWith("PartyBFacet: Invalid state");
  });

  it("Should fail on out of window request", async function() {
    const context: RunContext = this.context;
    let symbol = await context.viewFacet.getSymbol(1);
    let duration = symbol.fundingRateEpochDuration;
    let window = symbol.fundingRateWindowTime;
    let currentEpoch = BigNumber.from(await time.latest()).div(duration).mul(duration);
    let targetTime = duration.mul(2).add(window).add(1).add(currentEpoch);

    await time.setNextBlockTimestamp(targetTime);
    await expect(this.hedger.chargeFundingRate(
      await context.signers.user.getAddress(),
      [1], [1], await getDummyPairUpnlSig(),
    )).to.be.revertedWith("PartyBFacet: Current timestamp is out of window");
  });

  it("Should fail on high funding rate", async function() {
    const context: RunContext = this.context;
    let symbol = await context.viewFacet.getSymbol(1);
    let duration = symbol.fundingRateEpochDuration;
    let window = symbol.fundingRateWindowTime;
    let currentEpoch = BigNumber.from(await time.latest()).div(duration).mul(duration);
    let targetTime = duration.mul(2).add(window).sub(1).add(currentEpoch);

    await time.setNextBlockTimestamp(targetTime);
    await expect(this.hedger.chargeFundingRate(
      await context.signers.user.getAddress(),
      [1], [decimal(3, 16)], await getDummyPairUpnlSig(),
    )).to.be.revertedWith("PartyBFacet: High funding rate");
  });

  it("Should fail on insolvent partyA", async function() {
    const context: RunContext = this.context;
    let symbol = await context.viewFacet.getSymbol(1);
    let duration = symbol.fundingRateEpochDuration;
    let window = symbol.fundingRateWindowTime;
    let currentEpoch = BigNumber.from(await time.latest()).div(duration).mul(duration);
    let targetTime = duration.mul(2).add(window).sub(1).add(currentEpoch);

    await time.setNextBlockTimestamp(targetTime);
    await expect(this.hedger.chargeFundingRate(
      await context.signers.user.getAddress(),
      [1], [decimal(1, 16)], await getDummyPairUpnlSig(decimal(4970).mul(-1)),
    )).to.be.revertedWith("PartyBFacet: PartyA will be insolvent");
  });

  it("Should fail on insolvent partyB", async function() {
    const context: RunContext = this.context;
    let symbol = await context.viewFacet.getSymbol(1);
    let duration = symbol.fundingRateEpochDuration;
    let window = symbol.fundingRateWindowTime;
    let currentEpoch = BigNumber.from(await time.latest()).div(duration).mul(duration);
    let targetTime = duration.mul(2).add(window).sub(1).add(currentEpoch);

    await time.setNextBlockTimestamp(targetTime);
    await expect(this.hedger.chargeFundingRate(
      await context.signers.user.getAddress(),
      [1], [decimal(1, 15)], await getDummyPairUpnlSig(0, decimal(4970).mul(-1)),
    )).to.be.revertedWith("PartyBFacet: PartyB will be insolvent");
  });

  it("Should run successfully for long", async function() {
    const context: RunContext = this.context;
    let symbol = await context.viewFacet.getSymbol(1);
    let duration = symbol.fundingRateEpochDuration;
    let window = symbol.fundingRateWindowTime;
    let currentEpoch = BigNumber.from(await time.latest()).div(duration).mul(duration);
    let targetTime = duration.mul(2).add(window).sub(1).add(currentEpoch);

    let oldQuote = await context.viewFacet.getQuote(1);

    await time.setNextBlockTimestamp(targetTime);
    await this.hedger.chargeFundingRate(
      await context.signers.user.getAddress(),
      [1], [decimal(1, 16)], await getDummyPairUpnlSig(),
    );

    let newQuote = await context.viewFacet.getQuote(1);
    expect(newQuote.openedPrice).to.be.equal(unDecimal(oldQuote.openedPrice.mul(decimal(1).add(decimal(1, 16)))));
  });

  it("Should run successfully for short", async function() {
    const context: RunContext = this.context;
    let symbol = await context.viewFacet.getSymbol(1);
    let duration = symbol.fundingRateEpochDuration;
    let window = symbol.fundingRateWindowTime;
    let currentEpoch = BigNumber.from(await time.latest()).div(duration).mul(duration);
    let targetTime = duration.mul(2).add(window).sub(1).add(currentEpoch);

    let oldQuote = await context.viewFacet.getQuote(2);

    await time.setNextBlockTimestamp(targetTime);
    await this.hedger.chargeFundingRate(
      await context.signers.user.getAddress(),
      [2], [decimal(1, 16)], await getDummyPairUpnlSig(),
    );

    let newQuote = await context.viewFacet.getQuote(2);
    expect(newQuote.openedPrice).to.be.equal(unDecimal(oldQuote.openedPrice.mul(decimal(1).sub(decimal(1, 16)))));
  });

}
