import {task, types} from "hardhat/config"

import {FacetCutAction, getSelectors} from "../utils/diamondCut"
import {writeData} from "../utils/fs"
import {generateGasReport} from "../utils/gas"
import {DEPLOYMENT_LOG_FILE, FacetNames} from "./constants"
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers"
import {ContractTransactionReceipt} from "ethers"

task("deploy:diamond", "Deploys the Diamond contract")
	.addParam("logData", "Write the deployed addresses to a data file", true, types.boolean)
	.addParam("reportGas", "Report gas consumption and costs", true, types.boolean)
	.setAction(async ({logData, reportGas}, {ethers}) => {
		const signers: SignerWithAddress[] = await ethers.getSigners()
		const owner: SignerWithAddress = signers[0]
		let totalGasUsed = BigInt(0)
		let receipt: ContractTransactionReceipt

		// Deploy DiamondCutFacet
		const DiamondCutFacetFactory = await ethers.getContractFactory("DiamondCutFacet")
		const diamondCutFacet = await DiamondCutFacetFactory.deploy()
		await diamondCutFacet.waitForDeployment()
		receipt = (await diamondCutFacet.deploymentTransaction()!.wait())!
		totalGasUsed = totalGasUsed + BigInt(receipt.gasUsed.toString())
		console.log("DiamondCutFacet deployed:", await diamondCutFacet.getAddress())

		// Deploy Diamond
		const DiamondFactory = await ethers.getContractFactory("Diamond")
		const diamond = await DiamondFactory.deploy(owner.address, await diamondCutFacet.getAddress())
		await diamond.waitForDeployment()
		receipt = (await diamond.deploymentTransaction()!.wait())!
		totalGasUsed = totalGasUsed + BigInt(receipt.gasUsed.toString())
		console.log("Diamond deployed:", await diamond.getAddress())

		// Deploy DiamondInit
		const DiamondInit = await ethers.getContractFactory("DiamondInit")
		const diamondInit = await DiamondInit.deploy()
		await diamondInit.waitForDeployment()
		receipt = (await diamondInit.deploymentTransaction()!.wait())!
		totalGasUsed = totalGasUsed + BigInt(receipt.gasUsed.toString())
		console.log("DiamondInit deployed:", await diamondInit.getAddress())

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
			await facet.waitForDeployment()
			receipt = (await facet.deploymentTransaction()!.wait())!
			totalGasUsed = totalGasUsed + BigInt(receipt.gasUsed.toString())
			console.log(`${facetName} deployed: ${await facet.getAddress()}`)
			cut.push({
				facetAddress: await facet.getAddress(),
				action: FacetCutAction.Add,
				functionSelectors: getSelectors(facet as any).selectors,
			})

			deployedFacets.push({
				name: facetName,
				address: await facet.getAddress(),
			})
		}

		// Upgrade Diamond with Facets
		const diamondCut = await ethers.getContractAt("IDiamondCut", await diamond.getAddress())

		// Call Initializer
		const call = diamondInit.interface.encodeFunctionData("init")
		const tx = await diamondCut.diamondCut(cut, await diamondInit.getAddress(), call)
		receipt = (await tx.wait())!
		totalGasUsed = totalGasUsed + BigInt(receipt.gasUsed.toString())

		if (!receipt.status) {
			throw Error(`Diamond upgrade failed: ${tx.hash}`)
		}
		console.log("Completed Diamond Cut")

		// if (reportGas) { //FIXME
		// 	await generateGasReport(ethers.provider as any, totalGasUsed)
		// }

		// Write addresses to JSON file for etherscan verification
		if (logData) {
			writeData(DEPLOYMENT_LOG_FILE, [
				{
					name: "DiamondCut",
					address: await diamondCutFacet.getAddress(),
					constructorArguments: [],
				},
				{
					name: "Diamond",
					address: await diamond.getAddress(),
					constructorArguments: [owner.address, await diamondCutFacet.getAddress()],
				},
				{
					name: "DiamondInit",
					address: await diamondInit.getAddress(),
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
