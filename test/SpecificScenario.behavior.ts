import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { Builder } from "builder-pattern"
import { ethers } from "hardhat"

import { initializeFixture } from "./Initialize.fixture"
import { OrderType, PositionType } from "./models/Enums"
import { Hedger } from "./models/Hedger"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { OpenRequest } from "./models/requestModels/OpenRequest"
import { QuoteRequest } from "./models/requestModels/QuoteRequest"
import { decimal } from "./utils/Common"
import { getDummySingleUpnlAndPriceSig } from "./utils/SignatureUtils"

export function shouldBehaveLikeSpecificScenario(): void {
	beforeEach(async function () {
		this.context = await loadFixture(initializeFixture)
	})
	
	it("Closing position with allocated less than quote value and with positive upnl", async function () {
		const context: RunContext = this.context
		
		const uSigner = await ethers.getImpersonatedSigner(ethers.Wallet.createRandom().address)
		const user = new User(context, uSigner)
		await user.setup()
		await user.setNativeBalance(100n ** 18n)
		
		const hSigner = await ethers.getImpersonatedSigner(ethers.Wallet.createRandom().address)
		const hedger = new Hedger(context, hSigner)
		await hedger.setNativeBalance(100n ** 18n)
		await hedger.setBalances(decimal(50000), decimal(50000))
		await hedger.register()
		
		let b = decimal(5000)
		await user.setBalances(b, b, b)
		
		console.log("going to send code")
		await user.sendQuote(
			Builder<QuoteRequest>()
				.partyBWhiteList([])
				.quantity("32000000000000000")
				.partyAmm("69706470325210735106")
				.partyBmm("69706470325210735106")
				.cva("14394116573201404621")
				.lf("8104916153486468905")
				.price("22207600000000000000000")
				.upnlSig(getDummySingleUpnlAndPriceSig("20817400000000000000000"))
				.maxFundingRate(0)
				.symbolId(1)
				.orderType(OrderType.MARKET)
				.positionType(PositionType.SHORT)
				.deadline("100000000000000000")
				.build(),
		)
		await hedger.lockQuote(1)
		await hedger.openPosition(
			1,
			Builder<OpenRequest>()
				.filledAmount("32000000000000000")
				.openPrice("22207600000000000000000")
				.price("20817400000000000000000")
				.upnlPartyA(0)
				.upnlPartyB(0)
				.build(),
		)
		// await user.requestToClosePosition(
		//   1,
		//   Builder<CloseRequest>()
		//     .closePrice("22944000000000000000")
		//     .orderType(OrderType.LIMIT)
		//     .quantityToClose("197200000000000000000")
		//     .deadline("1000000000000000")
		//     .upnl(0)
		//     .build(),
		// );
		// await context.accountFacet
		//   .connect(uSigner)
		//   .deallocate("4376707987620000000000", await getDummySingleUpnlSig("0"));
		// console.log(await user.getBalanceInfo());
		
		// await context.partyBFacet
		//   .connect(hSigner)
		//   .deallocateForPartyB(
		//     "4746758351632000000000",
		//     await user.getAddress(),
		//     await getDummySingleUpnlSig("531317547460000000000"),
		//   );
		// console.log(await hedger.getBalanceInfo(await user.getAddress()));
		// await hedger.fillCloseRequest(
		//   1,
		//   Builder<FillCloseRequest>()
		//     .filledAmount("197200000000000000000")
		//     .closedPrice("22919000000000000000")
		//     .upnlPartyA("-513272021960000000000")
		//     .upnlPartyB("513277955708000000000")
		//     .price("22885951200000000000")
		//     .build(),
		// );
	})
}
