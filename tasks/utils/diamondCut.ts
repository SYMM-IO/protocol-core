import {FunctionFragment, Interface} from "@ethersproject/abi"
import {BaseContract, ContractFactory} from "@ethersproject/contracts"
import {keccak256} from "@ethersproject/keccak256"
import {toUtf8Bytes} from "@ethersproject/strings"

export enum FacetCutAction {
	Add,
	Replace,
	Remove,
}

function getSighash(functionFragment: FunctionFragment): string {
	return keccak256(toUtf8Bytes(functionFragment.format())).slice(0, 10)
}

export function getSelectors(contract: BaseContract | ContractFactory) {
	const fragments = Object.values(contract.interface.fragments).filter(
		(fragment): fragment is FunctionFragment => fragment.type === 'function'
	)

	const selectors = fragments.reduce((acc, fragment) => {
		if (fragment.name !== 'init') {
			acc.push(getSighash(fragment))
		}
		return acc
	}, [] as string[])

	const remove = (functionNames: string[]) => {
		return selectors.filter(selector => {
			for (const functionName of functionNames) {
				const fragment = contract.interface.getFunction(functionName)
				if (fragment && selector === getSighash(fragment)) {
					return false
				}
			}
			return true
		})
	}

	const get = (functionNames: string[]) => {
		return selectors.filter(selector => {
			for (const functionName of functionNames) {
				const fragment = contract.interface.getFunction(functionName)
				if (fragment && selector === getSighash(fragment)) {
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

export function getSelector(func: string) {
	const abiInterface = new Interface([func])
	const fragment = Object.values(abiInterface.fragments)[0] as FunctionFragment
	return getSighash(fragment)
}