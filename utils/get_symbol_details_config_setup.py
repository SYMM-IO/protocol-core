import json

from multicallable import Multicallable
from web3 import Web3

rpc = ""
max_symbol_id = 1000
contract_address = ""

w3 = Web3(Web3.HTTPProvider(rpc))
contract = Multicallable(w3.to_checksum_address(contract_address), json.loads('''[
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "start",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "size",
                "type": "uint256"
            }
        ],
        "name": "getSymbols",
        "outputs": [
            {
                "components": [
                    {"internalType": "uint256", "name": "symbolId", "type": "uint256"},
                    {"internalType": "string", "name": "name", "type": "string"},
                    {"internalType": "bool", "name": "isValid", "type": "bool"},
                    {"internalType": "uint256", "name": "minAcceptableQuoteValue", "type": "uint256"},
                    {"internalType": "uint256", "name": "minAcceptablePortionLF", "type": "uint256"},
                    {"internalType": "uint256", "name": "tradingFee", "type": "uint256"},
                    {"internalType": "uint256", "name": "maxLeverage", "type": "uint256"},
                    {"internalType": "uint256", "name": "fundingRateEpochDuration", "type": "uint256"},
                    {"internalType": "uint256", "name": "fundingRateWindowTime", "type": "uint256"}
                ],
                "internalType": "struct Symbol[]",
                "name": "",
                "type": "tuple[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "symbolId",
                "type": "uint256"
            }
        ],
        "name": "forceCloseGapRatio",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
]'''), w3)

symbols = contract.getSymbols([(0, max_symbol_id)]).call(n=max_symbol_id // 200 + 1, progress_bar=True)[0]

symbols_json = []
symbol_names = []
symbol_ids = [symbol[0] for symbol in symbols]

force_close_gap_ratios = contract.forceCloseGapRatio(symbol_ids).call(n=len(symbols) // 200 + 1, progress_bar=True)
for symbol, force_close_data in zip(symbols, force_close_gap_ratios):
    if not symbol[2] or symbol[1].endswith("BYBIT") or symbol[1] in symbol_names:
        continue
    symbol_names.append(symbol[1])
    symbols_json.append({
        "symbolId": symbol[0],
        "name": symbol[1],
        "isValid": symbol[2],
        "minAcceptableQuoteValue": symbol[3],
        "minAcceptablePortionLF": symbol[4],
        "tradingFee": 800000000000000 if symbol[1] not in ["BTCUSDT", "ETHUSDT"] else 600000000000000,
        "maxLeverage": symbol[6],
        "fundingRateEpochDuration": symbol[7],
        "fundingRateWindowTime": symbol[8],
        "forceCloseGapRatio": force_close_data
    })

print(json.dumps(symbols_json, indent=2))
