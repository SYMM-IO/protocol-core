#!/usr/bin/env python3
import json
import os
import re

def scandir(directory_name):
    sub_folders = [f.path for f in os.scandir(directory_name) if f.is_dir()]
    for directory in list(sub_folders):
        sub_folders.extend(scandir(directory))
    return sub_folders

def get_abi_signature(item):
    """
    Generate a unique signature for an ABI item based on type, name, and inputs.
    This helps in identifying duplicate functions or events.
    """
    signature = item.get('type', '')
    if 'name' in item:
        signature += item['name']
    if 'inputs' in item:
        inputs = item['inputs']
        input_types = [inp.get('type', '') for inp in inputs]
        signature += '(' + ','.join(input_types) + ')'
    return signature

def remove_duplicates(abi_list):
    unique_abi = []
    seen = set()
    for item in abi_list:
        signature = get_abi_signature(item)
        if signature not in seen:
            seen.add(signature)
            unique_abi.append(item)
    return unique_abi

def main():
    # Define the list of subdirectories under 'contracts' to process
    subdirs = ['facets', 'libraries', 'utils']  # Modify this list as needed

    abi_data = []
    for subdir in subdirs:
        directory_path = os.path.join('artifacts', 'contracts', subdir)
        if not os.path.exists(directory_path):
            print(f"Directory {directory_path} does not exist. Skipping.")
            continue

        # Get all subdirectories under the current subdir
        facets_dirs = [directory_path] + scandir(directory_path)
        for address in facets_dirs:
            print(f"Checking {address}")
            files = [os.path.join(address, f) for f in os.listdir(address) if re.fullmatch(r".*\.json", f) and
                     not re.fullmatch(r".*\.dbg\.json", f)]
            if len(files) == 0:
                continue
            for file in files:
                with open(file) as f:
                    data = json.load(f)
                    if 'abi' in data:
                        abi_data += data['abi']

    # Remove duplicates
    unique_abi_data = remove_duplicates(abi_data)

    os.makedirs('abis', exist_ok=True)  # Ensure the output directory exists
    with open('abis/symmio.json', 'w') as f:
        json.dump(unique_abi_data, f, indent=4)

if __name__ == '__main__':
    main()
