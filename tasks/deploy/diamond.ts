import { TransactionReceipt } from "@ethersproject/providers"
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { task, types } from "hardhat/config"

import { FacetCutAction, getSelectors } from "../utils/diamondCut"
import { readData, writeData } from "../utils/fs"
import { generateGasReport } from "../utils/gas"
import { FacetNames } from "./constants"

const JSON_FILE_NAME = "deployed.json"

task("verify:deployment", "Verifies the initial deployment").setAction(async (_, { run }) => {
	const deployedAddresses = readData(JSON_FILE_NAME)

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

task("deploy:diamond", "Deploys the Diamond contract")
  .addParam("logData", "Write the deployed addresses to a data file", true, types.boolean)
  .addParam("reportGas", "Report gas consumption and costs", true, types.boolean)
  .setAction(async ({ logData, reportGas }, { ethers }) => {
	  const signers: SignerWithAddress[] = await ethers.getSigners()
	  const owner: SignerWithAddress = signers[0]
	  let totalGasUsed = ethers.BigNumber.from(0)
	  let receipt: TransactionReceipt

	  // Deploy DiamondCutFacet
	  const DiamondCutFacetFactory = await ethers.getContractFactory("DiamondCutFacet")
	  const diamondCutFacet = await DiamondCutFacetFactory.deploy()
	  await diamondCutFacet.deployed()
	  receipt = await diamondCutFacet.deployTransaction.wait()
	  totalGasUsed = totalGasUsed.add(receipt.gasUsed)
	  console.log("DiamondCutFacet deployed:", diamondCutFacet.address)

	  // Deploy Diamond
	  const DiamondFactory = await ethers.getContractFactory("Diamond")
	  const diamond = await DiamondFactory.deploy(owner.address, diamondCutFacet.address)
	  await diamond.deployed()
	  receipt = await diamond.deployTransaction.wait()
	  totalGasUsed = totalGasUsed.add(receipt.gasUsed)
	  console.log("Diamond deployed:", diamond.address)

	  // Deploy DiamondInit
	  const DiamondInit = await ethers.getContractFactory("DiamondInit")
	  const diamondInit = await DiamondInit.deploy()
	  await diamondInit.deployed()
	  receipt = await diamondInit.deployTransaction.wait()
	  totalGasUsed = totalGasUsed.add(receipt.gasUsed)
	  console.log("DiamondInit deployed:", diamondInit.address)

	  // Deploy Facets
	  const cut: Array<{
		  facetAddress: string;
		  action: FacetCutAction;
		  functionSelectors: string[];
	  }> = []

	  const deployedFacets: Array<{
		  name: string;
		  address: string;
	  }> = []

	  console.log("Deploying facets: ", FacetNames)
	  for (const facetName of FacetNames) {
		  const FacetFactory = await ethers.getContractFactory(facetName)
		  const facet = await FacetFactory.deploy()
		  await facet.deployed()
		  receipt = await facet.deployTransaction.wait()
		  totalGasUsed = totalGasUsed.add(receipt.gasUsed)
		  console.log(`${facetName} deployed: ${facet.address}`)

		  cut.push({
			  facetAddress: facet.address,
			  action: FacetCutAction.Add,
			  functionSelectors: getSelectors(facet).selectors,
		  })

		  deployedFacets.push({
			  name: facetName,
			  address: facet.address,
		  })
	  }

	  // Upgrade Diamond with Facets
	  const diamondCut = await ethers.getContractAt("IDiamondCut", diamond.address)

	  // Call Initializer
	  const call = diamondInit.interface.encodeFunctionData("init")
	  const tx = await diamondCut.diamondCut(cut, diamondInit.address, call)
	  receipt = await tx.wait()
	  totalGasUsed = totalGasUsed.add(receipt.gasUsed)

	  if (!receipt.status) {
		  throw Error(`Diamond upgrade failed: ${tx.hash}`)
	  }
	  console.log("Completed Diamond Cut")

	  if (reportGas) {
		  await generateGasReport(ethers.provider, totalGasUsed)
	  }

	  // Write addresses to JSON file for etherscan verification
	  if (logData) {
		  writeData(JSON_FILE_NAME, [
			  {
				  name: "DiamondCut",
				  address: diamondCutFacet.address,
				  constructorArguments: [],
			  },
			  {
				  name: "Diamond",
				  address: diamond.address,
				  constructorArguments: [owner.address, diamondCutFacet.address],
			  },
			  {
				  name: "DiamondInit",
				  address: diamondInit.address,
				  constructorArguments: [],
			  },
			  ...deployedFacets.map(facet => ({
				  name: facet.name,
				  address: facet.address,
				  constructorArguments: [],
			  })),
		  ])
		  console.log("Deployed addresses written to json file")
	  }

	  return diamond
  })
