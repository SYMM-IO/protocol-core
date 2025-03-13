import { ethers } from 'hardhat';
import fs from 'fs';
import { loadAddresses } from "./utils/file";

async function main() {
	const configFile = "scripts/config/setup.json";
	const symmioAddress = loadAddresses().symmioAddress;

	if (!configFile || !symmioAddress) {
		console.error("Usage: ts-node initializeControlFacet.ts <configFile> <symmioAddress>");
		process.exit(1);
	}

	const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

	const controlFacetFactory = await ethers.getContractFactory("ControlFacet");
	const controlFacet = controlFacetFactory.attach(symmioAddress);

	const owner = (await ethers.getSigners())[0];

	const viewFacetFactory = await ethers.getContractFactory("ViewFacet");
	const viewFacet = viewFacetFactory.attach(symmioAddress);

	if (config.admin) {
		await controlFacet.connect(owner).setAdmin(config.admin);
		console.log(`setAdmin called with admin: ${config.admin}`);
	}

	if (config.roles) {
		for (const { roleUser, role } of config.roles) {
			if (roleUser && role) {
				await controlFacet.connect(owner).grantRole(roleUser, role);
				console.log(`grantRole called with roleUser: ${roleUser}, role: ${role}`);
			}
		}
	}

	if (config.partyBs) {
		for (const partyB of config.partyBs) {
			if (partyB) {
				await controlFacet.connect(owner).registerPartyB(partyB);
				console.log(`registerPartyB called with partyB: ${partyB}`);
			}
		}
	}

	if (config.affiliates) {
		for (const { affiliate, feeCollector } of config.affiliates) {
				if (affiliate) {
				if (await viewFacet.connect(owner).isAffiliate(affiliate) == false) {
					await controlFacet.connect(owner).registerAffiliate(affiliate);
					console.log(`registerAffiliate called with affiliate: ${affiliate}`);
				}
				if (feeCollector) {
					await controlFacet.connect(owner).setFeeCollector(affiliate, feeCollector);
					console.log(`setFeeCollector called with affiliate: ${affiliate}, feeCollector: ${feeCollector}`);
				}
			}
		}
	}

	if (config.muon) {
		if (config.muon.upnlValidTime && config.muon.priceValidTime) {
			await controlFacet.connect(owner).setMuonConfig(config.muon.upnlValidTime, config.muon.priceValidTime);
			console.log(`setMuonConfig called with upnlValidTime: ${config.muon.upnlValidTime}, priceValidTime: ${config.muon.priceValidTime}`);
		}
		if (config.muon.muonAppId && config.muon.validGateway && config.muon.publicKey) {
			await controlFacet.connect(owner).setMuonIds(config.muon.muonAppId, config.muon.validGateway, config.muon.publicKey);
			console.log(`setMuonIds called with muonAppId: ${config.muon.muonAppId}, validGateway: ${config.muon.validGateway}`);
		}
	}

	if (config.collateral) {
		await controlFacet.connect(owner).setCollateral(config.collateral);
		console.log(`setCollateral called with collateral: ${config.collateral}`);
	}

	if (config.pendingQuotesValidLength) {
		await controlFacet.connect(owner).setPendingQuotesValidLength(config.pendingQuotesValidLength);
		console.log(`setPendingQuotesValidLength called with length: ${config.pendingQuotesValidLength}`);
	}

	if (config.defaultFeeCollector) {
		await controlFacet.connect(owner).setDefaultFeeCollector(config.defaultFeeCollector);
		console.log(`setDefaultFeeCollector called with feeCollector: ${config.defaultFeeCollector}`);
	}

	if (config.deallocateDebounceTime) {
		await controlFacet.connect(owner).setDeallocateDebounceTime(config.deallocateDebounceTime);
		console.log(`setDeallocateDebounceTime called with time: ${config.deallocateDebounceTime}`);
	}

	if (config.invalidBridgedAmountsPool) {
		await controlFacet.connect(owner).setInvalidBridgedAmountsPool(config.invalidBridgedAmountsPool);
		console.log(`setInvalidBridgedAmountsPool called with pool: ${config.invalidBridgedAmountsPool}`);
	}

	if (config.symbols) {
		const symbolsForAdd = config.symbols.map(({ forceCloseGapRatio, ...rest }) => rest);

		await controlFacet.connect(owner).addSymbols(symbolsForAdd);
		console.log(`addSymbols called with symbols: ${JSON.stringify(symbolsForAdd)}`);

		for (const symbol of config.symbols) {
			if (symbol.id !== undefined && symbol.isValid !== undefined) {
				await controlFacet.connect(owner).setSymbolValidationState(symbol.id, symbol.isValid);
				console.log(`setSymbolValidationState called with id: ${symbol.id}, isValid: ${symbol.isValid}`);
			}
			if (symbol.forceCloseGapRatio !== undefined) {
				await controlFacet.connect(owner).setForceCloseGapRatio(symbol.symbolId, symbol.forceCloseGapRatio);
				console.log(`setForceCloseGapRatio called with id: ${symbol.symbolId}, ratio: ${symbol.forceCloseGapRatio}`);
			}
		}
	}

	if (config.bridges) {
		for (const bridge of config.bridges) {
			if (bridge) {
				await controlFacet.connect(owner).addBridge(bridge);
				console.log(`addBridge called with bridge: ${bridge}`);
			}
		}
	}

	console.log("ControlFacet initialized successfully.");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
