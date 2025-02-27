import json
from eth_hash.auto import keccak
import json

def get_function_selector(function_name, inputs):
    """
    Generate the function selector (first 4 bytes of keccak256 hash) for a function signature
    """
    # Create the function signature
    types = [input_['type'] for input_ in inputs]
    signature = f"{function_name}({','.join(types)})"

    # Get keccak256 hash and take first 4 bytes
    selector = keccak(signature.encode())[:4].hex()
    return selector, signature

def process_abi(abi_json):
    """
    Process ABI and return all function selectors
    """
    selectors = {}

    # Filter for function entries
    functions = [entry for entry in abi_json if entry.get('type') == 'function']

    # Generate selectors for each function
    for func in functions:
        name = func['name']
        inputs = func.get('inputs', [])
        selector, signature = get_function_selector(name, inputs)
        selectors[selector] = {
            'name': name,
            'signature': signature,
            'inputs': [input_['type'] for input_ in inputs],
            'stateMutability': func.get('stateMutability', '')
        }

    return selectors

def main():
    # Read ABI from file
    with open('abis/symmio.json', 'r') as f:
        abi = json.load(f)

    # Get selectors
    selectors = process_abi(abi)

    # Print results in a formatted way
    print(f"Found {len(selectors)} function selectors:\n")
    for selector, data in sorted(selectors.items(), key=lambda x: x[1]['name'].lower()):
        print(f"0x{selector} - {data['name']}")
        print(f"  Signature: {data['signature']}")
        print()

if __name__ == "__main__":
    main()