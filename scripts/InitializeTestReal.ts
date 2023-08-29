import { keccak256, toUtf8Bytes } from "ethers/lib/utils";
import { run } from "hardhat";

import { createRunContext, RunContext } from "../test/models/RunContext";
import { decimal } from "../test/utils/Common";
import fs from "fs";
import { runTx } from "../test/utils/TxUtils";
import { limitOpenRequestBuilder } from "../test/models/requestModels/OpenRequest";
import { Hedger } from "../test/models/Hedger";
import { User } from "../test/models/User";

export async function initialize(): Promise<RunContext> {
  let collateral = await run("deploy:stablecoin");
  let diamond = await run("deploy:diamond", {
    logData: false,
    genABI: false,
    reportGas: true,
  });
  let context = await createRunContext(diamond.address, collateral.address, true);

  await runTx(context.controlFacet
    .connect(context.signers.admin)
    .setAdmin(context.signers.admin.getAddress()));
  await runTx(context.controlFacet
    .connect(context.signers.admin)
    .setCollateral(context.collateral.address));
  await runTx(context.controlFacet
    .connect(context.signers.admin)
    .grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("SYMBOL_MANAGER_ROLE"))));
  await runTx(context.controlFacet
    .connect(context.signers.admin)
    .grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("SETTER_ROLE"))));
  await runTx(context.controlFacet
    .connect(context.signers.admin)
    .grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("PARTY_B_MANAGER_ROLE"))));

  await runTx(context.controlFacet
    .connect(context.signers.admin)
    .addSymbol("BTCUSDT", decimal(5), decimal(1, 16), decimal(1, 16)));

  await runTx(context.controlFacet.connect(context.signers.admin).setPendingQuotesValidLength(100));
  await runTx(context.controlFacet.connect(context.signers.admin).setLiquidatorShare(decimal(1, 17)));
  await runTx(context.controlFacet.connect(context.signers.admin).setLiquidationTimeout(100));
  await runTx(context.controlFacet.connect(context.signers.admin).setDeallocateCooldown(120));
  await runTx(context.controlFacet.connect(context.signers.admin).setBalanceLimitPerUser(decimal(100000)));

  const user = new User(context, context.signers.user);
  const hedger = new Hedger(context, context.signers.admin);
  await hedger.register();

  console.log("Setting balances");
  await user.setBalances(decimal(10000), decimal(10000), decimal(10000));
  await user.setup();
  await hedger.setBalances(decimal(10000), decimal(10000));
  await hedger.setup();

  console.log("Sending Quote...");
  await user.sendQuote();
  console.log("Lock Quote...");
  await hedger.lockQuote(1);

  console.log(await context.viewFacet.getQuote(1));

  console.log("Open Quote...");
  await hedger.openPosition(1, limitOpenRequestBuilder().openPrice(decimal(9, 17)).build());

  console.log(await context.viewFacet.getQuote(1));

  let output: any = {};
  if (fs.existsSync("./output/addresses.json")) {
    output = JSON.parse(fs.readFileSync("./output/addresses.json", "utf8"));
    output.collateralAddress = collateral.address;
    output.v3Address = diamond.address;
  } else {
    if (!fs.existsSync("./output"))
      fs.mkdirSync("./output");
    output = { v3Address: diamond.address, collateralAddress: collateral.address };
  }
  fs.writeFileSync("./output/addresses.json", JSON.stringify(output));

  return context;
}

async function main() {
  let context = await initialize();
  console.log("Initialized successfully");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
