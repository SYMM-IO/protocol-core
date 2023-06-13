import { BigNumber } from "@ethersproject/bignumber";
import { JsonRpcProvider } from "@ethersproject/providers";
import { formatEther } from "@ethersproject/units";

export async function generateGasReport(provider: JsonRpcProvider, totalGasUsed: BigNumber): Promise<void> {
  const gasPrice = await provider.getGasPrice();
  console.log("Total Gas Consumption: ");
  console.table({
    gasUsed: totalGasUsed.toString(),
    gasPrice: gasPrice.toString(),
    gasCostEther: formatEther(totalGasUsed.mul(gasPrice)).toString(),
  });
}
