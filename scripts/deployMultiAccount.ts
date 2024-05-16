import { run, ethers } from "hardhat"
import { Addresses, loadAddresses, saveAddresses } from "./utils/file"

async function main() {
  let deployedAddresses: Addresses = loadAddresses()
  const symmioAddress = deployedAddresses.symmioAddress
  const admin = process.env.ADMIN_PUBLIC_KEY

  // Run the deploy:multiAccount task
  const contract = await run("deploy:multiAccount", {
    symmioAddress,
    admin,
    logData: true,
  })

  deployedAddresses.multiAccountAddress = contract.address
  saveAddresses(deployedAddresses)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
