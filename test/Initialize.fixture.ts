import { keccak256, toUtf8Bytes } from "ethers/lib/utils"
import { run } from "hardhat"

import { createRunContext, RunContext } from "./models/RunContext"
import { decimal } from "./utils/Common"

export async function initializeFixture(): Promise<RunContext> {
	let collateral = await run("deploy:stablecoin")
	let diamond = await run("deploy:diamond", {
		logData: false,
		genABI: false,
		reportGas: true,
	})
	let multicall = process.env.DEPLOY_MULTICALL == "true" ? await run("deploy:multicall") : undefined

	let context = await createRunContext(diamond.address, collateral.address)

	await context.controlFacet.connect(context.signers.admin).setAdmin(context.signers.admin.getAddress())

	await context.controlFacet.connect(context.signers.admin).setCollateral(context.collateral.address)

	await context.controlFacet
		.connect(context.signers.admin)
		.grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("SYMBOL_MANAGER_ROLE")))
	await context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("SETTER_ROLE")))
	await context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("PAUSER_ROLE")))
	await context.controlFacet
		.connect(context.signers.admin)
		.grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("PARTY_B_MANAGER_ROLE")))
	await context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), keccak256(toUtf8Bytes("LIQUIDATOR_ROLE")))
	await context.controlFacet
		.connect(context.signers.admin)
		.grantRole(context.signers.liquidator.getAddress(), keccak256(toUtf8Bytes("LIQUIDATOR_ROLE")))

	await context.controlFacet.connect(context.signers.admin).addSymbol("BTCUSDT", decimal(5), decimal(1, 16), decimal(1, 16), decimal(100), 28800, 900)

	await context.controlFacet.connect(context.signers.admin).setPendingQuotesValidLength(10)
	await context.controlFacet.connect(context.signers.admin).setLiquidatorShare(decimal(1, 17))
	await context.controlFacet.connect(context.signers.admin).setLiquidationTimeout(100)
	await context.controlFacet.connect(context.signers.admin).setDeallocateCooldown(120)
	await context.controlFacet.connect(context.signers.admin).setBalanceLimitPerUser(decimal(10000))
	await context.controlFacet.connect(context.signers.admin).setForceCloseCooldowns(300, 120)
	await context.controlFacet.connect(context.signers.admin).registerPartyB(context.signers.hedger.getAddress())
	await context.controlFacet.connect(context.signers.admin).registerPartyB(context.signers.hedger2.getAddress())

	return context
}
