import { task } from "hardhat/config"

import { readData } from "../utils/fs"
import { DEPLOYMENT_LOG_FILE } from "./constants"

task("verify:deployment", "Verifies the deployed contracts").setAction(async (_, { run }) => {
  const deployedAddresses = readData(DEPLOYMENT_LOG_FILE)

  for (const address of deployedAddresses) {
    try {
      console.log(`Verifying ${address.address}`)
      await run("verify:verify", {
        address: address.address,
        constructorArguments: address.constructorArguments,
      })
    } catch (err) {
      console.error(err)
    }
  }
})
