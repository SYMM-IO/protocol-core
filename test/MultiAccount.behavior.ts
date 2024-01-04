import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Hedger } from "./models/Hedger";
import { RunContext } from "./models/RunContext";
import { User } from "./models/User";
import { initializeFixture } from "./Initialize.fixture";
import { decimal, getBlockTimestamp } from "./utils/Common";
import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import {
  QuoteRequest,
  limitQuoteRequestBuilder,
  marketQuoteRequestBuilder,
} from "./models/requestModels/QuoteRequest";
import { getDummySingleUpnlAndPriceSig, getDummySingleUpnlSig } from "./utils/SignatureUtils";
import { PositionType } from "./models/Enums";

function getFunctionAbi(contract: Contract | ContractFactory, functionName: string) {
  for (const abi of Object.keys(contract.interface.functions))
    if (abi.startsWith(functionName + "(")) return abi;
  throw Error("Function not found: " + functionName);
}

function getFunctionSelector(contract: Contract | ContractFactory, functionName: string) {
  return ethers.utils
    .keccak256(ethers.utils.toUtf8Bytes(getFunctionAbi(contract, functionName)))
    .slice(0, 10);
}

async function getListFormatOfQuoteRequest(request: QuoteRequest): Promise<any> {
  return [
    request.partyBWhiteList,
    request.symbolId,
    request.positionType,
    request.orderType,
    request.price,
    request.quantity,
    request.cva,
    request.lf,
    request.partyAmm,
    request.partyBmm,
    request.maxFundingRate,
    await request.deadline,
    {
      reqId: "0x",
      timestamp: 1704295726,
      upnl: 0,
      gatewaySignature: "0x0000000000000000000000000000000000000000",
      sigs: {
        signature: "0",
        owner: "0x0000000000000000000000000000000000000000",
        nonce: "0x0000000000000000000000000000000000000000",
      },
      price: "1000000000000000000",
    },
  ];
}

export function shouldBehaveLikMultiAccount() {
  let multiAccount: any;
  let context: RunContext;
  let user: User;
  let hedger: Hedger;
  let symmioAddress: any;
  let symmioPartyB: any;

  beforeEach(async () => {
    context = await loadFixture(initializeFixture);
    symmioAddress = context.diamond;

    user = new User(context, context.signers.user);
    await user.setup();
    await user.setBalances(decimal(6000), decimal(6000), decimal(6000));

    hedger = new Hedger(context, context.signers.hedger);
    await hedger.setup();
    await hedger.setBalances(decimal(10000), decimal(10000));

    const SymmioPartyA = await ethers.getContractFactory("SymmioPartyA");
    const SymmioPartyB = await ethers.getContractFactory("SymmioPartyB");

    const Factory = await ethers.getContractFactory("MultiAccount");

    const sssymmioPartyB = await upgrades.deployProxy(
      SymmioPartyB,
      [await context.signers.admin.getAddress(), symmioAddress],
      { initializer: "initialize" },
    );

    const MultiAccount = await upgrades.deployProxy(
      Factory,
      [await context.signers.admin.getAddress(), symmioAddress, SymmioPartyA.bytecode],
      { initializer: "initialize" },
    );

    multiAccount = await MultiAccount.deployed();
    symmioPartyB = await sssymmioPartyB.deployed();

    await context.controlFacet.connect(context.signers.admin).registerPartyB(symmioPartyB.address);

    await context.controlFacet
      .connect(context.signers.admin)
      .addSymbol("BTCUSDT", decimal(5), decimal(1, 16), decimal(1, 16), decimal(100), 28800, 900);
  });

  describe("Initialization and Settings", function () {
    it("Should set the correct admin and Symmio address", async function () {
      const adminAddress = await context.signers.admin.getAddress();
      expect(
        await multiAccount.hasRole(await multiAccount.DEFAULT_ADMIN_ROLE(), adminAddress),
      ).to.equal(true);
      expect(await multiAccount.hasRole(await multiAccount.PAUSER_ROLE(), adminAddress)).to.equal(
        true,
      );
      expect(await multiAccount.hasRole(await multiAccount.UNPAUSER_ROLE(), adminAddress)).to.equal(
        true,
      );
      expect(await multiAccount.hasRole(await multiAccount.SETTER_ROLE(), adminAddress)).to.equal(
        true,
      );
      expect(await multiAccount.symmioAddress()).to.equal(symmioAddress);
    });

    describe("Role-based Access Control", function () {
      it("Should grant and revoke roles correctly", async function () {
        const userAddress = await context.signers.user.getAddress();
        const adminAddress = await context.signers.admin.getAddress();

        // Granting SETTER_ROLE to addr1
        await multiAccount.grantRole(await multiAccount.SETTER_ROLE(), userAddress);
        expect(await multiAccount.hasRole(await multiAccount.SETTER_ROLE(), userAddress)).to.equal(
          true,
        );

        // Revoking SETTER_ROLE from addr1
        await multiAccount.revokeRole(await multiAccount.SETTER_ROLE(), userAddress, {
          from: adminAddress,
        });
        expect(await multiAccount.hasRole(await multiAccount.SETTER_ROLE(), userAddress)).to.equal(
          false,
        );
      });

      it("Should not allow unauthorized access", async function () {
        // Trying to call a protected function from an unauthorized address
        await expect(multiAccount.connect(context.signers.user).setAccountImplementation("0x00")).to
          .be.reverted;

        // Granting SETTER_ROLE to addr2 and trying again
        await multiAccount.grantRole(
          await multiAccount.SETTER_ROLE(),
          await context.signers.user.getAddress(),
        );
        await expect(multiAccount.connect(context.signers.user).setAccountImplementation("0x00")).to
          .not.be.reverted;
      });
    });
  });

  describe("Account Management", function () {
    describe("PartyA", function () {
      it("Should create account", async function () {
        const userAddress = await context.signers.user.getAddress();

        expect(await multiAccount.getAccountsLength(userAddress)).to.be.equal(0);

        await multiAccount.connect(context.signers.user).addAccount("Test");

        expect(await multiAccount.getAccountsLength(userAddress)).to.be.equal(1);
        let createdAccount = (await multiAccount.getAccounts(userAddress, 0, 10))[0];
        expect(createdAccount.name).to.be.equal("Test");
        expect(await multiAccount.owners(createdAccount.accountAddress)).to.be.equal(userAddress);
      });

      it("Should edit account name", async function () {
        const userAddress = await context.signers.user.getAddress();
        await expect(multiAccount.connect(context.signers.user).addAccount("Test")).to.not.be
          .reverted;

        let createdAccount = (await multiAccount.getAccounts(userAddress, 0, 10))[0];
        await expect(
          multiAccount
            .connect(context.signers.user2)
            .editAccountName(createdAccount.accountAddress, "Renamed"),
        ).to.be.reverted;
        await multiAccount
          .connect(context.signers.user)
          .editAccountName(createdAccount.accountAddress, "Renamed");
        let renamedAccount = (await multiAccount.getAccounts(userAddress, 0, 10))[0];
        expect(renamedAccount.name).to.be.equal("Renamed");
      });
    });

    describe("Balance Management", function () {
      let partyAAccount: any;

      beforeEach(async function () {
        const userAddress = await context.signers.user.getAddress();

        await multiAccount.connect(context.signers.user).addAccount("Test");
        partyAAccount = (await multiAccount.getAccounts(userAddress, 0, 10))[0].accountAddress;

        await context.collateral.connect(context.signers.user).mint(userAddress, decimal(120));

        await context.collateral
          .connect(context.signers.user)
          .approve(multiAccount.address, ethers.constants.MaxUint256);
      });

      it("Should deposit for account", async () => {
        //partyA
        await multiAccount
          .connect(context.signers.user)
          .depositForAccount(partyAAccount, decimal(100));
        expect(await context.viewFacet.balanceOf(partyAAccount)).to.be.equal(decimal(100));
      });

      it("Should deposit and allocate for account partyA", async () => {
        await multiAccount
          .connect(context.signers.user)
          .depositAndAllocateForAccount(partyAAccount, decimal(100));
        expect((await context.viewFacet.balanceInfoOfPartyA(partyAAccount))[0]).to.be.equal(
          decimal(100),
        );
      });

      it("Should withdraw from account", async () => {
        //partyA
        await multiAccount
          .connect(context.signers.user)
          .depositForAccount(partyAAccount, decimal(100));
        expect(await context.viewFacet.balanceOf(partyAAccount)).to.be.equal(decimal(100));
        await multiAccount
          .connect(context.signers.user)
          .withdrawFromAccount(partyAAccount, decimal(50));
        expect(await context.viewFacet.balanceOf(partyAAccount)).to.be.equal(decimal(50));
      });
    });

    describe("Method calling", function () {
      let partyAAccount: any;

      beforeEach(async function () {
        const userAddress = await context.signers.user.getAddress();

        await multiAccount.connect(context.signers.user).addAccount("Test");
        partyAAccount = (await multiAccount.getAccounts(userAddress, 0, 10))[0].accountAddress;

        await context.collateral.connect(context.signers.user).mint(userAddress, decimal(510));

        await context.collateral
          .connect(context.signers.user)
          .approve(multiAccount.address, ethers.constants.MaxUint256);

        await multiAccount
          .connect(context.signers.user)
          .depositAndAllocateForAccount(partyAAccount, decimal(500));
      });

      it("should prevent unauthorized calls", async function () {
        const callData = ethers.utils.defaultAbiCoder.encode(
          ["bytes4", "uint256"],
          [ethers.utils.id("mockFunction(uint256)").slice(0, 10), 123],
        );
        await expect(multiAccount.connect(context.signers.user2)._call(partyAAccount, [callData]))
          .to.be.reverted;
      });
    });
  });
  describe("Should work with paired quotes", function () {
    let partyAAccount: any;

    beforeEach(async function () {
      const userAddress = await context.signers.user.getAddress();

      await multiAccount.connect(context.signers.user).addAccount("Test");
      partyAAccount = (await multiAccount.getAccounts(userAddress, 0, 10))[0].accountAddress;

      await context.collateral.connect(context.signers.user).mint(userAddress, decimal(510));

      await context.collateral
        .connect(context.signers.user)
        .approve(multiAccount.address, ethers.constants.MaxUint256);

      await multiAccount
        .connect(context.signers.user)
        .depositAndAllocateForAccount(partyAAccount, decimal(500));
    });
    it("Should call single sendQuotes", async () => {
      let quoteRequest1 = limitQuoteRequestBuilder().build();
      let sendQuote1 = context.partyAFacet.interface.encodeFunctionData(
        "sendQuote",
        await getListFormatOfQuoteRequest(quoteRequest1),
      );
      await multiAccount.connect(context.signers.user)._call(partyAAccount, [sendQuote1]);
    });
  });

  describe("Locking pair quotes", function () {
    let partyAAccount: any;
    beforeEach(async () => {
      const userAddress = await context.signers.user.getAddress();

      await multiAccount.connect(context.signers.user).addAccount("Test");
      partyAAccount = (await multiAccount.getAccounts(userAddress, 0, 10))[0].accountAddress;

      let quoteRequest1 = marketQuoteRequestBuilder().build();
      let sendQuote1 = context.partyAFacet.interface.encodeFunctionData(
        "sendQuote",
        await getListFormatOfQuoteRequest(quoteRequest1),
      );
      let quoteRequest2 = marketQuoteRequestBuilder().positionType(PositionType.SHORT).build();
      let sendQuote2 = context.partyAFacet.interface.encodeFunctionData(
        "sendQuote",
        await getListFormatOfQuoteRequest(quoteRequest2),
      );

      await context.collateral.connect(context.signers.user).mint(userAddress, decimal(1000000));
      await context.collateral
        .connect(context.signers.admin)
        .mint(context.signers.admin.address, decimal(1000000));

      await context.collateral
        .connect(context.signers.user)
        .approve(multiAccount.address, ethers.constants.MaxUint256);

      await multiAccount
        .connect(context.signers.user)
        .depositAndAllocateForAccount(partyAAccount, decimal(3000));

      await multiAccount
        .connect(context.signers.user)
        ._call(partyAAccount, [sendQuote1, sendQuote2]);

      await context.collateral
        .connect(context.signers.admin)
        .transfer(symmioPartyB.address, decimal(1000000));

      await symmioPartyB
        .connect(context.signers.admin)
        ._approve(context.collateral.address, decimal(10000));

      let deposit = context.accountFacet.interface.encodeFunctionData("deposit", [decimal(10000)]);

      let allocate = context.accountFacet.interface.encodeFunctionData("allocateForPartyB", [
        decimal(10000),
        partyAAccount,
      ]);

      await symmioPartyB.connect(context.signers.admin)._call([deposit]);
      await symmioPartyB.connect(context.signers.admin)._call([allocate]);
    });

    it("Should be able to call pair functions only for one quote", async () => {
      let lockQuote = context.partyBFacet.interface.encodeFunctionData("lockQuote", [
        1,
        {
          reqId: "0x",
          timestamp: 1704295726,
          upnl: 0,
          gatewaySignature: "0x0000000000000000000000000000000000000000",
          sigs: {
            signature: "0",
            owner: "0x0000000000000000000000000000000000000000",
            nonce: "0x0000000000000000000000000000000000000000",
          },
        },
      ]);

      await expect(symmioPartyB.connect(context.signers.admin)._call([lockQuote])).to.not.be.reverted;
    });
  });
}