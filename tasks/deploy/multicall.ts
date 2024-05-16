import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { task, types } from "hardhat/config"
import { readData, writeData } from "../utils/fs"
import { DEPLOYMENT_LOG_FILE } from "./constants"

task("deploy:multicall", "Deploys the Multicall")
  .addOptionalParam("logData", "Write the deployed addresses to a data file", true, types.boolean)
  .setAction(async ({ logData }, { ethers, run }) => {
    console.log("Running deploy:multicall")

    const signers: SignerWithAddress[] = await ethers.getSigners()
    const owner: SignerWithAddress = signers[0]

    const Factory = await ethers.getContractFactory("Multicall3")
    const multicall = await Factory.connect(owner).deploy()
    await multicall.deployed()

    await multicall.deployTransaction.wait()
    console.log("Multicall3 deployed:", multicall.address)

    if (logData) {
      // Read existing data
      let deployedData = []
      try {
        deployedData = readData(DEPLOYMENT_LOG_FILE)
      } catch (err) {
        console.error(`Could not read existing JSON file: ${err}`)
      }

      // Append new data
      deployedData.push({
        name: "Multicall3",
        address: multicall.address,
        constructorArguments: [],
      })

      // Write updated data back to JSON file
      writeData(DEPLOYMENT_LOG_FILE, deployedData)
      console.log("Deployed addresses written to JSON file")
    }

    return multicall
  })
