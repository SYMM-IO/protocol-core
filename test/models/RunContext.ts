import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";

import {
  AccountFacet,
  ControlFacet,
  DiamondCutFacet,
  DiamondLoupeFacet,
  LiquidationFacet,
  PartyAFacet,
  PartyBFacet,
  ViewFacet,
} from "../../src/types";
import { TestManager } from "./TestManager";

export class RunContext {
  accountFacet!: AccountFacet;
  diamondCutFacet!: DiamondCutFacet;
  diamondLoupeFacet!: DiamondLoupeFacet;
  partyAFacet!: PartyAFacet;
  partyBFacet!: PartyBFacet;
  viewFacet!: ViewFacet;
  liquidationFacet!: LiquidationFacet;
  controlFacet!: ControlFacet;
  signers!: {
    admin: SignerWithAddress;
    user: SignerWithAddress;
    user2: SignerWithAddress;
    liquidator: SignerWithAddress;
    hedger: SignerWithAddress;
    hedger2: SignerWithAddress;
    others: SignerWithAddress[];
  };
  diamond!: string;
  collateral: any;
  manager!: TestManager;
}

export async function createRunContext(
  diamond: string,
  collateral: string,
  onlyInitialize: boolean = false,
): Promise<RunContext> {
  let context = new RunContext();

  const signers: SignerWithAddress[] = await ethers.getSigners();
  context.signers = {
    admin: signers[0],
    user: signers[1],
    user2: signers[2],
    liquidator: signers[3],
    hedger: signers[4],
    hedger2: signers[5],
    others: [],
  };

  context.diamond = diamond;
  context.collateral = await ethers.getContractAt("FakeStablecoin", collateral);
  context.accountFacet = await ethers.getContractAt("AccountFacet", diamond);
  context.diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", diamond);
  context.diamondLoupeFacet = await ethers.getContractAt("DiamondLoupeFacet", diamond);
  context.partyAFacet = await ethers.getContractAt("PartyAFacet", diamond);
  context.partyBFacet = await ethers.getContractAt("PartyBFacet", diamond);
  context.viewFacet = await ethers.getContractAt("ViewFacet", diamond);
  context.liquidationFacet = await ethers.getContractAt("LiquidationFacet", diamond);
  context.controlFacet = await ethers.getContractAt("ControlFacet", diamond);

  context.manager = new TestManager(context, onlyInitialize);
  if (!onlyInitialize)
    await context.manager.start();

  return context;
}
