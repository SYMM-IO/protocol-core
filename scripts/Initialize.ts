import { keccak256, toUtf8Bytes } from "ethers/lib/utils";
import { run } from "hardhat";

import { createRunContext, RunContext } from "../test/models/RunContext";
import { decimal } from "../test/utils/Common";
import fs from "fs";
import { runTx } from "../test/utils/TxUtils";
import { ControlFacet } from "../src/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { symbolsMock } from "../test/models/SymbolManager";

export async function initialize(): Promise<RunContext> {
  let collateral = await run("deploy:stablecoin");
  let diamond = await run("deploy:diamond", {
    logData: false,
    genABI: false,
    reportGas: true,
  });

  let multicall =
    process.env.DEPLOY_MULTICALL == "true" ? await run("deploy:multicall") : undefined;

  let context = await createRunContext(diamond.address, collateral.address, true);

  await runTx(
    context.controlFacet
      .connect(context.signers.admin)
      .setAdmin(context.signers.admin.getAddress()),
  );
  await runTx(
    context.controlFacet.connect(context.signers.admin).setCollateral(context.collateral.address),
  );
  await runTx(
    context.controlFacet
      .connect(context.signers.admin)
      .grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("SYMBOL_MANAGER_ROLE"))),
  );
  await runTx(
    context.controlFacet
      .connect(context.signers.admin)
      .grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("SETTER_ROLE"))),
  );
  await runTx(
    context.controlFacet
      .connect(context.signers.admin)
      .grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("PAUSER_ROLE"))),
  );
  await runTx(
    context.controlFacet
      .connect(context.signers.admin)
      .grantRole(
        context.signers.admin.getAddress(),
        keccak256(toUtf8Bytes("PARTY_B_MANAGER_ROLE")),
      ),
  );
  await runTx(
    context.controlFacet
      .connect(context.signers.admin)
      .grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("LIQUIDATOR_ROLE"))),
  );
  await runTx(
    context.controlFacet
      .connect(context.signers.admin)
      .grantRole(context.signers.user.getAddress(), keccak256(toUtf8Bytes("LIQUIDATOR_ROLE"))),
  );
  await runTx(
    context.controlFacet
      .connect(context.signers.admin)
      .grantRole(context.signers.user2.getAddress(), keccak256(toUtf8Bytes("LIQUIDATOR_ROLE"))),
  );

  // await runTx(context.controlFacet
  //   .connect(context.signers.admin)
  //   .addSymbol("BTCUSDT", decimal(5), decimal(1, 16), decimal(1, 16), decimal(100), 28800, 900));

  const addSymbolAsync = async (
    controlFacet: ControlFacet,
    adminSigner: SignerWithAddress,
    sym: any,
  ) => {
    await controlFacet
      .connect(adminSigner)
      .addSymbol(
        sym.name,
        sym.min_acceptable_quote_value,
        sym.min_acceptable_portion_lf,
        sym.trading_fee,
        decimal(100, 18),
        28800,
        900,
      );
  };

  const promises = symbolsMock.symbols.map(sym =>
    addSymbolAsync(context.controlFacet, context.signers.admin, sym),
  );

  await Promise.all(promises);

  await runTx(context.controlFacet.connect(context.signers.admin).setPendingQuotesValidLength(100));
  await runTx(
    context.controlFacet.connect(context.signers.admin).setLiquidatorShare(decimal(1, 17)),
  );
  await runTx(context.controlFacet.connect(context.signers.admin).setLiquidationTimeout(100));
  await runTx(context.controlFacet.connect(context.signers.admin).setDeallocateCooldown(120));
  await runTx(
    context.controlFacet.connect(context.signers.admin).setBalanceLimitPerUser(decimal(100000)),
  );

  let output: any = {};
  if (fs.existsSync("./output/addresses.json")) {
    output = JSON.parse(fs.readFileSync("./output/addresses.json", "utf8"));
    output.collateralAddress = collateral.address;
    output.v3Address = diamond.address;
  } else {
    if (!fs.existsSync("./output")) fs.mkdirSync("./output");
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
