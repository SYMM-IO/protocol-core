import json

from web3 import Web3

rpc = ""
max_symbol_id = 100
contract_address = ""

w3 = Web3(Web3.HTTPProvider(rpc))

contract = w3.eth.contract(address=w3.to_checksum_address(contract_address), abi=json.loads('''[
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
]'''))

# Fetch symbols from the contract
symbols = contract.functions.getSymbols(0, max_symbol_id).call()

# Convert symbols into the desired JSON format
symbols_json = []
symbol_names = []
for symbol in symbols:
    if not symbol[2] or symbol[1].endswith("BYBIT") or symbol[1] in symbol_names:
        continue
    try:
        force_close_gap_ratio = contract.functions.forceCloseGapRatio(symbol[0]).call()
        force_close_data = force_close_gap_ratio
        print(f"Fetched forceCloseGapRatio for symbolId {symbol[0]}")
    except Exception as e:
        print(f"Error fetching forceCloseGapRatio for symbolId {symbol[0]}: {e}")
        force_close_data = 0  # Default value in case of failure
    symbol_dict = {
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
    }
    symbols_json.append(symbol_dict)
    symbol_names.append(symbol[1])

# Print the formatted JSON output
print(json.dumps(symbols_json, indent=2))
