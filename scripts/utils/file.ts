import fs from "fs"

export type Addresses = {
  symmioAddress?: string,
  collateralAddress?: string,
  multiAccountAddress?: string,
  partyBAddress?: string,
  multicallAddress?: string,
}

export function loadAddresses(): Addresses {
  let output: Addresses = {}
  if (fs.existsSync("./output/addresses.json")) {
    output = JSON.parse(fs.readFileSync("./output/addresses.json", "utf8"))
  } else {
    if (!fs.existsSync("./output"))
      fs.mkdirSync("./output")
    output = {}
    fs.writeFileSync("./output/addresses.json", JSON.stringify(output))
  }
  return output
}

export function saveAddresses(content: Addresses): void {
  if (!fs.existsSync("./output/addresses.json")) {
    if (!fs.existsSync("./output"))
      fs.mkdirSync("./output")
  }
  fs.writeFileSync("./output/addresses.json", JSON.stringify(content))
}