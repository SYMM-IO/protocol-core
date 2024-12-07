import { ethers, network } from "hardhat"
import { DiamondCutFacet, DiamondCutFacet__factory, ViewFacet, ViewFacet__factory } from "../src/types"

export function shouldBehaveLikePreUpgradeTest() {

	const diamondAddress = "0x9A9F48888600FC9c05f11E03Eab575EBB2Fc2c8f"
	let diamondCut: DiamondCutFacet
	let viewFacet: ViewFacet

	beforeEach(async function () {
		diamondCut = DiamondCutFacet__factory.connect(diamondAddress, ethers.provider)
		viewFacet = ViewFacet__factory.connect(diamondAddress, ethers.provider)
	})

	it("should get data from viewFacet", async function () {
		const v = await viewFacet.getNextQuoteId()
		// state.set("getNextQuoteId", {
		// 	old: v.toString(),
		// })

		// // TODO ::: connect to admin
		// await diamondCut.diamondCut(
		// 	[
		// 		{
		// 			facetAddress: "",
		// 			action: "",
		// 			functionSelectors: [""],
		// 		},
		// 	],
		// 	ethers.ZeroAddress,
		// 	"0x",
		// )

		// const z = await viewFacet.getNextQuoteId()

		// state.set("getNextQuoteId", {
		// 	old: z.toString(),
		// })
	})
}
