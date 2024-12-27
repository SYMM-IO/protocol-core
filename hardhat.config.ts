import "@nomicfoundation/hardhat-chai-matchers"
import "@nomicfoundation/hardhat-toolbox"
import "@openzeppelin/hardhat-upgrades"
import { config as dotenvConfig } from "dotenv"
import type { HardhatUserConfig } from "hardhat/config"
import { resolve } from "path"
import "solidity-docgen"

import "./tasks/deploy"

// Load environment variables
const dotenvConfigPath: string = process.env.DOTENV_CONFIG_PATH || "./.env"
dotenvConfig({ path: resolve(__dirname, dotenvConfigPath) })

// Required environment variables
const privateKey: string | undefined = process.env.PRIVATE_KEY
if (!privateKey) throw new Error("Please set your PRIVATE_KEY in a .env file")

const privateKeyList: string[] = process.env.PRIVATE_KEYS_STR?.split(",") || []

export enum TestMode {
	STATIC = "STATIC",
	FUZZ = "FUZZ",
	PRE_UPGRADE = "PRE_UPGRADE",
}

// API Keys for different networks
const apiKeys = {
	arbitrum: process.env.ARBITRUM_API_KEY || "",
	bnb: process.env.BNB_API_KEY || "",
	base: process.env.BASE_API_KEY || "",
	polygon: process.env.POLYGON_API_KEY || "",
	zkEvm: process.env.ZKEVM_API_KEY || "",
	opBnb: process.env.OPBNB_API_KEY || "",
	iota: process.env.IOTA_API_KEY || "",
	mode: process.env.MODE_API_KEY || "",
	blast: process.env.BLAST_API_KEY || "",
	mantle: process.env.MANTLE_API_KEY || "",
	mantle2: process.env.MANTLE2_API_KEY || "",
}

// Default configuration
const config: HardhatUserConfig = {
	defaultNetwork: "hardhat",

	// Compiler settings
	solidity: {
		version: "0.8.18",
		settings: {
			metadata: {
				// Not including the metadata hash
				// https://github.com/paulrberg/hardhat-template/issues/31
				bytecodeHash: "none",
			},
			// Disable the optimizer when debugging
			// https://hardhat.org/hardhat-network/#solidity-optimizer-support
			optimizer: {
				enabled: true,
				runs: 200,
			},
			viaIR: true,
		},
	},

	// Network configurations
	networks: {
		hardhat: {
			forking:
				process.env.TEST_MODE != TestMode.STATIC
					? {
							url: "https://base-mainnet.infura.io/v3/{API_KEY}",
							blockNumber: 23478537,
					  }
					: undefined,
			loggingEnabled: false,
			allowUnlimitedContractSize: false,
		},
		docker: {
			url: process.env.HARDHAT_DOCKER_URL || "",
			allowUnlimitedContractSize: false,
			accounts: privateKeyList,
		},
		arbitrum: {
			url: "https://arbitrum.llamarpc.com",
			accounts: [privateKey],
		},
		bsc: {
			url: "https://binance.llamarpc.com",
			accounts: [privateKey],
		},
		opbnb: {
			url: "https://opbnb.publicnode.com",
			accounts: [privateKey],
		},
		base: {
			url: "https://base.llamarpc.com",
			accounts: [privateKey],
		},
		polygon: {
			url: "https://polygon-rpc.com",
			accounts: [privateKey],
		},
		zkEvm: {
			url: "https://zkevm-rpc.com",
			accounts: [privateKey],
		},
		iota: {
			url: "https://json-rpc.evm.iotaledger.net",
			accounts: [privateKey],
		},
		blast: {
			url: "https://rpc.blast.io",
			accounts: [privateKey],
		},
		mode: {
			url: "https://mainnet.mode.network",
			accounts: [privateKey],
		},
		mantle: {
			url: "https://mantle.drpc.org",
			accounts: [privateKey],
		},
		mantle2: {
			url: "https://mantle.drpc.org",
			accounts: [privateKey],
		},
	},

	// Block explorer API configurations
	etherscan: {
		apiKey: {
			arbitrumOne: apiKeys.arbitrum,
			iota: apiKeys.iota,
			mode: apiKeys.mode,
			// mode2: apiKeys.mode,
			blast: apiKeys.blast,
			bsc: apiKeys.bnb,
			base: apiKeys.base,
			polygon: apiKeys.polygon,
			// mantle: apiKeys.mantle,
			mantle: apiKeys.mantle2,
			zkEvm: apiKeys.zkEvm,
			opbnb: apiKeys.opBnb,
		},
		customChains: [
			{
				network: "base",
				chainId: 8453,
				urls: {
					apiURL: `https://api.basescan.org/api?apiKey=${apiKeys.base}`,
					browserURL: "https://basescan.org",
				},
			},
			{
				network: "zkEvm",
				chainId: 1101,
				urls: {
					apiURL: `https://api-zkevm.polygonscan.com/api?apikey=${apiKeys.zkEvm}`,
					browserURL: "https://zkevm.polygonscan.com",
				},
			},
			{
				network: "opbnb",
				chainId: 204,
				urls: {
					apiURL: `https://api-opbnb.bscscan.com/api?apikey=${apiKeys.opBnb}`,
					browserURL: "https://opbnb.bscscan.com",
				},
			},
			{
				network: "iota",
				chainId: 8822,
				urls: {
					apiURL: "https://explorer.evm.iota.org/api",
					browserURL: "https://explorer.evm.iota.org",
				},
			},
			// {
			//   network: "mode",
			//   chainId: 34443,
			//   urls: {
			//     apiURL: "https://explorer.mode.network/api",
			//     browserURL: "https://explorer.mode.network"
			//   }
			// },
			{
				network: "mode",
				chainId: 34443,
				urls: {
					apiURL: "https://api.routescan.io/v2/network/mainnet/evm/34443/etherscan",
					browserURL: "https://modescan.io",
				},
			},
			{
				network: "blast",
				chainId: 81457,
				urls: {
					apiURL: `https://api.blastscan.io/api?apiKey=${apiKeys.blast}`,
					browserURL: "https://blastscan.io",
				},
			},
			// {
			//   network: "mantle",
			//   chainId: 5000,
			//   urls: {
			//     apiURL: "https://explorer.mantle.xyz/api",
			//     browserURL: "https://explorer.mantle.xyz"
			//   }
			// },
			{
				network: "mantle",
				chainId: 5000,
				urls: {
					apiURL: "https://api.mantlescan.xyz/api",
					browserURL: "https://mantlescan.xyz",
				},
			},
		],
	},

	// Project structure
	paths: {
		artifacts: "./artifacts",
		cache: "./cache",
		sources: "./contracts",
		tests: "./test",
	},

	// Testing configuration
	gasReporter: {
		currency: "USD",
		enabled: true,
		excludeContracts: [],
		src: "./contracts",
	},

	typechain: {
		outDir: "src/types",
		target: "ethers-v6",
	},

	mocha: {
		timeout: 100000000,
	},
}

export default config
