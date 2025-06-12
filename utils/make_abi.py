#!/usr/bin/env python3
import json
import os
import re
from typing import List, Dict, Tuple


def scandir(directory_name: str) -> List[str]:
    """Recursively scan for subdirectories."""
    sub_folders = [f.path for f in os.scandir(directory_name) if f.is_dir()]
    for directory in list(sub_folders):
        sub_folders.extend(scandir(directory))
    return sub_folders


def get_abi_signature(item: Dict) -> str:
    """
    Generate a unique signature for an ABI item based on type, name, and inputs.
    This helps in identifying duplicate functions or events.
    """
    signature = item.get("type", "")
    if "name" in item:
        signature += ":" + item["name"]
    if "inputs" in item:
        inputs = item["inputs"]
        input_types = [inp.get("type", "") for inp in inputs]
        signature += "(" + ",".join(input_types) + ")"
    return signature


def remove_duplicates(abi_list: List[Dict]) -> Tuple[List[Dict], int]:
    """Remove duplicate ABI entries and return unique list with duplicate count."""
    unique_abi = []
    seen = set()
    duplicate_count = 0

    for item in abi_list:
        signature = get_abi_signature(item)
        if signature not in seen:
            seen.add(signature)
            unique_abi.append(item)
        else:
            duplicate_count += 1

    return unique_abi, duplicate_count


def process_directories(subdirs: List[str], output_filename: str, description: str):
    """Process a list of directories and create an ABI file."""
    abi_data = []
    total_files_processed = 0
    files_with_abi = 0

    print(f"\n=== Processing {description} ===")

    for subdir in subdirs:
        directory_path = os.path.join("artifacts", "contracts", subdir)
        if not os.path.exists(directory_path):
            print(f"Directory {directory_path} does not exist. Skipping.")
            continue

        # Get all subdirectories under the current subdir
        all_dirs = [directory_path] + scandir(directory_path)

        for address in all_dirs:
            files = [
                os.path.join(address, f)
                for f in os.listdir(address)
                if re.fullmatch(r".*\.json", f)
                and not re.fullmatch(r".*\.dbg\.json", f)
            ]

            if len(files) == 0:
                continue

            print(f"Checking {address} - {len(files)} files")

            for file in files:
                total_files_processed += 1
                try:
                    with open(file) as f:
                        data = json.load(f)
                        if (
                            "abi" in data and data["abi"]
                        ):  # Check if ABI exists and is not empty
                            abi_data += data["abi"]
                            files_with_abi += 1
                except json.JSONDecodeError as e:
                    print(f"Error parsing JSON file {file}: {e}")
                    continue
                except Exception as e:
                    print(f"Error reading file {file}: {e}")
                    continue

    # Remove duplicates
    unique_abi_data, duplicate_count = remove_duplicates(abi_data)

    # Save the ABI file
    os.makedirs("abis", exist_ok=True)  # Ensure the output directory exists

    output_path = os.path.join("abis", output_filename)
    with open(output_path, "w") as f:
        json.dump(unique_abi_data, f, indent=4)

    # Print summary
    print(f"\nSummary for {description}:")
    print(f"Directories processed: {subdirs}")
    print(f"Total files scanned: {total_files_processed}")
    print(f"Files with ABI: {files_with_abi}")
    print(f"Total ABI entries: {len(abi_data)}")
    print(f"Duplicates removed: {duplicate_count}")
    print(f"Unique entries saved: {len(unique_abi_data)}")
    print(f"Output: {output_path}")

    return len(unique_abi_data)


def process_specific_contract(
    contract_name: str, output_filename: str, description: str
):
    """Process a specific contract file and create an ABI file."""
    abi_data = []
    files_processed = 0

    print(f"\n=== Processing {description} ===")

    # Look for the contract in the multiAccount directory
    base_path = os.path.join("artifacts", "contracts", "multiAccount", contract_name)

    if not os.path.exists(base_path):
        print(f"Directory {base_path} does not exist.")
        return 0

    # Find the JSON file for this contract
    files = [
        os.path.join(base_path, f)
        for f in os.listdir(base_path)
        if f.endswith(".json") and not f.endswith(".dbg.json")
    ]

    for file in files:
        print(f"Processing {file}")
        files_processed += 1
        try:
            with open(file) as f:
                data = json.load(f)
                if "abi" in data and data["abi"]:
                    abi_data = data["abi"]  # For single contract, just use its ABI
                    break  # We found the contract ABI
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON file {file}: {e}")
        except Exception as e:
            print(f"Error reading file {file}: {e}")

    if not abi_data:
        print(f"No ABI found for {contract_name}")
        return 0

    # Remove duplicates (though unlikely in a single contract)
    unique_abi_data, duplicate_count = remove_duplicates(abi_data)

    # Save the ABI file
    os.makedirs("abis", exist_ok=True)

    output_path = os.path.join("abis", output_filename)
    with open(output_path, "w") as f:
        json.dump(unique_abi_data, f, indent=4)

    # Print summary
    print(f"\nSummary for {description}:")
    print(f"Contract: {contract_name}")
    print(f"Files processed: {files_processed}")
    print(f"Total ABI entries: {len(abi_data)}")
    print(f"Duplicates removed: {duplicate_count}")
    print(f"Unique entries saved: {len(unique_abi_data)}")
    print(f"Output: {output_path}")

    return len(unique_abi_data)


def main():
    # Process main contracts (facets, libraries, utils)
    main_subdirs = ["facets", "libraries", "utils"]
    main_count = process_directories(
        main_subdirs, "symmio.json", "Main Contracts (facets, libraries, utils)"
    )

    # Process MultiAccount contract specifically
    multiaccount_count = process_specific_contract(
        "MultiAccount.sol", "multiAccount.json", "MultiAccount Contract"
    )

    # Process SymmioPartyB contract specifically
    partyb_count = process_specific_contract(
        "SymmioPartyB.sol", "partyB.json", "SymmioPartyB Contract"
    )

    # Print final summary
    print("\n=== Final Summary ===")
    print(f"Total unique ABI entries in symmio.json: {main_count}")
    print(f"Total unique ABI entries in multiAccount.json: {multiaccount_count}")
    print(f"Total unique ABI entries in partyB.json: {partyb_count}")
    print("\nAll ABI files have been generated successfully!")


if __name__ == "__main__":
    main()
