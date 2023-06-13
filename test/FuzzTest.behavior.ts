import { ethers } from "hardhat";
import { interval } from "rxjs";
import { Hedger } from "./models/Hedger";
import { HedgerController } from "./models/HedgerController";
import { ManagedError } from "./models/ManagedError";
import { createRunContext, RunContext } from "./models/RunContext";
import { User } from "./models/User";
import { UserController } from "./models/UserController";
import { decimal } from "./utils/Common";
import fsPromise from "fs/promises";

export function shouldBehaveLikeFuzzTest(): void {
  beforeEach(async function() {
    const addresses = JSON.parse("" + (await fsPromise.readFile("addresses.json")));
    this.context = await createRunContext(addresses.v3Address, addresses.collateralAddress);
  });

  it("Should run fine", async function() {
    const context: RunContext = this.context;
    const manager = context.manager;

    const uSigner = await ethers.getImpersonatedSigner(ethers.Wallet.createRandom().address);
    const user = new User(context, uSigner);
    await user.setup();
    await user.setNativeBalance(100n ** 18n);
    const userController = new UserController(manager, user);

    const hSigner = await ethers.getImpersonatedSigner(ethers.Wallet.createRandom().address);
    const hedger = new Hedger(context, hSigner);
    await hedger.setup();
    await hedger.setNativeBalance(100n ** 18n);
    await hedger.setBalances(decimal(50000), decimal(50000));
    await hedger.register();
    const hedgerController = new HedgerController(manager, hedger);

    await userController.start();
    await hedgerController.start();
    await user.setBalances(decimal(5000), decimal(5000), decimal(5000));

    const subscription = interval(1000).subscribe(() => {
      manager.actionsLoop.next({
        title: "SendQuote",
        action: () => {
          return new Promise((resolve, reject) => {
            if (manager.getPauseState()) {
              reject();
            }
            userController
              .sendQuote()
              .then(() => {
                resolve();
              })
              .catch(error => {
                if (error instanceof ManagedError) {
                  if (error.message.indexOf("Insufficient funds available") >= 0) {
                    console.error(error.message);
                    subscription.unsubscribe();
                  } else if (error.message.indexOf("Too many open quotes") >= 0) {
                    // DO nothing
                  }
                  resolve();
                } else {
                  reject(error);
                  process.exitCode = 1;
                  console.error(error);
                }
              });
          });
        },
      });
    });

    await new Promise(r => setTimeout(r, 200000));
  });
}
