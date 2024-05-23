#!/usr/bin/env python3
import json
import os
import re

contract_address = "artifacts/contracts/facets"


def main():
    abi_data = []
    for root, dirs, files in os.walk(contract_address):
        for file in files:
            file_path = os.path.join(root, file)
            if re.fullmatch(r'.*\.json', file_path) and not re.fullmatch(r'.*\.dbg\.json', file_path):
                with open(file_path) as f:
                    data = json.loads(f.read())
                    abi_data += data['abi']
    abi_data.sort(key=lambda x: x.get('name'))
    with open('abi.json', 'w') as f:
        json.dump(abi_data, f, indent=3)


if __name__ == '__main__':
    main()
