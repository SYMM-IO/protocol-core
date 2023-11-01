import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import { config as dotenvConfig } from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";
import { resolve } from "path";

import "./tasks/deploy";

const dotenvConfigPath: string = process.env.DOTENV_CONFIG_PATH || "./.env";
dotenvConfig({ path: resolve(__dirname, dotenvConfigPath) });

// Ensure that we have all the environment variables we need.
const privateKey: string | undefined = process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error("Please set your PRIVATE_KEY in a .env file");
}

const privateKeysStr: string | undefined = process.env.PRIVATE_KEYS_STR;
const privateKeyList: string[] = privateKeysStr?.split(",") || [];

const fantomRpcURL: string | undefined = process.env.FANTOM_RPC_URL;
if (!fantomRpcURL) {
  throw new Error("Please set your FANTOM_RPC_URL in a .env file");
}

const ftmscanAPIKey: string | undefined = process.env.FTMSCAN_API_KEY;
if (!ftmscanAPIKey) {
  throw new Error("Please set your FTMSCAN_API_KEY in a .env file");
}

const bscApiKey: string | undefined = process.env.BSC_API_KEY;
if (!bscApiKey) {
  throw new Error("Please set your BSC_API_KEY in a .env file");
}

const hardhatDockerUrl: string | undefined = process.env.HARDHAT_DOCKER_URL || "";

const APIKey: string = process.env.API_Key!;

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  gasReporter: {
    currency: "USD",
    enabled: true,
    excludeContracts: [],
    src: "./contracts",
  },
  networks: {
    hardhat: {
      // forking: {
      //   url: fantomRpcURL,
      // },
      allowUnlimitedContractSize: false,
    },
    docker: {
      url: hardhatDockerUrl,
      allowUnlimitedContractSize: false,
      accounts: privateKeyList,
    },
    fantom: {
      url: fantomRpcURL,
      accounts: privateKeyList,
    },
    bsc: {
      url: "https://1rpc.io/bnb",
      accounts: [privateKey],
    },
    polygon: {
      url: "https://rpc.ankr.com/polygon",
      accounts: [privateKey],
    },
    base: {
      url: "https://base.meowrpc.com",
      accounts: [privateKey],
    },
    bscTest: {
      url: "https://bsc-testnet.public.blastapi.io",
      accounts: [privateKey],
    },
  },
  etherscan: {
    apiKey: {
      opera: ftmscanAPIKey,
      bscTestnet: APIKey,
      bsc: bscApiKey,
      polygon:"ZGE5T95MWKDZB4ZH3127JY4Z37STM6HPKC",
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
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
  typechain: {
    outDir: "src/types",
    target: "ethers-v5",
  },
  mocha: {
    timeout: 100000000,
  },
};

export default config;
