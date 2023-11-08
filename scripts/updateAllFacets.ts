import {Contract, ContractFactory} from "ethers"
import {ethers} from "hardhat"

export enum FacetCutAction {
    Add,
    Replace,
    Remove,
}

// Get function selectors from ABI
export function getSelectors(contract: Contract | ContractFactory) {
    const signatures = Object.keys(contract.interface.functions)

    const selectors = signatures.reduce((acc, val) => {
        if (val !== "init(bytes)") {
            acc.push(contract.interface.getSighash(val))
        }
        return acc
    }, [] as string[])

    const remove = (functionNames: string[]) => {
        return selectors.filter(val => {
            for (const functionName of functionNames) {
                if (val === contract.interface.getSighash(functionName)) {
                    return false
                }
            }
            return true
        })
    }

    const get = (functionNames: string[]) => {
        return selectors.filter(val => {
            for (const functionName of functionNames) {
                if (val === contract.interface.getSighash(functionName)) {
                    return true
                }
            }
            return false
        })
    }

    return {
        selectors,
        remove,
        get,
    }
}

async function main() {
    let addr = ""
    const diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", addr)

    let facets = {
        AccountFacet: "",
        ControlFacet: "",
        DiamondLoupeFacet: "",
        LiquidationFacet: "",
        PartyAFacet: "",
        PartyBFacet: "",
        ViewFacet: "",
        FundingRateFacet: "",
    }
    let cutList = []
    for (const facet in facets) {
        if (!facets.hasOwnProperty(facet))
            continue
        const facetAddr = facets[facet]
        console.log(`Updating ${facet} with impl in ${facetAddr}`)
        const NewFacet = await ethers.getContractFactory(facet)
        const selectors = getSelectors(NewFacet).selectors
        cutList.push({
            facetAddress: facetAddr,
            action: FacetCutAction.Replace,
            functionSelectors: selectors,
        })
    }
    await diamondCutFacet.diamondCut(
        cutList,
        ethers.constants.AddressZero,
        "0x",
    )
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
