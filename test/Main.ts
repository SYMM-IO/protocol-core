import {shouldBehaveLikeClosePosition} from "./ClosePosition.behavior"
import {shouldBehaveLikeFuzzTest} from "./FuzzTest.behavior"
import {shouldBehaveLikeDiamond} from "./Diamond.behavior"
import {shouldBehaveLikeAccountFacet} from "./AccountFacet.behavior"
import {shouldBehaveLikeSendQuote} from "./SendQuote.behavior"
import {shouldBehaveLikeLockQuote} from "./LockQuote.behavior"
import {shouldBehaveLikeOpenPosition} from "./OpenPosition.behavior"
import {shouldBehaveLikeCancelQuote} from "./CancelQuote.behavior"
import {shouldBehaveLikeLiquidationFacet} from "./LiquidationFacet.behavior"
import {shouldBehaveLikeFundingRate} from "./FundingRate.behavior"
import {shouldBehaveLikeSpecificScenario} from "./SpecificScenario.behavior"
import {shouldBehaveLikeBridgeFacet} from "./BridgeFacet.behavior"
import {shouldBehaveLikeMultiAccount} from "./MultiAccount.behavior"
import {shouldBehaveLikeControlFacet} from "./ControlFacet.behavior"

describe("UnitTests", function () {
	if (process.env.TEST_MODE == "static") {
		describe("Diamond", async function () {
			shouldBehaveLikeDiamond()
		})

		describe("AccountFacet", async function () {
			shouldBehaveLikeAccountFacet()
		})

		describe("SendQuote", async function () {
			shouldBehaveLikeSendQuote()
		})

		describe("LockQuote", async function () {
			shouldBehaveLikeLockQuote()
		})

		describe("OpenPosition", async function () {
			shouldBehaveLikeOpenPosition()
		})

		describe("CancelQuote", async function () {
			shouldBehaveLikeCancelQuote()
		})

		describe("ClosePosition", async function () {
			shouldBehaveLikeClosePosition()
		})

		describe("Liquidation", async function () {
			shouldBehaveLikeLiquidationFacet()
		})

		describe("FundingRate", async function () {
			shouldBehaveLikeFundingRate()
		})

		describe("SpecificScenario", async function () {
			shouldBehaveLikeSpecificScenario()
		})

		describe("BridgeFacet", async function () {
			shouldBehaveLikeBridgeFacet()
		})

		describe("MultiAccount", async function () {
			shouldBehaveLikeMultiAccount()
		})

		describe("ControlFacet", async function () {
			shouldBehaveLikeControlFacet()
		})
	} else if (process.env.TEST_MODE == "fuzz") {
		describe("FuzzTest", async function () {
			shouldBehaveLikeFuzzTest()
		})
	} else {
		throw new Error("Invalid TEST_MODE property. should be static or fuzz")
	}
})
