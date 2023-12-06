import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { BigNumber } from "ethers"

import { initializeFixture } from "./Initialize.fixture"
import { OrderType, PositionType, QuoteStatus } from "./models/Enums"
import { Hedger } from "./models/Hedger"
import { RunContext } from "./models/RunContext"
import { User } from "./models/User"
import { limitCloseRequestBuilder, marketCloseRequestBuilder } from "./models/requestModels/CloseRequest"
import { emergencyCloseRequestBuilder } from "./models/requestModels/EmergencyCloseRequest"
import { limitFillCloseRequestBuilder, marketFillCloseRequestBuilder } from "./models/requestModels/FillCloseRequest"
import { limitQuoteRequestBuilder } from "./models/requestModels/QuoteRequest"
import { AcceptCancelCloseRequestValidator } from "./models/validators/AcceptCancelCloseRequestValidator"
import { CancelCloseRequestValidator } from "./models/validators/CancelCloseRequestValidator"
import { CloseRequestValidator } from "./models/validators/CloseRequestValidator"
import { EmergencyCloseRequestValidator } from "./models/validators/EmergencyCloseRequestValidator"
import { FillCloseRequestValidator } from "./models/validators/FillCloseRequestValidator"
import {
	decimal,
	getBlockTimestamp,
	getQuoteQuantity,
	getTotalLockedValuesForQuoteIds,
	getTradingFeeForQuotes,
	pausePartyA,
	pausePartyB,
	unDecimal,
} from "./utils/Common"

export function shouldBehaveLikeClosePosition(): void {
	beforeEach(async function () {
		this.context = await loadFixture(initializeFixture)
		this.user_allocated = decimal(500)
		this.hedger_allocated = decimal(4000)
		
		this.user = new User(this.context, this.context.signers.user)
		await this.user.setup()
		await this.user.setBalances(decimal(2000), decimal(1000), this.user_allocated)
		
		this.hedger = new Hedger(this.context, this.context.signers.hedger)
		await this.hedger.setup()
		await this.hedger.setBalances(this.hedger_allocated, this.hedger_allocated)
		
		this.hedger2 = new Hedger(this.context, this.context.signers.hedger2)
		await this.hedger2.setup()
		await this.hedger2.setBalances(this.hedger_allocated, this.hedger_allocated)
		
		// Quote1 LONG opened
		await this.user.sendQuote()
		await this.hedger.lockQuote(1)
		await this.hedger.openPosition(1)
		
		// Quote2 SHORT opened
		await this.user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
		await this.hedger.lockQuote(2)
		await this.hedger.openPosition(2)
		
		// Quote3 SHORT sent
		await this.user.sendQuote(limitQuoteRequestBuilder().positionType(PositionType.SHORT).build())
		
		// Quote4 LONG sent
		await this.user.sendQuote()
		await this.hedger.lockQuote(4)
		await this.hedger.openPosition(4)
	})
	
	it("Should fail on invalid partyA", async function () {
		const context: RunContext = this.context
		await expect(
			context.partyAFacet.requestToClosePosition(
				2, //quoteId
				decimal(1), //closePrice
				decimal(1), //quantityToClose
				OrderType.LIMIT,
				getBlockTimestamp(100),
			),
		).to.be.revertedWith("Accessibility: Should be partyA of quote")
	})
	
	it("Should fail on paused partyA", async function () {
		const context: RunContext = this.context
		await pausePartyA(context)
		await expect(this.user.requestToClosePosition(2)).to.be.revertedWith(
			"Pausable: PartyA actions paused",
		)
	})
	
	it("Should fail on invalid quoteId", async function () {
		await expect(this.user.requestToClosePosition(50)).to.be.reverted
	})
	
	it("Should fail on invalid quote state", async function () {
		await expect(this.user.requestToClosePosition(3)).to.be.revertedWith(
			"PartyAFacet: Invalid state",
		)
	})
	
	it("Should fail on invalid quantityToClose", async function () {
		const context: RunContext = this.context
		const quantity = await getQuoteQuantity(context, 1)
		await expect(
			this.user.requestToClosePosition(
				1,
				limitCloseRequestBuilder()
					.quantityToClose(quantity.add(decimal(1)))
					.build(),
			),
		).to.be.revertedWith("PartyAFacet: Invalid quantityToClose")
		await expect(
			this.user.requestToClosePosition(
				1,
				limitCloseRequestBuilder()
					.quantityToClose(quantity.sub(decimal(1)))
					.build(),
			),
		).to.be.revertedWith("PartyAFacet: Remaining quote value is low")
	})
	
	it("Should request limit successfully", async function () {
		const context: RunContext = this.context
		const validator = new CloseRequestValidator()
		const beforeOut = await validator.before(context, {
			user: this.user,
			hedger: this.hedger,
			quoteId: BigNumber.from(1),
		})
		const closePrice = decimal(1, 17)
		const quantityToClose = await getQuoteQuantity(context, 1)
		await this.user.requestToClosePosition(
			1,
			limitCloseRequestBuilder().quantityToClose(quantityToClose).closePrice(closePrice).build(),
		)
		await validator.after(context, {
			user: this.user,
			hedger: this.hedger,
			quoteId: BigNumber.from(1),
			closePrice: closePrice,
			quantityToClose: quantityToClose,
			beforeOutput: beforeOut,
		})
	})
	
	it("Should request limit successfully partially", async function () {
		const context: RunContext = this.context
		const quantity = await getQuoteQuantity(context, 1)
		const validator = new CloseRequestValidator()
		const beforeOut = await validator.before(context, {
			user: this.user,
			hedger: this.hedger,
			quoteId: BigNumber.from(1),
		})
		const closePrice = decimal(1, 17)
		const quantityToClose = quantity.div(2)
		await this.user.requestToClosePosition(
			1,
			limitCloseRequestBuilder().quantityToClose(quantityToClose).closePrice(closePrice).build(),
		)
		await validator.after(context, {
			user: this.user,
			hedger: this.hedger,
			quoteId: BigNumber.from(1),
			closePrice: closePrice,
			quantityToClose: quantityToClose,
			beforeOutput: beforeOut,
		})
	})
	
	it("Should request market successfully", async function () {
		const context: RunContext = this.context
		const validator = new CloseRequestValidator()
		const beforeOut = await validator.before(context, {
			user: this.user,
			hedger: this.hedger,
			quoteId: BigNumber.from(1),
		})
		const closePrice = decimal(1, 17)
		const quantityToClose = await getQuoteQuantity(context, 1)
		await this.user.requestToClosePosition(
			1,
			marketCloseRequestBuilder().quantityToClose(quantityToClose).closePrice(closePrice).build(),
		)
		await validator.after(context, {
			user: this.user,
			hedger: this.hedger,
			quoteId: BigNumber.from(1),
			closePrice: closePrice,
			quantityToClose: quantityToClose,
			beforeOutput: beforeOut,
		})
	})
	
	it("Should request market successfully partially", async function () {
		const context: RunContext = this.context
		const quantity = await getQuoteQuantity(context, 1)
		const validator = new CloseRequestValidator()
		const beforeOut = await validator.before(context, {
			user: this.user,
			hedger: this.hedger,
			quoteId: BigNumber.from(1),
		})
		const closePrice = decimal(1, 17)
		const quantityToClose = quantity.div(2)
		await this.user.requestToClosePosition(
			1,
			marketCloseRequestBuilder().quantityToClose(quantityToClose).closePrice(closePrice).build(),
		)
		await validator.after(context, {
			user: this.user,
			hedger: this.hedger,
			quoteId: BigNumber.from(1),
			closePrice: closePrice,
			quantityToClose: quantityToClose,
			beforeOutput: beforeOut,
		})
	})
	
	it("Should expire close request", async function () {
		const context: RunContext = this.context
		await this.user.requestToClosePosition(
			1,
			limitCloseRequestBuilder()
				.quantityToClose(await getQuoteQuantity(context, 1))
				.closePrice(decimal(1, 17))
				.build(),
		)
		await time.increase(1000)
		await context.partyAFacet.expireQuote([ 1 ])
		let q = await context.viewFacet.getQuote(1)
		expect(q.quoteStatus).to.be.equal(QuoteStatus.OPENED)
	})
	
	describe("Fill Close Request", async function () {
		beforeEach(async function () {
			const context: RunContext = this.context
			await this.user.requestToClosePosition(
				1,
				limitCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 1))
					.closePrice(decimal(1))
					.build(),
			)
			await this.user.requestToClosePosition(
				2,
				limitCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 2))
					.closePrice(decimal(1))
					.build(),
			)
			await this.user.requestToClosePosition(
				4,
				marketCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 4))
					.closePrice(decimal(1))
					.build(),
			)
		})
		
		it("Should fail on invalid partyB", async function () {
			const context: RunContext = this.context
			await expect(
				this.hedger2.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(decimal(1))
						.build(),
				),
			).to.be.revertedWith("Accessibility: Should be partyB of quote")
		})
		
		it("Should fail on paused partyB", async function () {
			const context: RunContext = this.context
			await pausePartyB(context)
			await expect(
				this.hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(decimal(1))
						.build(),
				),
			).to.be.revertedWith("Pausable: PartyB actions paused")
		})
		
		it("Should fail on fill amount", async function () {
			const context: RunContext = this.context
			const quantity = await getQuoteQuantity(context, 1)
			await expect(
				this.hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(quantity.add(decimal(1)))
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Invalid filledAmount")
			await expect(
				this.hedger.fillCloseRequest(
					4,
					limitFillCloseRequestBuilder()
						.filledAmount(quantity.sub(decimal(1)))
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Invalid filledAmount")
		})
		
		it("Should fail on invalid close price", async function () {
			const context: RunContext = this.context
			await expect(
				this.hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(decimal(1, 17))
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Closed price isn't valid")
			
			await expect(
				this.hedger.fillCloseRequest(
					2,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 2))
						.closedPrice(decimal(2))
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Closed price isn't valid")
		})
		
		it("Should fail on negative balance of partyA/partyB", async function () {
			const context: RunContext = this.context
			await expect(
				this.hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(decimal(1))
						.upnlPartyA(decimal(-575))
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
			await expect(
				this.hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(decimal(1))
						.upnlPartyB(decimal(-410))
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
		})
		
		it("Should fail on partyB becoming liquidatable", async function () {
			const context: RunContext = this.context
			await expect(
				this.hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(decimal(1))
						.upnlPartyB(decimal(-300))
						.price(decimal(1, 17))
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
			await expect(
				this.hedger.fillCloseRequest(
					2,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 2))
						.closedPrice(decimal(1, 17))
						.upnlPartyB(decimal(-300))
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
		})
		
		it("Should fail on partyA becoming liquidatable", async function () {
			const context: RunContext = this.context
			
			let quantity = await getQuoteQuantity(context, 1)
			let price = decimal(11, 17)
			let closePrice = decimal(1)
			let userAvailable = this.user_allocated
				.sub(await getTotalLockedValuesForQuoteIds(context, [ 2, 4 ], false))
				.sub(await getTradingFeeForQuotes(context, [ 1, 2, 3, 4 ]))
				.sub(unDecimal(quantity.mul(price.sub(closePrice))))
			
			await expect(
				this.hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(quantity)
						.closedPrice(closePrice)
						.upnlPartyA(userAvailable.add(decimal(1)).mul(-1))
						.price(price)
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
			
			quantity = await getQuoteQuantity(context, 1)
			price = decimal(1, 17)
			closePrice = decimal(1)
			userAvailable = this.user_allocated
				.sub(await getTotalLockedValuesForQuoteIds(context, [ 1, 4 ], false))
				.sub(await getTradingFeeForQuotes(context, [ 1, 2, 3, 4 ]))
				.sub(unDecimal(quantity.mul(closePrice.sub(price))))
			
			await expect(
				this.hedger.fillCloseRequest(
					2,
					limitFillCloseRequestBuilder()
						.filledAmount(quantity)
						.closedPrice(closePrice)
						.upnlPartyA(userAvailable.add(decimal(1)).mul(-1))
						.price(price)
						.build(),
				),
			).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
		})
		
		it("Should fail due to expired request", async function () {
			const context: RunContext = this.context
			await time.increase(1000)
			let closePrice = decimal(11, 17)
			await expect(
				this.hedger.fillCloseRequest(
					1,
					limitFillCloseRequestBuilder()
						.filledAmount(await getQuoteQuantity(context, 1))
						.closedPrice(closePrice)
						.build(),
				),
			).to.be.revertedWith("PartyBFacet: Quote is expired")
		})
		
		it("Should run successfully for limit", async function () {
			const context: RunContext = this.context
			const validator = new FillCloseRequestValidator()
			const beforeOut = await validator.before(context, {
				user: this.user,
				hedger: this.hedger,
				quoteId: BigNumber.from(1),
			})
			let closePrice = decimal(11, 17)
			const filledAmount = await getQuoteQuantity(context, 1)
			await this.hedger.fillCloseRequest(
				1,
				limitFillCloseRequestBuilder().filledAmount(filledAmount).closedPrice(closePrice).build(),
			)
			await validator.after(context, {
				user: this.user,
				hedger: this.hedger,
				quoteId: BigNumber.from(1),
				closePrice: closePrice,
				fillAmount: filledAmount,
				beforeOutput: beforeOut,
			})
		})
		
		it("Should run successfully partially for limit", async function () {
			const context: RunContext = this.context
			const closePrice = decimal(11, 17)
			const quantity = await getQuoteQuantity(context, 1)
			const filledAmount = quantity.div(2)
			const validator = new FillCloseRequestValidator()
			const beforeOut = await validator.before(context, {
				user: this.user,
				hedger: this.hedger,
				quoteId: BigNumber.from(1),
			})
			await this.hedger.fillCloseRequest(
				1,
				limitFillCloseRequestBuilder().filledAmount(filledAmount).closedPrice(closePrice).build(),
			)
			await validator.after(context, {
				user: this.user,
				hedger: this.hedger,
				quoteId: BigNumber.from(1),
				closePrice: closePrice,
				fillAmount: filledAmount,
				beforeOutput: beforeOut,
			})
		})
		
		it("Should run successfully for market", async function () {
			const context: RunContext = this.context
			let closePrice = decimal(11, 17)
			const validator = new FillCloseRequestValidator()
			const beforeOut = await validator.before(context, {
				user: this.user,
				hedger: this.hedger,
				quoteId: BigNumber.from(4),
			})
			const filledAmount = await getQuoteQuantity(context, 4)
			await this.hedger.fillCloseRequest(
				4,
				marketFillCloseRequestBuilder().filledAmount(filledAmount).closedPrice(closePrice).build(),
			)
			await validator.after(context, {
				user: this.user,
				hedger: this.hedger,
				quoteId: BigNumber.from(4),
				closePrice: closePrice,
				fillAmount: filledAmount,
				beforeOutput: beforeOut,
			})
		})
	})
	
	describe("Cancel Close Request", async function () {
		beforeEach(async function () {
			const context: RunContext = this.context
			await this.user.requestToClosePosition(
				1,
				limitCloseRequestBuilder()
					.quantityToClose(await getQuoteQuantity(context, 4))
					.build(),
			)
		})
		
		it("Should fail on invalid quoteId", async function () {
			await expect(this.user.requestToCancelCloseRequest(3)).to.be.reverted
		})
		
		it("Should fail on invalid partyA", async function () {
			const context: RunContext = this.context
			await expect(
				context.partyAFacet.connect(context.signers.user2).requestToCancelCloseRequest(1),
			).to.be.revertedWith("Accessibility: Should be partyA of quote")
		})
		
		it("Should fail on paused partyA", async function () {
			const context: RunContext = this.context
			await pausePartyA(context)
			await expect(this.user.requestToCancelCloseRequest(1)).to.be.revertedWith(
				"Pausable: PartyA actions paused",
			)
		})
		
		it("Should fail on invalid state", async function () {
			await expect(this.user.requestToCancelCloseRequest(2)).to.be.revertedWith(
				"PartyAFacet: Invalid state",
			)
		})
		
		it("Should send cancel request successfully", async function () {
			const context: RunContext = this.context
			const validator = new CancelCloseRequestValidator()
			const beforeOut = await validator.before(context, {
				user: this.user,
				hedger: this.hedger,
				quoteId: BigNumber.from(1),
			})
			await this.user.requestToCancelCloseRequest(1)
			await validator.after(context, {
				user: this.user,
				hedger: this.hedger,
				quoteId: BigNumber.from(1),
				beforeOutput: beforeOut,
			})
		})
		
		it("Should expire request", async function () {
			const context: RunContext = this.context
			await time.increase(1000)
			await this.user.requestToCancelCloseRequest(1)
			expect((await context.viewFacet.getQuote(1)).quoteStatus).to.be.equal(QuoteStatus.OPENED)
		})
		
		describe("Accepting cancel request", async function () {
			this.beforeEach(async function () {
				await this.user.requestToCancelCloseRequest(1)
			})
			
			it("Should fail on invalid quoteId", async function () {
				await expect(this.hedger.acceptCancelCloseRequest(3)).to.be.reverted
			})
			
			it("Should fail on invalid partyB", async function () {
				await expect(this.hedger2.acceptCancelCloseRequest(1)).to.be.revertedWith(
					"Accessibility: Should be partyB of quote",
				)
			})
			
			it("Should fail on paused partyB", async function () {
				const context: RunContext = this.context
				await pausePartyB(context)
				await expect(this.hedger.acceptCancelCloseRequest(1)).to.be.revertedWith(
					"Pausable: PartyB actions paused",
				)
			})
			
			it("Should fail on invalid state", async function () {
				await expect(this.hedger.acceptCancelCloseRequest(2)).to.be.revertedWith(
					"PartyBFacet: Invalid state",
				)
			})
			
			it("Should run successfully", async function () {
				const context: RunContext = this.context
				const validator = new AcceptCancelCloseRequestValidator()
				const beforeOut = await validator.before(context, {
					user: this.user,
					hedger: this.hedger,
					quoteId: BigNumber.from(1),
				})
				await this.hedger.acceptCancelCloseRequest(1)
				await validator.after(context, {
					user: this.user,
					hedger: this.hedger,
					quoteId: BigNumber.from(1),
					beforeOutput: beforeOut,
				})
			})
		})
	})
	
	describe("Emergency Close", async function () {
		beforeEach(async function () {
			const context: RunContext = this.context
		})
		
		it("Should fail when not emergency mode", async function () {
			await expect(
				this.hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().build()),
			).to.be.revertedWith("Pausable: It isn't emergency mode")
		})
		
		describe("Emergency mode activated", async function () {
			beforeEach(async function () {
				const context: RunContext = this.context
				await context.controlFacet.setPartyBEmergencyStatus(
					[ await this.hedger2.getAddress() ],
					true,
				)
				await context.controlFacet.setPartyBEmergencyStatus([ await this.hedger.getAddress() ], true)
			})
			
			it("Should fail on invalid partyB", async function () {
				await expect(
					this.hedger2.emergencyClosePosition(1, emergencyCloseRequestBuilder().build()),
				).to.be.revertedWith("Accessibility: Should be partyB of quote")
			})
			
			it("Should fail on paused partyB", async function () {
				const context: RunContext = this.context
				await pausePartyB(context)
				await expect(
					this.hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().build()),
				).to.be.revertedWith("Pausable: PartyB actions paused")
			})
			
			it("Should fail on negative balance of partyA/partyB", async function () {
				await expect(
					this.hedger.emergencyClosePosition(
						1,
						emergencyCloseRequestBuilder().upnlPartyA(decimal(-575)).build(),
					),
				).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
				await expect(
					this.hedger.emergencyClosePosition(
						1,
						emergencyCloseRequestBuilder().upnlPartyB(decimal(-410)).build(),
					),
				).to.be.revertedWith("LibSolvency: Available balance is lower than zero")
			})
			
			it("Should run successfully", async function () {
				const context: RunContext = this.context
				const validator = new EmergencyCloseRequestValidator()
				const beforeOut = await validator.before(context, {
					user: this.user,
					hedger: this.hedger,
					quoteId: BigNumber.from(1),
				})
				await this.hedger.emergencyClosePosition(1, emergencyCloseRequestBuilder().build())
				await validator.after(context, {
					user: this.user,
					hedger: this.hedger,
					quoteId: BigNumber.from(1),
					price: decimal(1),
					beforeOutput: beforeOut,
				})
			})
		})
	})
}
