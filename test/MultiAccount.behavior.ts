import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Hedger } from "./models/Hedger";
import { RunContext } from "./models/RunContext";
import { User } from "./models/User";
import { initializeFixture } from "./Initialize.fixture";
import { decimal } from "./utils/Common";
import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";


function getFunctionAbi(contract: Contract | ContractFactory, functionName: string) {
    for (const abi of Object.keys(contract.interface.functions))
      if (abi.startsWith(functionName + "("))
        return abi;
    throw Error("Function not found: " + functionName);
  }
  
  function getFunctionSelector(contract: Contract | ContractFactory, functionName: string) {
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(getFunctionAbi(contract, functionName))).slice(0, 10);
  }


export function shouldBehaveLikMultiAccount() {
  let layer: any;
  let context: RunContext;
  let user: User;
  let hedger: Hedger;
  let symmioAddress: any;

  beforeEach(async () => {
    context = await loadFixture(initializeFixture);
    symmioAddress = context.diamond;

    user = new User(context, context.signers.user);
    await user.setup();
    await user.setBalances(decimal(2000), decimal(2000), decimal(2000));

    hedger = new Hedger(context, context.signers.hedger);
    await hedger.setup();
    await hedger.setBalances(decimal(2000), decimal(1000));

    const SymmioPartyA = await ethers.getContractFactory("SymmioPartyA");
    const SymmioPartyB = await ethers.getContractFactory("SymmioPartyB");

    const Factory = await ethers.getContractFactory("MultiAccount");

    const Layer = await upgrades.deployProxy(
      Factory,
      [await context.signers.admin.getAddress(), symmioAddress, SymmioPartyA.bytecode],
      { initializer: "initialize" },
    );

    layer = await Layer.deployed();
  });

  describe("Initialization and Settings", function() {
    it("Should set the correct admin and Symmio address", async function() {
        const adminAddress = await context.signers.admin.getAddress();
        expect(await layer.hasRole(await layer.DEFAULT_ADMIN_ROLE(), adminAddress)).to.equal(true);
        expect(await layer.hasRole(await layer.PAUSER_ROLE(), adminAddress)).to.equal(true);
        expect(await layer.hasRole(await layer.UNPAUSER_ROLE(), adminAddress)).to.equal(true);
        expect(await layer.hasRole(await layer.SETTER_ROLE(), adminAddress)).to.equal(true);
        expect(await layer.symmioAddress()).to.equal(symmioAddress);
      });
  
      describe("Role-based Access Control", function() {
        it("Should grant and revoke roles correctly", async function() {
    
          const userAddress = await context.signers.user.getAddress();
          const adminAddress = await context.signers.admin.getAddress();
    
          // Granting SETTER_ROLE to addr1
          await layer.grantRole(await layer.SETTER_ROLE(), userAddress);
          expect(await layer.hasRole(await layer.SETTER_ROLE(), userAddress)).to.equal(true);
    
          // Revoking SETTER_ROLE from addr1
          await layer.revokeRole(await layer.SETTER_ROLE(), userAddress, { from: adminAddress });
          expect(await layer.hasRole(await layer.SETTER_ROLE(), userAddress)).to.equal(false);
        });
    
        it("Should not allow unauthorized access", async function() {
          // Trying to call a protected function from an unauthorized address
          await expect(layer.connect(context.signers.user).setAccountImplementation("0x00")).to.be.reverted;
    
          // Granting SETTER_ROLE to addr2 and trying again
          await layer.grantRole(await layer.SETTER_ROLE(), await context.signers.user.getAddress());
          await expect(layer.connect(context.signers.user).setAccountImplementation("0x00")).to.not.be.reverted;
        });
      });
  })

  describe("Account Management", function() {
    describe("PartyA", function() {
      it("Should create account", async function() {
        const userAddress = await context.signers.user.getAddress();

        expect(await layer.getAccountsLength(userAddress)).to.be.equal(0);

        await layer.connect(context.signers.user).addAccount("Test");

        expect(await layer.getAccountsLength(userAddress)).to.be.equal(1);
        let createdAccount = (await layer.getAccounts(userAddress, 0, 10))[0];
        expect(createdAccount.name).to.be.equal("Test");
        expect(await layer.owners(createdAccount.accountAddress)).to.be.equal(userAddress);
      });

      it("Should edit account name", async function() {
        const userAddress = await context.signers.user.getAddress();
        await expect(layer.connect(context.signers.user).addAccount("Test")).to.not.be.reverted;

        let createdAccount = (await layer.getAccounts(userAddress, 0, 10))[0];
        await expect(layer.connect(context.signers.user2).editAccountName(createdAccount.accountAddress, "Renamed")).to.be.reverted;
        await layer.connect(context.signers.user).editAccountName(createdAccount.accountAddress, "Renamed");
        let renamedAccount = (await layer.getAccounts(userAddress, 0, 10))[0];
        expect(renamedAccount.name).to.be.equal("Renamed");
      });

    });

    describe("Balance Management", function() {
        let partyAAccount: any;
    
        beforeEach(async function() {
          const userAddress = await context.signers.user.getAddress();
    
          await layer.connect(context.signers.user).addAccount("Test");
          partyAAccount = (await layer.getAccounts(userAddress, 0, 10))[0].accountAddress;

          await context.collateral.connect(context.signers.user).mint(userAddress, decimal(120))
    
          await context.collateral
            .connect(context.signers.user)
            .approve(layer.address, ethers.constants.MaxUint256);
        });
    
        it("Should deposit for account", async () => {
          //partyA
          await layer.connect(context.signers.user).depositForAccount(partyAAccount, decimal(100));
          expect(await context.viewFacet.balanceOf(partyAAccount)).to.be.equal(decimal(100));

        });
    
        it("Should deposit and allocate for account partyA", async () => {
          await layer.connect(context.signers.user).depositAndAllocateForAccount(partyAAccount, decimal(100));
          expect((await context.viewFacet.balanceInfoOfPartyA(partyAAccount))[0]).to.be.equal(decimal(100));
        });
    
        it("Should withdraw from account", async () => {
          //partyA
          await layer.connect(context.signers.user).depositForAccount(partyAAccount, decimal(100));
          expect(await context.viewFacet.balanceOf(partyAAccount)).to.be.equal(decimal(100));
          await layer.connect(context.signers.user).withdrawFromAccount(partyAAccount, decimal(50));
          expect(await context.viewFacet.balanceOf(partyAAccount)).to.be.equal(decimal(50));
        });
      });

      describe("Method calling", function() {
        let partyAAccount: any;

        beforeEach(async function() {
          const userAddress = await context.signers.user.getAddress();
    
          await layer.connect(context.signers.user).addAccount("Test");
          partyAAccount = (await layer.getAccounts(userAddress, 0, 10))[0].accountAddress;
          
          await context.collateral.connect(context.signers.user).mint(userAddress, decimal(510))
          
          await context.collateral
          .connect(context.signers.user)
          .approve(layer.address, ethers.constants.MaxUint256);
          
          await layer.connect(context.signers.user).depositAndAllocateForAccount(partyAAccount, decimal(500));

        });
    
        it("should prevent unauthorized calls", async function() {
          const callData = ethers.utils.defaultAbiCoder.encode(
            ["bytes4", "uint256"],
            [ethers.utils.id("mockFunction(uint256)").slice(0, 10), 123],
          );
          await expect(layer.connect(context.signers.user2)._call(partyAAccount, [callData])).to.be.reverted;
        });
  })

  
})
}
