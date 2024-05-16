import fs, { writeFileSync } from "fs"
import { dirname } from "path"

export function readData(fileName: string): any {
  return JSON.parse(fs.readFileSync(`${fileName}`, "utf8"))
}

export function writeData(filePath: string, data: object): void {
  const dirPath = dirname(filePath)
  createDirectory(dirPath)
  writeFileSync(filePath, JSON.stringify(data, null, 2))
}

export function fileExists(path: string): boolean {
  return fs.existsSync(path)
}

export function createDirectory(path: string): void {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true })
  }
}
