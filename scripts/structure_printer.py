import os

SKIP = {"env", "__pycache__", ".git", ".venv", "node_modules"}


def print_tree(root=".", prefix=""):
    entries = [
        e for e in os.listdir(root)
        if e not in SKIP
    ]

    for index, entry in enumerate(entries):
        path = os.path.join(root, entry)

        is_last = index == len(entries) - 1

        connector = "└── " if is_last else "├── "

        print(prefix + connector + entry)

        if os.path.isdir(path):
            extension = "    " if is_last else "│   "
            print_tree(path, prefix + extension)


print(os.path.basename(os.getcwd()) + "/")
print_tree()