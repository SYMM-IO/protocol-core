import { BigNumber } from "ethers";
import { randomBigNumber } from "./RandomUtils";

export async function getPrice(symbol: string) {
  const def = BigNumber.from(200000).mul(10).pow(18);
  if (process.env.TEST_MODE != "fuzz") return def;

  // const randomInteger = Math.floor(Math.random() * 1e18)+1;
  // const randomValue = BigNumber.from(randomInteger.toString());

  let randomValue = randomBigNumber(BigNumber.from('1200000000000000000000'),BigNumber.from('1000000000000000000'))


  return randomValue;
}
