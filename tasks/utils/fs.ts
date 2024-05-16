import fs from "fs"

const BASE_PATH = "./tasks/data"

export function readData(fileName: string): any {
  return JSON.parse(fs.readFileSync(`${BASE_PATH}/${fileName}`, "utf8"))
}

export function writeData(fileName: string, data: object): void {
  fs.writeFileSync(`${BASE_PATH}/${fileName}`, JSON.stringify(data))
}

export function fileExists(path: string): boolean {
  return fs.existsSync(path)
}
