import {loadFixture} from "@nomicfoundation/hardhat-network-helpers"

import {initializeFixture} from "./Initialize.fixture"
import {RunContext} from "./models/RunContext"
import {User} from "./models/User"
import {decimal, unDecimal} from "./utils/Common"
import {Hedger} from "./models/Hedger"
import {expect} from "chai"

export function shouldBehaveLikeSpecificScenario(): void {
    describe("Multiple Hedgers", function () {
        let context: RunContext
        let user: User
        let user2: User
        let hedger: Hedger
        let hedger2: Hedger
        let liquidator: User

        beforeEach(async function () {
            context = await loadFixture(initializeFixture)

            user = new User(context, context.signers.user)
            await user.setup()
            await user.setBalances(decimal(2000), decimal(1000), decimal(500))

            user2 = new User(context, context.signers.user2)
            await user2.setup()
            await user2.setBalances(decimal(2000), decimal(1000), decimal(500))

            hedger = new Hedger(context, context.signers.hedger)
            await hedger.setup()
            await hedger.setBalances(decimal(2000), decimal(1000))

            hedger2 = new Hedger(context, context.signers.hedger2)
            await hedger2.setup()
            await hedger2.setBalances(decimal(2000), decimal(1000))

            liquidator = new User(context, context.signers.liquidator)
            await liquidator.setup()
        })

        it("Open/Close quote", async function () {
            await user.sendQuote() //1 user hedger
            await user.sendQuote() //2 user hedger2
            await user2.sendQuote() //3 user2 hedger
            await user2.sendQuote() //4 user2 hedger 2

            await hedger.lockQuote(1)
            await hedger2.lockQuote(2)
            await hedger.lockQuote(3)
            await hedger2.lockQuote(4)

            await hedger.openPosition(1)
            await hedger2.openPosition(2)
            await hedger.openPosition(3)

            expect((await context.viewFacet.getPartyBOpenPositions(hedger2.getAddress(), user2.getAddress(), 0, 10)).length)
                .to.be.equal(0)

            expect((await context.viewFacet.getPartyBOpenPositions(hedger.getAddress(), user.getAddress(), 0, 10)).length)
                .to.be.equal(1)

            await user.requestToClosePosition(1)
            await hedger.fillCloseRequest(1)

            await user.requestToClosePosition(2)
            await hedger2.fillCloseRequest(2)

            await user2.requestToClosePosition(3)
            await hedger.fillCloseRequest(3)

            await user2.requestToCancelQuote(4)
            await hedger2.acceptCancelRequest(4)
        })

        it("User liquidation", async function () {
            await user.sendQuote() //1 user hedger
            await user.sendQuote() //2 user hedger2
            await user2.sendQuote() //3 user2 hedger
            await user2.sendQuote() //4 user2 hedger 2
            await user.sendQuote() //5 user hedger2
            await user.sendQuote() //6 user hedger2

            await hedger.lockQuote(1)
            await hedger2.lockQuote(2)
            await hedger.lockQuote(3)
            await hedger2.lockQuote(4)
            await hedger2.lockQuote(5)
            await hedger2.lockQuote(6)

            await hedger.openPosition(1)
            await hedger2.openPosition(2)
            await hedger.openPosition(3)
            await hedger2.openPosition(4)
            await hedger2.openPosition(5)
            await hedger2.openPosition(6)

            let liquidPrice = decimal(0)
            await user.liquidateAndSetSymbolPrices([1], [liquidPrice])
            await user.liquidatePendingPositions()
            await user.liquidatePositions([1, 2, 5, 6])

            const pnlOfEachPosition = unDecimal(liquidPrice.sub(decimal(1)).mul(decimal(100)))

            const hedgerBalance = await hedger.getBalanceInfo(await user.getAddress())
            const hedger2Balance = await hedger2.getBalanceInfo(await user.getAddress())

            const userBalance = await user.getBalanceInfo()

            const userLockedCvaOfEachPosition = userBalance.lockedCva.div(4)
            const hedgerAfter = hedgerBalance.allocatedBalances.sub(pnlOfEachPosition.mul(1)).add(userLockedCvaOfEachPosition.mul(1))
            const hedger2After = hedger2Balance.allocatedBalances.sub(pnlOfEachPosition.mul(3)).add(userLockedCvaOfEachPosition.mul(3))

            const available = userBalance.allocatedBalances.sub(userBalance.lockedCva)
            const diff = available.add(pnlOfEachPosition.mul(4))

            await user.settleLiquidation([await hedger.getAddress(), await hedger2.getAddress()])

            expect(await context.viewFacet.allocatedBalanceOfPartyB(hedger.getAddress(), user.getAddress())).to.be.equal(
                hedgerAfter,
            )
            expect(await context.viewFacet.allocatedBalanceOfPartyB(hedger2.getAddress(), user.getAddress())).to.be.equal(
                hedger2After,
            )
            let balanceInfoOfLiquidator = await liquidator.getBalanceInfo()
            expect(balanceInfoOfLiquidator.allocatedBalances).to.be.equal(diff)
        })
    })
}
