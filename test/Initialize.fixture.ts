import {ethers, run} from "hardhat"

import {createRunContext, RunContext} from "./models/RunContext"
import {decimal} from "./utils/Common"
import {toUtf8Bytes} from "ethers"

export async function initializeFixture(): Promise<RunContext> {
	let collateral = await run("deploy:stablecoin")
	let diamond = await run("deploy:diamond", {
		logData: false,
		genABI: false,
		reportGas: true,
	})
	let multicall = process.env.DEPLOY_MULTICALL == "true" ? await run("deploy:multicall") : undefined

	const multiAccount = await run("deploy:multiAccount", {
		symmioAddress: await diamond.getAddress(),
		admin: process.env.ADMIN_PUBLIC_KEY
	})
	const multiAccount2 = await run("deploy:multiAccount", {
		symmioAddress: await diamond.getAddress(),
		admin: process.env.ADMIN_PUBLIC_KEY
	})

	let context = await createRunContext(await diamond.getAddress(), await collateral.getAddress(), await multiAccount.getAddress(), await multiAccount2.getAddress(), true)

	await context.controlFacet.connect(context.signers.admin).setAdmin(context.signers.admin.getAddress())

	await context.controlFacet.connect(context.signers.admin).setCollateral(await context.collateral.getAddress())

	await context.controlFacet
		.connect(context.signers.admin)
		.grantRole(context.signers.admin.getAddress(), ethers.keccak256(toUtf8Bytes("SYMBOL_MANAGER_ROLE")))
	await context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), ethers.keccak256(toUtf8Bytes("SETTER_ROLE")))
	await context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), ethers.keccak256(toUtf8Bytes("PAUSER_ROLE")))
	await context.controlFacet
		.connect(context.signers.admin)
		.grantRole(context.signers.admin.getAddress(), ethers.keccak256(toUtf8Bytes("PARTY_B_MANAGER_ROLE")))
	context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), ethers.keccak256(toUtf8Bytes("AFFILIATE_MANAGER_ROLE"))),
		await context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), ethers.keccak256(toUtf8Bytes("LIQUIDATOR_ROLE")))
	await context.controlFacet
		.connect(context.signers.admin)
		.grantRole(context.signers.liquidator.getAddress(), ethers.keccak256(toUtf8Bytes("LIQUIDATOR_ROLE")))

	await context.controlFacet.connect(context.signers.admin).addSymbol("BTCUSDT", decimal(5n), decimal(1n, 16), decimal(1n, 16), decimal(100n), 28800, 900)

	await context.controlFacet.connect(context.signers.admin).setPendingQuotesValidLength(10)
	await context.controlFacet.connect(context.signers.admin).setLiquidatorShare(decimal(1n, 17))
	await context.controlFacet.connect(context.signers.admin).setLiquidationTimeout(100)
	await context.controlFacet.connect(context.signers.admin).setDeallocateCooldown(120)
	await context.controlFacet.connect(context.signers.admin).setSettlementCooldown(300)
	await context.controlFacet.connect(context.signers.admin).setDeallocateDebounceTime(120)
	await context.controlFacet.connect(context.signers.admin).setBalanceLimitPerUser(decimal(10000n))
	await context.controlFacet.connect(context.signers.admin).setForceCloseCooldowns(300, 120)
	await context.controlFacet.connect(context.signers.admin).registerPartyB(context.signers.hedger.getAddress())
	await context.controlFacet.connect(context.signers.admin).registerPartyB(context.signers.hedger2.getAddress())
	await context.controlFacet.connect(context.signers.admin).registerAffiliate(context.multiAccount)
	await context.controlFacet.connect(context.signers.admin).registerAffiliate(context.multiAccount2!)
	await context.controlFacet.connect(context.signers.admin).setFeeCollector(context.multiAccount, context.signers.feeCollector.address)
	await context.controlFacet.connect(context.signers.admin).setFeeCollector(context.multiAccount2!, context.signers.feeCollector2.address)

	return context
}
