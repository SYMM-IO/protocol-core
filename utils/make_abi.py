#!/usr/bin/env python3
import json
import os
import re


def scandir(directory_name):
    sub_folders = [f.path for f in os.scandir(directory_name) if f.is_dir()]
    for directory_name in list(sub_folders):
        sub_folders.extend(scandir(directory_name))
    return sub_folders


contract_address = "artifacts/contracts/facets"
facets_dirs = scandir(contract_address)


def remove_duplicates(abi_list):
    unique_abi = []
    seen = set()
    for item in abi_list:
        # Convert the item to a JSON string for hashing
        item_str = json.dumps(item, sort_keys=True)
        if item_str not in seen:
            seen.add(item_str)
            unique_abi.append(item)
    return unique_abi


def main():
    abi_data = []
    for address in facets_dirs:
        print(f"Checking {address}")
        file = [f"{address}/{f}" for f in os.listdir(address) if re.fullmatch(".*\.json", f) and
                not re.fullmatch('.*\.dbg\.json', f)]
        if len(file) == 0:
            continue
        file = file[0]
        with open(file) as f:
            data = json.loads(f.read())
            abi_data += data['abi']

    # Remove duplicates
    unique_abi_data = remove_duplicates(abi_data)

    with open('abis/symmio.json', 'w') as f:
        json.dump(unique_abi_data, f, indent=4)


if __name__ == '__main__':
    main()
