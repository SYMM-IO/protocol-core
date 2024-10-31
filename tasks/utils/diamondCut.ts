import {Contract, ContractFactory} from "ethers"

export enum FacetCutAction {
	Add = 0,
	Replace = 1,
	Remove = 2,
}


export function getSelectors(ethers: any, contract: Contract | ContractFactory) {
	const functions = contract.interface.fragments.filter(
		(f) => f.type === 'function'
	)
	const selectors = functions.reduce((acc: string[], f) => {
		const signature = f.format('sighash')
		if (signature !== 'init(bytes)') {
			acc.push(ethers.id(signature).substring(0, 10))
		}
		return acc
	}, [])

	const remove = (functionNames: string[]) => {
		const sigHashesToRemove = functionNames.map((name) => {
			const fragment = contract.interface.getFunction(name)!
			return ethers.id(fragment.format('sighash')).substring(0, 10)
		})
		return selectors.filter((val) => !sigHashesToRemove.includes(val))
	}

	const get = (functionNames: string[]) => {
		const sigHashesToGet = functionNames.map((name) => {
			const fragment = contract.interface.getFunction(name)!
			return ethers.id(fragment.format('sighash')).substring(0, 10)
		})
		return selectors.filter((val) => sigHashesToGet.includes(val))
	}

	return {
		selectors,
		remove,
		get,
	}
}
