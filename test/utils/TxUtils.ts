export async function runTx(prm: Promise<any>): Promise<any> {
	return await (await prm).wait()
}
