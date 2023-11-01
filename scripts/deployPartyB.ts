import {ethers, run, upgrades} from "hardhat"

async function main() {
    const [deployer] = await ethers.getSigners()

    console.log("Deploying contracts with the account:", deployer.address)

    // Deploy SymmioPartyB as upgradeable
    const SymmioPartyBFactory = await ethers.getContractFactory("SymmioPartyB")
    const symmioPartyB = await upgrades.deployProxy(SymmioPartyBFactory, [
        "", "",
    ], {initializer: "initialize"})
    await symmioPartyB.deployed()

    const addresses = {
        proxy: symmioPartyB.address,
        admin: await upgrades.erc1967.getAdminAddress(symmioPartyB.address),
        implementation: await upgrades.erc1967.getImplementationAddress(
            symmioPartyB.address,
        ),
    }
    console.log(addresses)

    await new Promise((r) => setTimeout(r, 15000))

    console.log("Verifying contract...")
    await run("verify:verify", {address: addresses.implementation})
    console.log("Contract verified!")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })