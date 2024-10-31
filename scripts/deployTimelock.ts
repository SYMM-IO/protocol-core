import {ethers, run} from "hardhat"

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
	const [deployer] = await ethers.getSigners()

	console.log("Deploying contracts with the account:", deployer.address)

	const minDelay = 3 * 24 * 60 * 60 // 3 Days 259200

	const multiSig = ""
	const proposers = [multiSig]
	const executors = [multiSig]

	const TimelockController = await ethers.getContractFactory("SymmioTimelockController")
	const timelock = await TimelockController.deploy(minDelay, proposers, executors, multiSig)

	await timelock.waitForDeployment()

	console.log("TimelockController deployed to:", await timelock.getAddress())

	await sleep(30000)

	await run("verify:verify", {
		address: await timelock.getAddress(),
		constructorArguments: [minDelay, proposers, executors, multiSig],
		contract: "contracts/SymmioTimelockController.sol:SymmioTimelockController"
	})
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})