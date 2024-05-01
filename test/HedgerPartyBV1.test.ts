import { expect } from 'chai'
import { ContractFactory, Signer, Wallet, ZeroAddress } from 'ethers'
import { ethers, upgrades } from 'hardhat'
import { FakeStablecoin, HedgerPartyBV1, SymmioMock, TargetRebalancer } from '../typechain-types'

describe('HedgerPartyBV1', function () {
  let owner: Signer, newOwner: Signer, unauthorized: Signer, rebalancerBot: Signer, withdrawal: Signer
  let TargetRebalancer: TargetRebalancer
  let SymmioMock: SymmioMock

  let HedgerPartyBV1: HedgerPartyBV1

  let bots: Signer[]
  const restrictedSelectors = ['restrictedAction1(uint256)', 'restrictedActio2(address)']
  let rebalancers: string[]

  beforeEach(async function () {
    // Deploy the contract as a proxy before each test
    let bot1, bot2, bot3
    ;[owner, newOwner, unauthorized, rebalancerBot, withdrawal, bot1, bot2, bot3] = await ethers.getSigners()
    bots = [bot1, bot2, bot3]
    const SymmioMockFactory = await ethers.getContractFactory('SymmioMock')
    SymmioMock = await (await SymmioMockFactory.deploy()).waitForDeployment()

    const TargetRebalancerFactory = await ethers.getContractFactory('TargetRebalancer')

    TargetRebalancer = await (await TargetRebalancerFactory.deploy(await SymmioMock.getAddress())).waitForDeployment()

    rebalancers = [await rebalancerBot.getAddress(), await TargetRebalancer.getAddress()]

    const HedgerPartyBV1Factory = await ethers.getContractFactory('HedgerPartyBV1')
    const contract = await upgrades.deployProxy(
      HedgerPartyBV1Factory,
      [
        await owner.getAddress(),
        await SymmioMock.getAddress(),
        await Promise.all(bots.map((bot) => bot.getAddress())),
        restrictedSelectors,
        rebalancers,
      ],
      {
        initializer: 'initStoreV1',
      },
    )
    HedgerPartyBV1 = (await contract.waitForDeployment()) as any as HedgerPartyBV1

    TargetRebalancer.registerPartyB(await HedgerPartyBV1.getAddress(), await withdrawal.getAddress())
  })

  describe('Initialization', function () {
    it('should initialize correctly', async function () {
      expect(await HedgerPartyBV1.isInitialized()).to.equal(true)
      expect(await HedgerPartyBV1.getOwner()).to.equal(await owner.getAddress())
      expect(await HedgerPartyBV1.getPendingOwner()).to.equal(ZeroAddress)
      expect(await HedgerPartyBV1.getSymmioAddress()).to.equal(await SymmioMock.getAddress())
      for (const bot of bots) {
        expect(await HedgerPartyBV1.isBotWhitelisted(bot)).to.be.true
      }
      for (const selector of restrictedSelectors) {
        expect(await HedgerPartyBV1.isSelectorSignatureRestricted(selector)).to.be.true
      }
      for (const rebalancer of rebalancers) {
        expect(await HedgerPartyBV1.isRebalancer(rebalancer)).to.be.true
      }
    })

    it('should not allow reinitialization', async function () {
      await expect(
        HedgerPartyBV1.initStoreV1(await owner.getAddress(), await SymmioMock.getAddress(), bots, restrictedSelectors, rebalancers),
      ).to.be.revertedWith('PartyB: Store already initialized')
    })
  })

  describe('Ownership Management', function () {
    it('should allow proposing and accepting a new owner', async function () {
      await expect(HedgerPartyBV1.connect(owner).proposeNewOwner(await newOwner.getAddress()))
        .to.emit(HedgerPartyBV1, 'ProposeNewOwner')
        .withArgs(await owner.getAddress(), await newOwner.getAddress())

      await expect(HedgerPartyBV1.connect(newOwner).acceptOwnership())
        .to.emit(HedgerPartyBV1, 'TransferOwnership')
        .withArgs(await owner.getAddress(), await newOwner.getAddress())

      expect(await HedgerPartyBV1.getOwner()).to.equal(await newOwner.getAddress())
    })

    it('should prevent unauthorized users from proposing a new owner', async function () {
      await expect(HedgerPartyBV1.connect(unauthorized).proposeNewOwner(await newOwner.getAddress())).to.be.revertedWith(
        'PartyB: Only owner allowed!',
      )
    })

    it('should prevent unauthorized acceptance of ownership', async function () {
      await HedgerPartyBV1.connect(owner).proposeNewOwner(await newOwner.getAddress())
      await expect(HedgerPartyBV1.connect(unauthorized).acceptOwnership()).to.be.revertedWith('PartyB: Only pending owner allowed!')
    })
  })

  describe('Bot Management', function () {
    it('should allow the owner to add and check bots', async function () {
      const botAddress = Wallet.createRandom().address
      await expect(HedgerPartyBV1.connect(owner).addBots([botAddress]))
        .to.emit(HedgerPartyBV1, 'AddBot')
        .withArgs(botAddress)

      expect(await HedgerPartyBV1.isBotWhitelisted(botAddress)).to.be.true
    })

    it('should allow the owner to remove bots', async function () {
      const botAddress = Wallet.createRandom().address
      await HedgerPartyBV1.connect(owner).addBots([botAddress])
      await expect(HedgerPartyBV1.connect(owner).removeBots([botAddress]))
        .to.emit(HedgerPartyBV1, 'RemoveBot')
        .withArgs(botAddress)

      expect(await HedgerPartyBV1.isBotWhitelisted(botAddress)).to.be.false
    })

    it('should prevent unauthorized users from adding or removing bots', async function () {
      const botAddress = Wallet.createRandom().address
      await expect(HedgerPartyBV1.connect(unauthorized).addBots([botAddress])).to.be.revertedWith('PartyB: Only owner allowed!')

      await HedgerPartyBV1.connect(owner).addBots([botAddress])
      await expect(HedgerPartyBV1.connect(unauthorized).removeBots([botAddress])).to.be.revertedWith('PartyB: Only owner allowed!')
    })
  })

  describe('Restricted Selectors Management', function () {
    const testSelector = 'testFunction(uint256)'
    const selectorBytes = ethers.keccak256(ethers.toUtf8Bytes(testSelector)).substring(0, 10)

    it('should allow the owner to add and verify restricted selectors', async function () {
      await expect(HedgerPartyBV1.connect(owner).addRestrictedSelectors([testSelector]))
        .to.emit(HedgerPartyBV1, 'AddRestrictedSelector')
        .withArgs(selectorBytes, testSelector)

      expect(await HedgerPartyBV1.isSelectorSignatureRestricted(testSelector)).to.be.true
    })

    it('should allow the owner to remove restricted selectors', async function () {
      await HedgerPartyBV1.connect(owner).addRestrictedSelectors([testSelector])
      await expect(HedgerPartyBV1.connect(owner).removeRestrictedSelectors([testSelector]))
        .to.emit(HedgerPartyBV1, 'RemoveRestrictedSelector')
        .withArgs(selectorBytes, testSelector)

      expect(await HedgerPartyBV1.isSelectorSignatureRestricted(testSelector)).to.be.false
    })

    it('should prevent unauthorized users from managing selectors', async function () {
      await expect(HedgerPartyBV1.connect(unauthorized).addRestrictedSelectors([testSelector])).to.be.revertedWith(
        'PartyB: Only owner allowed!',
      )

      await HedgerPartyBV1.connect(owner).addRestrictedSelectors([testSelector])
      await expect(HedgerPartyBV1.connect(unauthorized).removeRestrictedSelectors([testSelector])).to.be.revertedWith(
        'PartyB: Only owner allowed!',
      )
    })
  })

  describe('Rebalancer Management', function () {
    it('should allow the owner to add and verify rebalancers', async function () {
      const rebalancerAddress = Wallet.createRandom().address
      await expect(HedgerPartyBV1.connect(owner).addRebalancers([rebalancerAddress]))
        .to.emit(HedgerPartyBV1, 'AddRebalancer')
        .withArgs(rebalancerAddress)

      expect(await HedgerPartyBV1.isRebalancer(rebalancerAddress)).to.be.true
    })

    it('should allow the owner to remove rebalancers', async function () {
      const rebalancerAddress = Wallet.createRandom().address
      await HedgerPartyBV1.connect(owner).addRebalancers([rebalancerAddress])
      await expect(HedgerPartyBV1.connect(owner).removeRebalancers([rebalancerAddress]))
        .to.emit(HedgerPartyBV1, 'RemoveRebalancer')
        .withArgs(rebalancerAddress)

      expect(await HedgerPartyBV1.isRebalancer(rebalancerAddress)).to.be.false
    })

    it('should prevent unauthorized users from adding or removing rebalancers', async function () {
      const rebalancerAddress = await newOwner.getAddress()
      await expect(HedgerPartyBV1.connect(unauthorized).addRebalancers([rebalancerAddress])).to.be.revertedWith(
        'PartyB: Only owner allowed!',
      )

      await HedgerPartyBV1.connect(owner).addRebalancers([rebalancerAddress])
      await expect(HedgerPartyBV1.connect(unauthorized).removeRebalancers([rebalancerAddress])).to.be.revertedWith(
        'PartyB: Only owner allowed!',
      )
    })
  })

  describe('Rebalancer Operation', function () {
    const amount = 100
    it('should allow rebalancerBot to trigger rebalancer with correct withdrawalAddress', async function () {
      await expect(
        HedgerPartyBV1.connect(rebalancerBot).rebalance(await TargetRebalancer.getAddress(), await withdrawal.getAddress(), amount),
      )
        .to.emit(SymmioMock, 'SetDeallocateCooldown')
        .withArgs(await TargetRebalancer.getAddress(), 0)
        .to.emit(SymmioMock, 'WithdrawalTo')
        .withArgs(await HedgerPartyBV1.getAddress(), await withdrawal.getAddress(), amount)
        .to.emit(SymmioMock, 'SetDeallocateCooldown')
        .withArgs(await TargetRebalancer.getAddress(), 10)
    })

    it('should not allow rebalancerBot to trigger rebalancer with wrong withdrawalAddress', async function () {
      await expect(
        HedgerPartyBV1.connect(rebalancerBot).rebalance(await TargetRebalancer.getAddress(), Wallet.createRandom().address, amount),
      ).to.be.revertedWith('TargetRebalancer: PartyB not registered with this withdrawal address!')
    })

    it('should not allow contract to trigger withdrawTo if not whitelisted as rebalancer', async function () {
      HedgerPartyBV1.connect(owner).removeRebalancers([await TargetRebalancer.getAddress()])

      await expect(
        HedgerPartyBV1.connect(rebalancerBot).rebalance(await TargetRebalancer.getAddress(), await withdrawal.getAddress(), amount),
      ).to.be.revertedWith('PartyB: Only rebalancer allowed!')
    })

    it('should not allow unauthorized to trigger rebalancer', async function () {
      await expect(
        HedgerPartyBV1.connect(unauthorized).rebalance(await TargetRebalancer.getAddress(), await withdrawal.getAddress(), amount),
      ).to.be.revertedWith('PartyB: Only rebalancer allowed!')
    })
  })

  describe('Bots Operation', function () {
    it('should allow bot to call a non restricted function', async function () {
      const someParam = 1000
      const tx = await SymmioMock.connect(owner).testFunction.populateTransaction(someParam)

      await expect(HedgerPartyBV1.connect(bots[0])._call([tx.data]))
        .to.emit(SymmioMock, 'TestFunction')
        .withArgs(await HedgerPartyBV1.getAddress(), someParam)
    })

    it('should not allow bot to call a restricted function', async function () {
      HedgerPartyBV1.connect(owner).addRestrictedSelectors(['testFunction(uint256)'])

      const someParam = 1000
      const tx = await SymmioMock.connect(owner).testFunction.populateTransaction(someParam)

      await expect(HedgerPartyBV1.connect(bots[0])._call([tx.data])).to.be.revertedWith('PartyB: Restricted selector for bot!')
    })
  })

  describe('ERC20 Withdrawal', function () {
    let token: FakeStablecoin

    beforeEach(async function () {
      const mock: ContractFactory = await ethers.getContractFactory('FakeStablecoin')
      const tx = await mock.deploy()
      token = (await tx.waitForDeployment()) as FakeStablecoin
      await token.mint(await HedgerPartyBV1.getAddress(), 1000)
    })

    it('should allow the owner to withdraw ERC20 tokens', async function () {
      const balanceBefore = await token.balanceOf(await owner.getAddress())
      await HedgerPartyBV1.connect(owner).withdrawERC20(await token.getAddress(), 500)
      const balanceAfter = await token.balanceOf(await owner.getAddress())

      expect(balanceAfter - balanceBefore).to.equal(500n)
    })

    it('should prevent unauthorized users from withdrawing ERC20 tokens', async function () {
      await expect(HedgerPartyBV1.connect(unauthorized).withdrawERC20(await token.getAddress(), 500)).to.be.revertedWith(
        'PartyB: Only owner allowed!',
      )
    })
  })
})
