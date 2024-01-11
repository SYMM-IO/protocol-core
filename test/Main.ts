import { shouldBehaveLikeAccountFacet } from "./AccountFacet.behavior"
import { shouldBehaveLikeCancelQuote } from "./CancelQuote.behavior"
import { shouldBehaveLikeClosePosition } from "./ClosePosition.behavior"
import { shouldBehaveLikeDiamond } from "./Diamond.behavior"
import { shouldBehaveLikeFuzzTest } from "./FuzzTest.behavior"
import { shouldBehaveLikeLiquidationFacet } from "./LiquidationFacet.behavior"
import { shouldBehaveLikeLockQuote } from "./LockQuote.behavior"
import { shouldBehaveLikeOpenPosition } from "./OpenPosition.behavior"
import { shouldBehaveLikeSendQuote } from "./SendQuote.behavior"
import { shouldBehaveLikeSpecificScenario } from "./SpecificScenario.behavior"
import { shouldBehaveLikeFundingRate } from "./FundingRate.behavior"
import { shouldBehaveLikMultiAccount } from "./MultiAccount.behavior"

describe("UnitTests", function () {
	if (process.env.TEST_MODE == "static") {
		// describe("Diamond", async function () {
		// 	shouldBehaveLikeDiamond()
		// })
		
		// describe("AccountFacet", async function () {
		// 	shouldBehaveLikeAccountFacet()
		// })
		
		// describe("SendQuote", async function () {
		// 	shouldBehaveLikeSendQuote()
		// })
		
		// describe("LockQuote", async function () {
		// 	shouldBehaveLikeLockQuote()
		// })
		
		// describe("OpenPosition", async function () {
		// 	shouldBehaveLikeOpenPosition()
		// })
		
		// describe("CancelQuote", async function () {
		// 	shouldBehaveLikeCancelQuote()
		// })
		
		// describe("ClosePosition", async function () {
		// 	shouldBehaveLikeClosePosition()
		// })
		
		// describe("Liquidation", async function () {
		// 	shouldBehaveLikeLiquidationFacet()
		// })
		
		// describe("FundingRate", async function () {
		// 	shouldBehaveLikeFundingRate()
		// })

		describe("MultiAccount", async function () {
			shouldBehaveLikMultiAccount()
		})
		
		// describe("SpecificScenario", async function () {
		// 	shouldBehaveLikeSpecificScenario()
		// })
	} else if (process.env.TEST_MODE == "fuzz") {
		describe("FuzzTest", async function () {
			shouldBehaveLikeFuzzTest()
		})
	} else {
		throw new Error("Invalid TEST_MODE property. should be static or fuzz")
	}
})
