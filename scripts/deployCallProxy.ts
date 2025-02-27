import { run } from "hardhat"

async function main() {
	const admin = ""
	const whitelist = ""
	const operatorsList: string[] = [	]
	const operators = operatorsList.join(",")

	// Run the deploy:callProxy task
	const contract = await run("deploy:callProxy", {
		admin,
		whitelist,
		operators,
	})
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
