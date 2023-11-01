import { ethers, run, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const SymmioPartyA = await ethers.getContractFactory("SymmioPartyA");

  // Deploy SymmioPartyB as upgradeable
  const Factory = await ethers.getContractFactory("MultiAccount");
  const contract = await upgrades.deployProxy(Factory, [
    "0x9BC9CA7e6A8F013f40617c4585508A988DB7C1c7", "0x52e2230cDb80EDEBDaDafcf24033608C9A636D7D",
    SymmioPartyA.bytecode,
  ], { initializer: "initialize" });
  await contract.deployed();

  const addresses = {
    proxy: contract.address,
    admin: await upgrades.erc1967.getAdminAddress(contract.address),
    implementation: await upgrades.erc1967.getImplementationAddress(
      contract.address,
    ),
  };
  console.log(addresses);

  await new Promise((r) => setTimeout(r, 15000));

  console.log("Verifying contract...");
  await run("verify:verify", { address: addresses.implementation });
  console.log("Contract verified!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });