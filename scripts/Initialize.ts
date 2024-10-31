import {ethers, run} from "hardhat"

import {createRunContext, RunContext} from "../test/models/RunContext"
import {decimal} from "../test/utils/Common"
import {runTx} from "../test/utils/TxUtils"
import {ControlFacet} from "../src/types"
import {symbolsMock} from "../test/models/SymbolManager"
import {Addresses, loadAddresses, saveAddresses} from "./utils/file"
import {toUtf8Bytes} from "ethers"
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers"

export async function initialize(): Promise<RunContext> {
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
	let context = await createRunContext(await diamond.getAddress(), await collateral.getAddress(), await multiAccount.getAddress(), undefined, true)

	await runTx(context.controlFacet.connect(context.signers.admin).setAdmin(context.signers.admin.getAddress()))
	await runTx(context.controlFacet.connect(context.signers.admin).setCollateral(await context.collateral.getAddress()))
	await runTx(
		context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), ethers.keccak256(toUtf8Bytes("SYMBOL_MANAGER_ROLE"))),
	)
	await runTx(
		context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), ethers.keccak256(toUtf8Bytes("SETTER_ROLE"))),
	)
	await runTx(
		context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), ethers.keccak256(toUtf8Bytes("PAUSER_ROLE"))),
	)
	await runTx(
		context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), ethers.keccak256(toUtf8Bytes("PARTY_B_MANAGER_ROLE"))),
	)
	await runTx(
		context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), ethers.keccak256(toUtf8Bytes("AFFILIATE_MANAGER_ROLE"))),
	)
	await runTx(
		context.controlFacet.connect(context.signers.admin).grantRole(context.signers.admin.getAddress(), ethers.keccak256(toUtf8Bytes("LIQUIDATOR_ROLE"))),
	)
	await runTx(
		context.controlFacet.connect(context.signers.admin).grantRole(context.signers.user.getAddress(), ethers.keccak256(toUtf8Bytes("LIQUIDATOR_ROLE"))),
	)
	await runTx(
		context.controlFacet.connect(context.signers.admin).grantRole(context.signers.user2.getAddress(), ethers.keccak256(toUtf8Bytes("LIQUIDATOR_ROLE"))),
	)
	const addSymbolAsync = async (controlFacet: ControlFacet, adminSigner: SignerWithAddress, sym: any) => {
		await runTx(
			controlFacet
				.connect(adminSigner)
				.addSymbol(sym.name, sym.min_acceptable_quote_value, sym.min_acceptable_portion_lf, sym.trading_fee, decimal(100n, 18), 28800, 900),
		)
	}

	for (const sym of symbolsMock.symbols)
		await addSymbolAsync(context.controlFacet, context.signers.admin, sym)

	await runTx(context.controlFacet.connect(context.signers.admin).setPendingQuotesValidLength(100))
	await runTx(context.controlFacet.connect(context.signers.admin).setLiquidatorShare(decimal(1n, 17)))
	await runTx(context.controlFacet.connect(context.signers.admin).setLiquidationTimeout(100))
	await runTx(context.controlFacet.connect(context.signers.admin).setDeallocateCooldown(120))
	await runTx(context.controlFacet.connect(context.signers.admin).setBalanceLimitPerUser(decimal(100000n)))
	await runTx(context.controlFacet.connect(context.signers.admin).registerAffiliate(context.multiAccount))
	await runTx(context.controlFacet.connect(context.signers.admin).setFeeCollector(context.multiAccount, context.signers.feeCollector.address))

	let output: Addresses = loadAddresses()
	output.collateralAddress = await collateral.getAddress()
	output.symmioAddress = await diamond.getAddress()
	output.MulticallAddress = await multicall?.getAddress()
	saveAddresses(output)
	return context
}

async function main() {
	await initialize()
	console.log("Initialized successfully")
}

main().catch(error => {
	console.error(error)
	process.exitCode = 1
})
