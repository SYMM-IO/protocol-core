import sys


def modify_signature_checks(file_path: str, flag: int) -> None:
	"""Modify signature checks in a file based on the flag.

	Args:
		file_path: The path to the file to be modified.
		flag: If 1, comment out signature checks. If 0, uncomment them.
	"""
	with open(file_path, "r", encoding="utf-8") as file:
		lines = file.readlines()

	inside_signature_check = False
	modified_lines = []

	for line in lines:
		if "// == SignatureCheck( ==" in line:
			inside_signature_check = True
			modified_lines.append(line)  # Keep the start marker line as it is
			continue

		if "// == ) ==" in line:
			inside_signature_check = False
			modified_lines.append(line)  # Keep the end marker line as it is
			continue

		if inside_signature_check:
			if flag == 1 and not line.strip().startswith("//"):
				# Comment out the line
				modified_lines.append("// " + line)
			elif flag == 0 and line.strip().startswith("//"):
				# Uncomment the line by removing "// "
				modified_lines.append(line[line.index("// ") + 3:])
			else:
				modified_lines.append(line)
		else:
			modified_lines.append(line)

	with open(file_path, "w", encoding="utf-8") as file:
		file.writelines(modified_lines)

	print(f"Updated file saved to {file_path}")


if __name__ == "__main__":
	if len(sys.argv) != 2:
		print("Usage: python update_sig_checks.py <flag>")
		sys.exit(1)

	flag = int(sys.argv[1])
	file_path = "./contracts/libraries/LibMuon.sol"

	modify_signature_checks(file_path, flag)
