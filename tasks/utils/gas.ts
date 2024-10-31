import {JsonRpcProvider} from "@ethersproject/providers"
import {formatEther} from "@ethersproject/units"

export async function generateGasReport(provider: JsonRpcProvider, totalGasUsed: bigint): Promise<void> {
	const gasPrice = BigInt((await provider.getGasPrice()).toString())
	console.log("Total Gas Consumption: ")
	console.table({
		gasUsed: totalGasUsed.toString(),
		gasPrice: gasPrice.toString(),
		gasCostEther: formatEther(totalGasUsed * gasPrice).toString(),
	})
}
