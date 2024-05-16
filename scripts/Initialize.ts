import { keccak256, toUtf8Bytes } from "ethers/lib/utils"
import { run } from "hardhat"

import { createRunContext, RunContext } from "../test/models/RunContext"
import { decimal } from "../test/utils/Common"
import { runTx } from "../test/utils/TxUtils"
import { Addresses, loadAddresses, saveAddresses } from "./utils/file"

export async function initialize(): Promise<RunContext> {
  let collateral = await run("deploy:stablecoin")
  let diamond = await run("deploy:diamond", {
    logData: false,
    genABI: false,
    reportGas: true,
  })

  let multicall = process.env.DEPLOY_MULTICALL == "true" ? await run("deploy:multicall") : undefined

  let context = await createRunContext(diamond.address, collateral.address, true)

  await runTx(context.controlFacet.connect(context.signers.admin).setAdmin(context.signers.admin.getAddress()))
  await runTx(context.controlFacet.connect(context.signers.admin).setCollateral(context.collateral.address))
  await runTx(
    context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("SYMBOL_MANAGER_ROLE"))),
  )
  await runTx(
    context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("SETTER_ROLE"))),
  )
  await runTx(
    context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("PAUSER_ROLE"))),
  )
  await runTx(
    context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("PARTY_B_MANAGER_ROLE"))),
  )
  await runTx(
    context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("LIQUIDATOR_ROLE"))),
  )
  await runTx(
    context.controlFacet.connect(context.signers.admin).grantRole(context.signers.user.getAddress(), keccak256(toUtf8Bytes("LIQUIDATOR_ROLE"))),
  )
  await runTx(
    context.controlFacet.connect(context.signers.admin).grantRole(context.signers.user2.getAddress(), keccak256(toUtf8Bytes("LIQUIDATOR_ROLE"))),
  )

  await runTx(
    context.controlFacet.connect(context.signers.admin).addSymbol("BTCUSDT", decimal(5), decimal(1, 16), decimal(1, 16), decimal(100), 28800, 900),
  )

  await runTx(context.controlFacet.connect(context.signers.admin).setPendingQuotesValidLength(100))
  await runTx(context.controlFacet.connect(context.signers.admin).setLiquidatorShare(decimal(1, 17)))
  await runTx(context.controlFacet.connect(context.signers.admin).setLiquidationTimeout(100))
  await runTx(context.controlFacet.connect(context.signers.admin).setDeallocateCooldown(120))
  await runTx(context.controlFacet.connect(context.signers.admin).setBalanceLimitPerUser(decimal(100000)))

  let output: Addresses = loadAddresses()
  output.collateralAddress = collateral.address
  output.symmioAddress = diamond.address
  output.MulticallAddress = multicall?.address
  saveAddresses(output)
  return context
}

async function main() {
  let context = await initialize()
  console.log("Initialized successfully")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
