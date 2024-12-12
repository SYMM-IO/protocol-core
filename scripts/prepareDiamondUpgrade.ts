import { generateDiamondCut } from "./utils/diamondUtils"

async function main() {
	const config = {
		diamondAddress: "",
		facets: [
			{ name: "AccountFacet", address: "" },
			{ name: "ControlFacet", address: "" },
			{ name: "LiquidationFacet", address: "" },
			{ name: "PartyAFacet", address: "" },
			{ name: "BridgeFacet", address: "" },
			{ name: "ViewFacet", address: "" },
			{ name: "FundingRateFacet", address: "" },
			{ name: "ForceActionsFacet", address: "" },
			{ name: "SettlementFacet", address: "" },
			{ name: "PartyBPositionActionsFacet", address: "" },
			{ name: "PartyBQuoteActionsFacet", address: "" },
			{ name: "PartyBGroupActionsFacet", address: "" },
		],
		ignoreSelectors: {
			adding: [
				"0x56129889", // forceClosePosition(new)
				"0x3bc98be1", // settleAndForceClosePosition
			],
			removing: [
				"0x1f931c1c", // diamondCut
				"0xea4f9efd", // forceClosePosition(old)
			],
			replacing: [
				"0xcdffacc6", // facetAddress
				"0x52ef6b2c", // facetAddress
				"0xadfca15e", // facetFunctionSelectors
				"0x7a0ed627", // facets
				"0x01ffc9a7", // supportsInterface
			],
		},
	}

	const diamondCut = await generateDiamondCut(config)
	console.log("\nDiamond Cut:")
	console.log(diamondCut)
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
