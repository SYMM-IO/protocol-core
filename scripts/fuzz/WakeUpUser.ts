import * as fsPromise from "fs/promises";
import { ethers } from "hardhat";

import { ManagedError } from "../../test/models/ManagedError";
import { createRunContext } from "../../test/models/RunContext";
import { User } from "../../test/models/User";
import { UserController } from "../../test/models/UserController";
import { decimal } from "../../test/utils/Common";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const addresses = JSON.parse("" + (await fsPromise.readFile("addresses.json")));
  const context = await createRunContext(addresses.v3Address, addresses.collateralAddress);
  const signer = await ethers.getImpersonatedSigner(ethers.Wallet.createRandom().address);
  const user = new User(context, signer);
  await user.setup();
  await user.setNativeBalance(100n ** 18n);
  const balance = Number(
    process.env.TEST_USER_BALANCE != null ? process.env.TEST_USER_BALANCE : "5000",
  );
  await user.setBalances(decimal(balance), decimal(balance), decimal(balance));
  const userController = new UserController(context.manager, user);
  await userController.start();
  const maxLockedAmountForQuote = Number(
    process.env.TEST_USER_MAX_QUOTE != null ? process.env.TEST_USER_MAX_QUOTE : "100",
  );

  let count = 0;

  const timeout = process.env.TEST_USER_TIMEOUT;
  if (timeout != null)
    setTimeout(() => {
      console.log("Sent " + count + " quotes successfully");
      process.exit();
    }, Number(timeout));

  while (true) {
    try {
      await userController.sendQuote(decimal(maxLockedAmountForQuote));
      count++;
    } catch (error) {
      if (error instanceof ManagedError) {
        if (error.message.indexOf("Insufficient funds available") >= 0) {
          console.error(error.message);
          console.log("Sent " + count + " quotes successfully");
          break;
        } else if (error.message.indexOf("Too many open quotes") >= 0) {
          await sleep(500);
        }
      } else {
        process.exitCode = 1;
        console.error(error);
      }
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
