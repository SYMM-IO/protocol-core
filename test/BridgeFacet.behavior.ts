import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { RunContext } from "./models/RunContext";
import { User } from "./models/User";
import { initializeFixture } from "./Initialize.fixture";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TransferToBridgeValidator } from "./models/validators/TransferToBridgeValidator";

export function shouldBehaveLikeBridgeFacet(): void {
  let context: RunContext, user: User;
  let bridge: SignerWithAddress, bridge2: SignerWithAddress;

  beforeEach(async function () {
    context = await loadFixture(initializeFixture);
    bridge = context.signers.bridge;
    bridge2 = context.signers.bridge2;
    user = new User(context, context.signers.user);
    await user.setup();
    await user.setBalances("500");

    await context.controlFacet.whiteListBridge(await bridge.getAddress());
  });

  describe("Transfer to bridge", async function () {
    it("Should fail when bridge status is wrong", async function () {
      await expect(
        context.bridgeFacet
          .connect(context.signers.user)
          .transferToBridge(
            await user.getAddress(),
            BigNumber.from(100),
            await bridge2.getAddress(),
          ),
      ).to.be.revertedWith("BridgeFacet: Bridge address is not whitelist");
    });

    it("Should fail when amount is more than user balance", async function () {
      await expect(
        context.bridgeFacet
          .connect(context.signers.user)
          .transferToBridge(
            await user.getAddress(),
            BigNumber.from(600),
            await bridge.getAddress(),
          ),
      ).to.be.reverted;
    });

    it("Should transfer to bridge successfully", async function () {
      const id = await context.viewFacet.getNextBridgeTransactionId();

      const validator = new TransferToBridgeValidator();
      const beforeOut = await validator.before(context, {
        user: user,
        transactionId: id.add(1),
      });
      context.bridgeFacet
        .connect(context.signers.user)
        .transferToBridge(await user.getAddress(), BigNumber.from(100), await bridge.getAddress());

      await validator.after(context, {
        user: user,
        transactionId: id.add(1),
        beforeOutput: beforeOut,
      });
    });
  });
}
