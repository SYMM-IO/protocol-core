import fs, {writeFileSync} from "fs"
import {dirname} from "path"

const BASE_PATH = "./tasks/data";

export function readData(fileName: string): any {
    createDirectory(BASE_PATH)
    return JSON.parse(fs.readFileSync(`${BASE_PATH}/${fileName}`, "utf8"));
}

export function writeData(relativePath: string, data: object): void {
    createDirectory(BASE_PATH)
    const dirPath = dirname(relativePath)
    createDirectory(dirPath)
    writeFileSync(`${BASE_PATH}/${relativePath}`, JSON.stringify(data, null, 2))
}

export function fileExists(path: string): boolean {
    return fs.existsSync(path)
}

export function createDirectory(path: string): void {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path, {recursive: true})
    }
}
