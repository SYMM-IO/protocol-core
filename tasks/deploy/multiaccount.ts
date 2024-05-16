import { task, types } from "hardhat/config"
import { fileExists, readData, writeData } from "../utils/fs"
import { DEPLOYMENT_LOG_FILE } from "./constants"

task("deploy:multiAccount", "Deploys the MultiAccount")
  .addParam("symmioAddress", "The address of the Symmio contract")
  .addParam("admin", "The admin address")
  .addOptionalParam("logData", "Write the deployed addresses to a data file", true, types.boolean)
  .setAction(async ({ symmioAddress, admin, logData }, { ethers, upgrades, run }) => {
    console.log("Running deploy:multiAccount")

    const [deployer] = await ethers.getSigners()

    console.log("Deploying contracts with the account:", deployer.address)

    const SymmioPartyA = await ethers.getContractFactory("SymmioPartyA")

    // Deploy MultiAccount as upgradeable
    const Factory = await ethers.getContractFactory("MultiAccount")
    console.log(admin, symmioAddress)
    const contract = await upgrades.deployProxy(Factory, [admin, symmioAddress, SymmioPartyA.bytecode], { initializer: "initialize" })
    await contract.deployed()

    const addresses = {
      proxy: contract.address,
      admin: await upgrades.erc1967.getAdminAddress(contract.address),
      implementation: await upgrades.erc1967.getImplementationAddress(contract.address),
    }
    console.log("MultiAccount deployed to", addresses)

    if (logData) {
      // Ensure the log file exists
      if (!fileExists(DEPLOYMENT_LOG_FILE)) {
        writeData(DEPLOYMENT_LOG_FILE, [])
        console.log(`Created new log file: ${DEPLOYMENT_LOG_FILE}`)
      }

      // Read existing data
      let deployedData = []
      try {
        deployedData = readData(DEPLOYMENT_LOG_FILE)
      } catch (err) {
        console.error(`Could not read existing JSON file: ${err}`)
      }

      // Append new data
      deployedData.push(
        {
          name: "MultiAccountProxy",
          address: contract.address,
          constructorArguments: [admin, symmioAddress, SymmioPartyA.bytecode],
        },
        {
          name: "MultiAccountAdmin",
          address: addresses.admin,
          constructorArguments: [],
        },
        {
          name: "MultiAccountImplementation",
          address: addresses.implementation,
          constructorArguments: [],
        },
      )

      // Write updated data back to JSON file
      writeData(DEPLOYMENT_LOG_FILE, deployedData)
      console.log("Deployed addresses written to JSON file")
    }

    return contract
  })
