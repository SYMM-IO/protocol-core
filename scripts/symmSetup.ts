import { ethers } from "hardhat"
import fs from "fs"
import { loadAddresses } from "./utils/file"

async function main() {
	const configFile = "scripts/config/setup.json"
	const symmioAddress = loadAddresses().symmioAddress

	if (!configFile || !symmioAddress) {
		console.error("Error: Configuration file or Symmio contract address is inaccessible.")
		process.exit(1)
	}

	const config = JSON.parse(fs.readFileSync(configFile, "utf8"))

	const controlFacetFactory = await ethers.getContractFactory("ControlFacet")
	const controlFacet = controlFacetFactory.attach(symmioAddress) as any

	const owner = (await ethers.getSigners())[0]

	const viewFacetFactory = await ethers.getContractFactory("ViewFacet")
	const viewFacet = viewFacetFactory.attach(symmioAddress) as any

	// Helper function to execute a transaction and wait for confirmation
	async function executeAndWait(txPromise: any, actionDescription: string) {
		try {
			console.log(`Initiating: ${actionDescription}...`)
			const tx = await txPromise
			console.log(`Transaction submitted: ${tx.hash}`)
			const receipt = await tx.wait()
			if (receipt.status === 1) {
				console.log(`Success: ${actionDescription}. Gas used: ${receipt.gasUsed.toString()}`)
				return true
			} else {
				console.error(`Failed: ${actionDescription}. Transaction reverted.`)
				return false
			}
		} catch (error) {
			console.error(`Error during ${actionDescription}:`, error)
			return false
		}
	}

	async function executeViewCall(viewCall: any, actionDescription: string) {
		try {
			console.log(`Calling: ${actionDescription}...`)
			const result = await viewCall
			console.log(`Success: ${actionDescription}.`)
			return result
		} catch (error) {
			console.error(`Error during ${actionDescription}:`, error)
			return null
		}
	}


	if (config.admin) {
		await executeAndWait(controlFacet.connect(owner).setAdmin(config.admin), `Admin configuration. Assigned admin: ${config.admin}`)
	}

	if (config.grantRoles) {
		for (const { roleUser, role } of config.grantRoles) {
			if (roleUser && role) {
				await executeAndWait(controlFacet.connect(owner).grantRole(roleUser, role), `Role grant. User: ${roleUser}, Role: ${role}`)
			}
		}
	}

	if (config.revokeRoles) {
		for (const { roleUser, role } of config.revokeRoles) {
			if (roleUser && role) {
				await executeAndWait(controlFacet.connect(owner).revokeRole(roleUser, role), `Role revocation. User: ${roleUser}, Role: ${role}`)
			}
		}
	}

	if (config.partyBs) {
		for (const partyB of config.partyBs) {
			if (partyB) {
				await executeAndWait(controlFacet.connect(owner).registerPartyB(partyB), `Party B registration. Address: ${partyB}`)
			}
		}
	}

	if (config.affiliates) {
		for (const { affiliate, feeCollector } of config.affiliates) {
			if (affiliate) {
				if ((await viewFacet.connect(owner).isAffiliate(affiliate)) == false) {
					await executeAndWait(controlFacet.connect(owner).registerAffiliate(affiliate), `Affiliate registration. Address: ${affiliate}`)
				}
				if (feeCollector) {
					await executeAndWait(
						controlFacet.connect(owner).setFeeCollector(affiliate, feeCollector),
						`Fee collector assignment for affiliate ${affiliate}. Collector: ${feeCollector}`,
					)
				}
			}
		}
	}

	if (config.muon) {
		if (config.muon.upnlValidTime && config.muon.priceValidTime) {
			await executeAndWait(
				controlFacet.connect(owner).setMuonConfig(config.muon.upnlValidTime, config.muon.priceValidTime),
				`Muon configuration. uPNL Valid Time: ${config.muon.upnlValidTime}, Price Valid Time: ${config.muon.priceValidTime}`,
			)
		}
		if (config.muon.muonAppId && config.muon.validGateway && config.muon.publicKey) {
			await executeAndWait(
				controlFacet.connect(owner).setMuonIds(config.muon.muonAppId, config.muon.validGateway, config.muon.publicKey),
				`Muon identifiers configuration. App ID: ${config.muon.muonAppId}, Valid Gateway: ${config.muon.validGateway}`,
			)
		}
	}

	if (config.collateral) {
		await executeAndWait(controlFacet.connect(owner).setCollateral(config.collateral), `Collateral token setting. Address: ${config.collateral}`)
	}

	if (config.pendingQuotesValidLength) {
		await executeAndWait(
			controlFacet.connect(owner).setPendingQuotesValidLength(config.pendingQuotesValidLength),
			`Pending quotes valid length configuration. Length: ${config.pendingQuotesValidLength}`,
		)
	}

	if (config.defaultFeeCollector) {
		await executeAndWait(
			controlFacet.connect(owner).setDefaultFeeCollector(config.defaultFeeCollector),
			`Default fee collector setting. Address: ${config.defaultFeeCollector}`,
		)
	}

	if (config.deallocateDebounceTime) {
		await executeAndWait(
			controlFacet.connect(owner).setDeallocateDebounceTime(config.deallocateDebounceTime),
			`Deallocate debounce time configuration. Duration: ${config.deallocateDebounceTime} seconds`,
		)
	}

	if (config.invalidBridgedAmountsPool) {
		await executeAndWait(
			controlFacet.connect(owner).setInvalidBridgedAmountsPool(config.invalidBridgedAmountsPool),
			`Invalid bridged amounts pool setting. Pool Address: ${config.invalidBridgedAmountsPool}`,
		)
	}

	if (config.symbols) {
		let old_symbols = await executeViewCall(viewFacet.getSymbols(0, 1000), `Getting old symbols`)

		// Build a Set of existing symbol names for fast lookup
		const oldSymbolNames = new Set(old_symbols.map((symbol: { name: any }) => symbol.name))

		// Filter and clean symbols from config
		const symbolsForAdd = config.symbols
			.filter((symbol: { name: unknown }) => !oldSymbolNames.has(symbol.name)) // Keep only new symbols
			.map(({ forceCloseGapRatio, ...rest }) => rest)     // Remove forceCloseGapRatio


		// Define batch size for pagination
		const BATCH_SIZE = 100

		// Process symbols in batches if there are many
		if (symbolsForAdd.length > BATCH_SIZE) {
			console.log(`Adding ${symbolsForAdd.length} symbols in batches of ${BATCH_SIZE}...`)
			let symbols_added_success = true

			// Split symbols into batches
			for (let i = 0; i < symbolsForAdd.length; i += BATCH_SIZE) {
				const batch = symbolsForAdd.slice(i, i + BATCH_SIZE)
				console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(symbolsForAdd.length / BATCH_SIZE)}`)
				console.log(batch[0])
				// Add the current batch of symbols
				symbols_added_success = symbols_added_success && await executeAndWait(controlFacet.connect(owner).addSymbols(batch), `Symbol batch addition. Batch size: ${batch.length}`)
			}

			if (symbols_added_success) console.log(`All ${symbolsForAdd.length} symbols added successfully in ${Math.ceil(symbolsForAdd.length / BATCH_SIZE)} batches`)
			else console.log(`Failed to add all symbols`)
		} else {
			// Add all symbols at once if the list is not too long
			await executeAndWait(controlFacet.connect(owner).addSymbols(symbolsForAdd), `Symbol batch addition. Total symbols: ${symbolsForAdd.length}`)
		}

		let symbols_added = await executeViewCall(viewFacet.getSymbols(0, 1000), `Getting symbols`)

		// Create a lookup map by name from the fetched symbols
		const nameToIdMap = new Map<string, Number>()
		for (const symbol of symbols_added) {
			nameToIdMap.set(symbol.name, symbol.symbolId)
		}

		const correctedSymbols = config.symbols.map((symbol: { name: string }) => {
			const correctId = nameToIdMap.get(symbol.name)
			if (correctId) {
				return { ...symbol, symbolId: correctId }
			} else {
				console.warn(`Symbol name not found in fetched list: ${symbol.name}`)
			}
		})

		// Set additional symbol properties one by one
		for (const symbol of correctedSymbols) {
			// Set symbol validation state if provided
			if (symbol.symbolId !== undefined && symbol.isValid !== undefined) {
				await executeAndWait(
					controlFacet.connect(owner).setSymbolValidationState(symbol.symbolId, symbol.isValid),
					`Symbol validation state setting. Symbol ID: ${symbol.symbolId}, Status: ${symbol.isValid}`,
				)
			}
			// Set force close gap ratio if provided
			if (symbol.forceCloseGapRatio !== undefined && symbol.symbolId !== undefined) {
				await executeAndWait(
					controlFacet.connect(owner).setForceCloseGapRatio(symbol.symbolId, symbol.forceCloseGapRatio),
					`Force close gap ratio setting. Symbol ID: ${symbol.symbolId}, Ratio: ${symbol.forceCloseGapRatio}`,
				)
			}
		}
	}

	if (config.deallocateCooldown) {
		await executeAndWait(
			controlFacet.connect(owner).setDeallocateCooldown(config.deallocateCooldown),
			`Deallocate Cooldown configuration. Cooldown: ${config.deallocateCooldown}`,
		)
	}

	if (config.forceCancelCooldown) {
		await executeAndWait(
			controlFacet.connect(owner).setForceCancelCooldown(config.forceCancelCooldown),
			`Force Cancel Cooldown configuration. Cooldown: ${config.forceCancelCooldown}`,
		)
	}

	if (config.forceCloseFirstCooldown && config.forceCloseSecondCooldown) {
		await executeAndWait(
			controlFacet.connect(owner).setForceCloseCooldowns(config.forceCloseFirstCooldown, config.forceCloseSecondCooldown),
			`Force Close First Cooldown configuration. Cooldown: ${config.forceCloseFirstCooldown},
Force Close Second Cooldown configuration. Cooldown: ${config.forceCloseSecondCooldown}`,
		)
	}

	if (config.forceClosePricePenalty) {
		await executeAndWait(
			controlFacet.connect(owner).setForceClosePricePenalty(config.forceClosePricePenalty),
			`Force Close Price Penalty configuration. Penalty: ${config.forceClosePricePenalty}`,
		)
	}

	if (config.forceCloseMinSigPeriod) {
		await executeAndWait(
			controlFacet.connect(owner).setForceCloseMinSigPeriod(config.forceCloseMinSigPeriod),
			`Force Close Min Sig Period configuration. Period: ${config.forceCloseMinSigPeriod}`,
		)
	}

	if (config.forceCancelCloseCooldown) {
		await executeAndWait(
			controlFacet.connect(owner).setForceCancelCloseCooldown(config.forceCancelCloseCooldown),
			`Force Cancel Close Cooldown configuration. Cooldown: ${config.forceCancelCloseCooldown}`,
		)
	}

	if (config.liquidatorShare) {
		await executeAndWait(
			controlFacet.connect(owner).setLiquidatorShare(config.liquidatorShare),
			`Liquidator Share configuration. Share: ${config.liquidatorShare}`,
		)
	}

	if (config.settlementCooldown) {
		await executeAndWait(
			controlFacet.connect(owner).setSettlementCooldown(config.settlementCooldown),
			`Settlement Cooldown configuration. Cooldown: ${config.settlementCooldown}`,
		)
	}

	if (config.liquidationTimeout) {
		await executeAndWait(
			controlFacet.connect(owner).setLiquidationTimeout(config.liquidationTimeout),
			`Liquidation Timeout configuration. Duration: ${config.liquidationTimeout} seconds`,
		)
	}

	if (config.balanceLimitPerUser) {
		await executeAndWait(
			controlFacet.connect(owner).setBalanceLimitPerUser(config.balanceLimitPerUser),
			`Balance Limit Per User configuration. Amount: ${config.balanceLimitPerUser}`,
		)
	}

	if (config.bridges) {
		for (const bridge of config.bridges) {
			if (bridge) {
				await executeAndWait(controlFacet.connect(owner).addBridge(bridge), `Bridge addition. Bridge Address: ${bridge}`)
			}
		}
	}

	console.log("ControlFacet initialization process completed successfully.")
}

main().catch(error => {
	console.error("Initialization process failed with error:", error)
	process.exit(1)
})