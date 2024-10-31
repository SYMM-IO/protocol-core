import os
import sys


def modify_backward_compatibility_lines(file_path: str, flag: int) -> None:
    """Modify lines in a file that have the backward compatibility comment.

    Args:
        file_path: The path to the file to be modified.
        flag:
            - If 1, comment out lines.
            - If 0, uncomment lines.
            - If 2, remove lines ending with the target comment.
    """
    target_comment = "// For backward compatibility, will be removed in future"

    with open(file_path, "r", encoding="utf-8") as file:
        lines = file.readlines()

    modified_lines = []

    for line in lines:
        stripped_line = line.rstrip()
        if stripped_line.endswith(target_comment):
            # Line ends with target comment
            if flag == 1:
                # Comment out the line if it's not already commented
                if not line.lstrip().startswith("//"):
                    modified_lines.append("// " + line)
                else:
                    # Already commented, keep as is
                    modified_lines.append(line)
            elif flag == 0:
                # Uncomment the line if it is commented
                if line.lstrip().startswith("//"):
                    # Find the position of the first occurrence of "//"
                    comment_index = line.find("//")
                    # Remove the leading "// " from the line
                    modified_line = line[:comment_index] + line[comment_index + 3:]
                    modified_lines.append(modified_line)
                else:
                    # Not commented, keep as is
                    modified_lines.append(line)
            elif flag == 2:
                # Remove the line entirely (do not add it to modified_lines)
                continue
            else:
                # Invalid flag, keep the line as is
                modified_lines.append(line)
        else:
            # Line does not end with target comment, keep as is
            modified_lines.append(line)

    with open(file_path, "w", encoding="utf-8") as file:
        file.writelines(modified_lines)

    print(f"Updated file saved to {file_path}")


def process_directory(directory_path: str, flag: int) -> None:
    """Process all files in the given directory and its subdirectories.

    Args:
        directory_path: The path to the directory containing the files to be modified.
        flag:
            - If 1, comment out lines.
            - If 0, uncomment lines.
            - If 2, remove lines ending with the target comment.
    """
    for root, dirs, files in os.walk(directory_path):
        for filename in files:
            # Process only Solidity files
            if filename.endswith('.sol'):
                file_path = os.path.join(root, filename)
                if os.path.isfile(file_path):
                    modify_backward_compatibility_lines(file_path, flag)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python update_backward_compatibility.py <flag>")
        print("Flags:")
        print("  1 - Comment out lines ending with the target comment.")
        print("  0 - Uncomment lines ending with the target comment.")
        print("  2 - Remove lines ending with the target comment.")
        sys.exit(1)

    flag = int(sys.argv[1])
    directory_path = "./contracts"

    process_directory(directory_path, flag)
