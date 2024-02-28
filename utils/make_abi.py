#!/usr/bin/env python3
import os
import json
import re


def scandir(directory_name):
    sub_folders = [f.path for f in os.scandir(directory_name) if f.is_dir()]
    for directory_name in list(sub_folders):
        sub_folders.extend(scandir(directory_name))
    return sub_folders


contract_address = "artifacts/contracts/facets"
facets_dirs = scandir(contract_address)


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
    with open('abi.json', 'w') as f:
        json.dump(abi_data, f, indent=4)


if __name__ == '__main__':
    main()
