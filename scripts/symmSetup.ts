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

	if (config.admin) {
		await controlFacet.connect(owner).setAdmin(config.admin)
		console.log(`Admin configuration completed. Assigned admin: ${config.admin}`)
	}

	if (config.grantRoles) {
		for (const { roleUser, role } of config.grantRoles) {
			if (roleUser && role) {
				await controlFacet.connect(owner).grantRole(roleUser, role)
				console.log(`Role granted successfully. User: ${roleUser}, Role: ${role}`)
			}
		}
	}

	if (config.revokeRoles) {
		for (const { roleUser, role } of config.revokeRoles) {
			if (roleUser && role) {
				await controlFacet.connect(owner).revokeRole(roleUser, role)
				console.log(`Role revoked successfully. User: ${roleUser}, Role: ${role}`)
			}
		}
	}

	if (config.partyBs) {
		for (const partyB of config.partyBs) {
			if (partyB) {
				await controlFacet.connect(owner).registerPartyB(partyB)
				console.log(`Party B registration completed. Address: ${partyB}`)
			}
		}
	}

	if (config.affiliates) {
		for (const { affiliate, feeCollector } of config.affiliates) {
			if (affiliate) {
				if ((await viewFacet.connect(owner).isAffiliate(affiliate)) == false) {
					await controlFacet.connect(owner).registerAffiliate(affiliate)
					console.log(`Affiliate registered successfully. Address: ${affiliate}`)
				}
				if (feeCollector) {
					await controlFacet.connect(owner).setFeeCollector(affiliate, feeCollector)
					console.log(`Fee collector assigned for affiliate ${affiliate}. Fee Collector Address: ${feeCollector}`)
				}
			}
		}
	}

	if (config.muon) {
		if (config.muon.upnlValidTime && config.muon.priceValidTime) {
			await controlFacet.connect(owner).setMuonConfig(config.muon.upnlValidTime, config.muon.priceValidTime)
			console.log(`Muon configuration set. uPNL Valid Time: ${config.muon.upnlValidTime}, Price Valid Time: ${config.muon.priceValidTime}`)
		}
		if (config.muon.muonAppId && config.muon.validGateway && config.muon.publicKey) {
			await controlFacet.connect(owner).setMuonIds(config.muon.muonAppId, config.muon.validGateway, config.muon.publicKey)
			console.log(`Muon identifiers configured. App ID: ${config.muon.muonAppId}, Valid Gateway: ${config.muon.validGateway}`)
		}
	}

	if (config.collateral) {
		await controlFacet.connect(owner).setCollateral(config.collateral)
		console.log(`Collateral token set successfully. Address: ${config.collateral}`)
	}

	if (config.pendingQuotesValidLength) {
		await controlFacet.connect(owner).setPendingQuotesValidLength(config.pendingQuotesValidLength)
		console.log(`Pending quotes valid length configured. Length: ${config.pendingQuotesValidLength}`)
	}

	if (config.defaultFeeCollector) {
		await controlFacet.connect(owner).setDefaultFeeCollector(config.defaultFeeCollector)
		console.log(`Default fee collector set. Address: ${config.defaultFeeCollector}`)
	}

	if (config.deallocateDebounceTime) {
		await controlFacet.connect(owner).setDeallocateDebounceTime(config.deallocateDebounceTime)
		console.log(`Deallocate debounce time configured. Duration: ${config.deallocateDebounceTime} seconds`)
	}

	if (config.invalidBridgedAmountsPool) {
		await controlFacet.connect(owner).setInvalidBridgedAmountsPool(config.invalidBridgedAmountsPool)
		console.log(`Invalid bridged amounts pool set. Pool Address: ${config.invalidBridgedAmountsPool}`)
	}

	if (config.symbols) {
		// Filter out forceCloseGapRatio from symbols for the addSymbols function
		const symbolsForAdd = config.symbols.map(({ forceCloseGapRatio, ...rest }) => rest)

		// Define batch size for pagination
		const BATCH_SIZE = 150

		// Process symbols in batches if there are many
		if (symbolsForAdd.length > BATCH_SIZE) {
			console.log(`Adding ${symbolsForAdd.length} symbols in batches of ${BATCH_SIZE}...`)

			// Split symbols into batches
			for (let i = 0; i < symbolsForAdd.length; i += BATCH_SIZE) {
				const batch = symbolsForAdd.slice(i, i + BATCH_SIZE)
				console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(symbolsForAdd.length / BATCH_SIZE)}`)

				// Add the current batch of symbols
				await controlFacet.connect(owner).addSymbols(batch)
				console.log(`Added batch of ${batch.length} symbols successfully`)
			}

			console.log(`All ${symbolsForAdd.length} symbols added successfully in ${Math.ceil(symbolsForAdd.length / BATCH_SIZE)} batches`)
		} else {
			// Add all symbols at once if the list is not too long
			await controlFacet.connect(owner).addSymbols(symbolsForAdd)
			console.log(`All ${symbolsForAdd.length} symbols added successfully in a single batch`)
		}

		// Set additional symbol properties one by one
		for (const symbol of config.symbols) {
			// Set symbol validation state if provided
			if (symbol.id !== undefined && symbol.isValid !== undefined) {
				await controlFacet.connect(owner).setSymbolValidationState(symbol.id, symbol.isValid)
				console.log(`Symbol validation state set. Symbol ID: ${symbol.id}, Validation Status: ${symbol.isValid}`)
			}

			// Set force close gap ratio if provided
			if (symbol.forceCloseGapRatio !== undefined && symbol.symbolId !== undefined) {
				await controlFacet.connect(owner).setForceCloseGapRatio(symbol.symbolId, symbol.forceCloseGapRatio)
				console.log(`Force close gap ratio set for Symbol ID ${symbol.symbolId}. Ratio: ${symbol.forceCloseGapRatio}`)
			}
		}
	}

	if (config.bridges) {
		for (const bridge of config.bridges) {
			if (bridge) {
				await controlFacet.connect(owner).addBridge(bridge)
				console.log(`Bridge added successfully. Bridge Address: ${bridge}`)
			}
		}
	}

	console.log("ControlFacet initialization process completed successfully.")
}

main().catch(error => {
	console.error("Initialization process failed with error:", error)
	process.exit(1)
})
