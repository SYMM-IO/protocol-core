import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {Contract} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

describe("FeeCollector", function () {
    let feeCollector: Contract;
    let mockSymmio: Contract;
    let mockToken: Contract;
    let owner: SignerWithAddress;
    let admin: SignerWithAddress;
    let collector: SignerWithAddress;
    let setter: SignerWithAddress;
    let manager: SignerWithAddress;
    let pauser: SignerWithAddress;
    let unpauser: SignerWithAddress;
    let symmioReceiver: SignerWithAddress;
    let stakeholder1: SignerWithAddress;
    let stakeholder2: SignerWithAddress;

    const symmioShare = ethers.utils.parseEther("0.5"); // 50%

    beforeEach(async function () {
        [owner, admin, collector, setter, manager, pauser, unpauser, symmioReceiver, stakeholder1, stakeholder2] = await ethers.getSigners();

        // Deploy mock Symmio contract
        const MockSymmio = await ethers.getContractFactory("MockSymmio");
        mockSymmio = await MockSymmio.deploy();

        // Deploy mock ERC20 token
        const MockToken = await ethers.getContractFactory("MockToken");
        mockToken = await MockToken.deploy("Mock Token", "MTK");

        // Set mock token as collateral in mock Symmio
        await mockSymmio.setCollateral(mockToken.address);

        // Deploy FeeCollector
        const FeeCollector = await ethers.getContractFactory("FeeCollector");
        feeCollector = await upgrades.deployProxy(FeeCollector, [
            admin.address,
            mockSymmio.address,
            symmioReceiver.address,
            symmioShare
        ]);

        // Grant roles
        await feeCollector.connect(admin).grantRole(await feeCollector.COLLECTOR_ROLE(), collector.address);
        await feeCollector.connect(admin).grantRole(await feeCollector.SETTER_ROLE(), setter.address);
        await feeCollector.connect(admin).grantRole(await feeCollector.MANAGER_ROLE(), manager.address);
        await feeCollector.connect(admin).grantRole(await feeCollector.PAUSER_ROLE(), pauser.address);
        await feeCollector.connect(admin).grantRole(await feeCollector.UNPAUSER_ROLE(), unpauser.address);
    });

    describe("Initialization", function () {
        it("Should set the correct initial values", async function () {
            expect(await feeCollector.symmioAddress()).to.equal(mockSymmio.address);
            expect(await feeCollector.symmioReceiver()).to.equal(symmioReceiver.address);
            expect(await feeCollector.symmioShare()).to.equal(symmioShare);
        });
    });

    describe("setSymmioAddress", function () {
        it("Should allow setter to change Symmio address", async function () {
            const newSymmioAddress = ethers.Wallet.createRandom().address;
            await feeCollector.connect(setter).setSymmioAddress(newSymmioAddress);
            expect(await feeCollector.symmioAddress()).to.equal(newSymmioAddress);
        });

        it("Should revert if called by non-setter", async function () {
            await expect(feeCollector.connect(owner).setSymmioAddress(ethers.constants.AddressZero))
                .to.be.reverted;
        });

        it("Should revert if new address is zero", async function () {
            await expect(feeCollector.connect(setter).setSymmioAddress(ethers.constants.AddressZero))
                .to.be.revertedWith("FeeCollector: Zero address");
        });
    });

    describe("setSymmioReceiver", function () {
        it("Should allow setter to change Symmio receiver", async function () {
            const newReceiver = ethers.Wallet.createRandom().address;
            await feeCollector.connect(setter).setSymmioReceiver(newReceiver);
            expect(await feeCollector.symmioReceiver()).to.equal(newReceiver);
        });

        it("Should revert if called by non-setter", async function () {
            await expect(feeCollector.connect(owner).setSymmioReceiver(ethers.constants.AddressZero))
                .to.be.reverted;
        });

        it("Should revert if new receiver is zero address", async function () {
            await expect(feeCollector.connect(setter).setSymmioReceiver(ethers.constants.AddressZero))
                .to.be.revertedWith("FeeCollector: Zero address");
        });
    });

    describe("setSymmioShare", function () {
        it("Should allow setter to change Symmio share", async function () {
            const newShare = ethers.utils.parseEther("0.6");
            await feeCollector.connect(setter).setSymmioShare(newShare);
            expect(await feeCollector.symmioShare()).to.equal(newShare);
        });

        it("Should revert if called by non-setter", async function () {
            await expect(feeCollector.connect(owner).setSymmioShare(0))
                .to.be.reverted;
        });

        it("Should revert if new share is greater than 100%", async function () {
            await expect(feeCollector.connect(setter).setSymmioShare(ethers.utils.parseEther("1.1")))
                .to.be.revertedWith("FeeCollector: Invalid share");
        });
    });

    describe("setStakeholders", function () {
        it("Should allow manager to set stakeholders", async function () {
            const newStakeholders = [
                {receiver: stakeholder1.address, share: ethers.utils.parseEther("0.3")},
                {receiver: stakeholder2.address, share: ethers.utils.parseEther("0.2")}
            ];
            await feeCollector.connect(manager).setStakeholders(newStakeholders);

            expect((await feeCollector.stakeholders(1)).receiver).to.equal(stakeholder1.address);
            expect((await feeCollector.stakeholders(1)).share).to.equal(ethers.utils.parseEther("0.3"));
            expect((await feeCollector.stakeholders(2)).receiver).to.equal(stakeholder2.address);
            expect((await feeCollector.stakeholders(2)).share).to.equal(ethers.utils.parseEther("0.2"));
        });

        it("Should revert if called by non-manager", async function () {
            await expect(feeCollector.connect(owner).setStakeholders([]))
                .to.be.reverted;
        });

        it("Should revert if total shares don't equal 100%", async function () {
            const invalidStakeholders = [
                {receiver: stakeholder1.address, share: ethers.utils.parseEther("0.6")}
            ];
            await expect(feeCollector.connect(manager).setStakeholders(invalidStakeholders))
                .to.be.revertedWith("FeeCollector: Total shares must equal 1");
        });
    });

    describe("claimFee", function () {
        beforeEach(async function () {
            // Set up stakeholders
            await feeCollector.connect(manager).setStakeholders([
                {receiver: stakeholder1.address, share: ethers.utils.parseEther("0.3")},
                {receiver: stakeholder2.address, share: ethers.utils.parseEther("0.2")}
            ]);

            // Fund mock Symmio with tokens
            let amount = ethers.utils.parseEther("1000")
            await mockToken.connect(owner).approve(mockSymmio.address, amount);
            await mockSymmio.connect(owner).depositFor(amount, feeCollector.address)
        });

        it("Should distribute fees correctly", async function () {
            const claimAmount = ethers.utils.parseEther("100");

            await feeCollector.connect(collector).claimFee(claimAmount);

            expect(await mockToken.balanceOf(symmioReceiver.address)).to.equal(ethers.utils.parseEther("50"));
            expect(await mockToken.balanceOf(stakeholder1.address)).to.equal(ethers.utils.parseEther("30"));
            expect(await mockToken.balanceOf(stakeholder2.address)).to.equal(ethers.utils.parseEther("20"));
        });

        it("Should revert if called by non-collector", async function () {
            await expect(feeCollector.connect(owner).claimFee(100))
                .to.be.reverted;
        });

        it("Should revert when paused", async function () {
            await feeCollector.connect(pauser).pause();
            await expect(feeCollector.connect(collector).claimFee(100))
                .to.be.revertedWith("Pausable: paused");
        });
    });

    describe("Pause and Unpause", function () {
        it("Should allow pauser to pause", async function () {
            await feeCollector.connect(pauser).pause();
            expect(await feeCollector.paused()).to.be.true;
        });

        it("Should allow unpauser to unpause", async function () {
            await feeCollector.connect(pauser).pause();
            await feeCollector.connect(unpauser).unpause();
            expect(await feeCollector.paused()).to.be.false;
        });

        it("Should revert if non-pauser tries to pause", async function () {
            await expect(feeCollector.connect(owner).pause())
                .to.be.reverted;
        });

        it("Should revert if non-unpauser tries to unpause", async function () {
            await feeCollector.connect(pauser).pause();
            await expect(feeCollector.connect(owner).unpause())
                .to.be.reverted;
        });
    });
});