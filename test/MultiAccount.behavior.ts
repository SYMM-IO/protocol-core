import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Hedger } from "./models/Hedger";
import { RunContext } from "./models/RunContext";
import { User } from "./models/User";
import { initializeFixture } from "./Initialize.fixture";
import { decimal, getBlockTimestamp } from "./utils/Common";
import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { BigNumberish } from "ethers";
import {
  QuoteRequest,
  limitQuoteRequestBuilder,
  marketQuoteRequestBuilder,
} from "./models/requestModels/QuoteRequest";
import { PositionType, QuoteStatus } from "./models/Enums";
import { OpenRequest, marketOpenRequestBuilder } from "./models/requestModels/OpenRequest";
import { CloseRequest, marketCloseRequestBuilder } from "./models/requestModels/CloseRequest";
import {
  FillCloseRequest,
  marketFillCloseRequestBuilder,
} from "./models/requestModels/FillCloseRequest";
import { getDummyPairUpnlAndPriceSig, getDummySingleUpnlSig } from "./utils/SignatureUtils";
import { PromiseOrValue } from "../src/types/common";
import { PairUpnlAndPriceSigStruct } from "../src/types/contracts/facets/PartyA/PartyAFacet";

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
    await request.upnlSig,
  ];
}

async function getListFormatOfCloseRequest(
  request: CloseRequest,
): Promise<
  [
    PromiseOrValue<BigNumberish>,
    PromiseOrValue<BigNumberish>,
    PromiseOrValue<BigNumberish>,
    PromiseOrValue<BigNumberish>,
  ]
> {
  return [request.closePrice, request.quantityToClose, request.orderType, await request.deadline];
}

async function getListFormatOfOpenRequest(
  request: OpenRequest,
): Promise<
  [PromiseOrValue<BigNumberish>, PromiseOrValue<BigNumberish>, PairUpnlAndPriceSigStruct]
> {
  return [
    request.filledAmount,
    request.openPrice,
    await getDummyPairUpnlAndPriceSig(request.price, request.upnlPartyA, request.upnlPartyB),
  ];
}

async function getListFormatOfFillCloseRequest(
  request: FillCloseRequest,
): Promise<
  [PromiseOrValue<BigNumberish>, PromiseOrValue<BigNumberish>, PairUpnlAndPriceSigStruct]
> {
  return [
    request.filledAmount,
    request.closedPrice,
    await getDummyPairUpnlAndPriceSig(request.price, request.upnlPartyA, request.upnlPartyB),
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
    await user.setBalances(decimal(10000), decimal(6000), decimal(6000));

    hedger = new Hedger(context, context.signers.hedger);
    await hedger.setup();
    await hedger.setBalances(decimal(10000), decimal(10000));

    const SymmioPartyA = await ethers.getContractFactory("SymmioPartyA");
    const SymmioPartyB = await ethers.getContractFactory("SymmioPartyB");

    const Factory = await ethers.getContractFactory("MultiAccount");

    const SymmioPartyBDeploy = await upgrades.deployProxy(
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
    symmioPartyB = await SymmioPartyBDeploy.deployed();

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

    describe("delegatedAccesses", function () {
      let partyAAccount: any;
      let selector: any;
      let user2Address: any;
      beforeEach(async () => {
        const userAddress = await context.signers.user.getAddress();

        await multiAccount.connect(context.signers.user).addAccount("Test");
        partyAAccount = (await multiAccount.getAccounts(userAddress, 0, 10))[0].accountAddress;
        user2Address = await context.signers.user2.getAddress();
        selector = ethers.utils.hexDataSlice("0x7f2755b2", 0, 4);

        await context.collateral.connect(context.signers.user).mint(userAddress, decimal(510));

        await context.collateral
          .connect(context.signers.user)
          .approve(multiAccount.address, ethers.constants.MaxUint256);

        await multiAccount
          .connect(context.signers.user)
          .depositAndAllocateForAccount(partyAAccount, decimal(500));
      });
      it("should access delegate call to another address", async () => {
        expect(
          await multiAccount.delegatedAccesses(partyAAccount, user2Address, selector),
        ).to.be.equal(false);

        expect(
          await multiAccount
            .connect(context.signers.user)
            .delegateAccess(partyAAccount, user2Address, selector, true),
        ).to.not.be.reverted;

        expect(
          await multiAccount.delegatedAccesses(partyAAccount, user2Address, selector),
        ).to.be.equal(true);
      });
      it("should send quote with delegate access", async () => {
        let quoteRequest1 = limitQuoteRequestBuilder().build();
        let sendQuote1 = context.partyAFacet.interface.encodeFunctionData(
          "sendQuote",
          await getListFormatOfQuoteRequest(quoteRequest1),
        );
        await multiAccount
          .connect(context.signers.user)
          .delegateAccess(partyAAccount, user2Address, selector, true);
        await multiAccount.connect(context.signers.user2)._call(partyAAccount, [sendQuote1]);
        expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(QuoteStatus.PENDING);
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
  describe("send new quote", function () {
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
    }); //!-----------------------------------------------------------------------
    it("Should be able to send Quotes", async () => {
      let quoteRequest1 = limitQuoteRequestBuilder().build();
      let sendQuote1 = context.partyAFacet.interface.encodeFunctionData(
        "sendQuote",
        await getListFormatOfQuoteRequest(quoteRequest1),
      );
      await multiAccount.connect(context.signers.user)._call(partyAAccount, [sendQuote1]);
      expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(QuoteStatus.PENDING);
    });

    describe("Locking pair quotes", function () {
      beforeEach(async () => {
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

        await context.collateral
          .connect(context.signers.admin)
          .mint(symmioPartyB.address, decimal(1000000));

        await multiAccount
          .connect(context.signers.user)
          ._call(partyAAccount, [sendQuote1, sendQuote2]);

        await symmioPartyB
          .connect(context.signers.admin)
          ._approve(context.collateral.address, decimal(10000));

        let deposit = context.accountFacet.interface.encodeFunctionData("deposit", [
          decimal(10000),
        ]);

        let allocate = context.accountFacet.interface.encodeFunctionData("allocateForPartyB", [
          decimal(10000),
          partyAAccount,
        ]);

        await symmioPartyB.connect(context.signers.admin)._call([deposit]);
        await symmioPartyB.connect(context.signers.admin)._call([allocate]);
      });

      it("Should be able to lock Quote", async () => {
        let lockQuote = context.partyBFacet.interface.encodeFunctionData("lockQuote", [
          1,
          await getDummySingleUpnlSig(),
        ]);

        await expect(symmioPartyB.connect(context.signers.admin)._call([lockQuote])).to.not.be
          .reverted;
        expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(QuoteStatus.LOCKED);
      });

      describe("Open quotes", function () {
        beforeEach(async () => {
          let lockQuote = context.partyBFacet.interface.encodeFunctionData("lockQuote", [
            1,
            await getDummySingleUpnlSig(),
          ]);

          await symmioPartyB.connect(context.signers.admin)._call([lockQuote]);
        });

        it("Should be able to Open Quote", async () => {
          let openPosition2 = marketOpenRequestBuilder().build();
          let openPositionCallData2 = context.partyBFacet.interface.encodeFunctionData(
            "openPosition",
            [1, ...(await getListFormatOfOpenRequest(openPosition2))],
          );
          await symmioPartyB.connect(context.signers.admin)._call([openPositionCallData2]);

          expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(QuoteStatus.OPENED);
        });

        describe("Request to close", function () {
          beforeEach(async () => {
            //! open Position
            let openPosition2 = marketOpenRequestBuilder().build();
            let openPositionCallData2 = context.partyBFacet.interface.encodeFunctionData(
              "openPosition",
              [1, ...(await getListFormatOfOpenRequest(openPosition2))],
            );
            await symmioPartyB.connect(context.signers.admin)._call([openPositionCallData2]);
          });
          it("request to close position", async () => {
            let closeRequest1 = marketCloseRequestBuilder().build();
            let closeRequestCallData1 = context.partyAFacet.interface.encodeFunctionData(
              "requestToClosePosition",
              [1, ...(await getListFormatOfCloseRequest(closeRequest1))],
            );
            await multiAccount
              .connect(context.signers.user)
              ._call(partyAAccount, [closeRequestCallData1]);

            expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(
              QuoteStatus.CLOSE_PENDING,
            );
          });
          describe("Request to fill close", function () {
            // let partyAAccount: any;
            beforeEach(async () => {
              let closeRequest = marketCloseRequestBuilder().build();
              let closeRequestCallData = context.partyAFacet.interface.encodeFunctionData(
                "requestToClosePosition",
                [1, ...(await getListFormatOfCloseRequest(closeRequest))],
              );
              await multiAccount
                .connect(context.signers.user)
                ._call(partyAAccount, [closeRequestCallData]);
            });

            it("Should fill close quote", async () => {
              let fillCloseRequest = marketFillCloseRequestBuilder().build();
              let fillCloseRequestCallData = context.partyBFacet.interface.encodeFunctionData(
                "fillCloseRequest",
                [1, ...(await getListFormatOfFillCloseRequest(fillCloseRequest))],
              );
              await symmioPartyB.connect(context.signers.admin)._call([fillCloseRequestCallData]);

              expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(
                QuoteStatus.CLOSED,
              );
            });
          });
        });
      });
    });
  });
}
