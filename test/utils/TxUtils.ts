export async function runTx(prm: Promise<any>): Promise<any> {
	console.log('runTx')
	return await (await prm).wait()
}
