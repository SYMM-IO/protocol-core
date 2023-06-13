import { BigNumber, utils } from "ethers";

import { decimal, unDecimal } from "./Common";

export function pick(array: any[]): any {
  return array[Math.floor(Math.random() * array.length)];
}

export function randomBigNumber(max: BigNumber, min?: BigNumber): BigNumber {
  if (min == null) return BigNumber.from(utils.randomBytes(32)).mod(max);
  const diff = max.sub(min!);
  return min!.add(randomBigNumber(diff));
}

export function randomBigNumberRatio(value: BigNumber, max: number, min?: number): BigNumber {
  return unDecimal(
    value.mul(
      randomBigNumber(
        decimal(Number(max.toFixed(4)) * 10000, 14),
        min != null ? decimal(Number(min.toFixed(4)) * 10000, 14) : undefined,
      ),
    ),
  );
}
