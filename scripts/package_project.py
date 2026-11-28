"""Package the small editable game, not caches, secrets, APKs or installed skills.

Usage: python3 scripts/package_project.py [output.zip]
Default output is ignored build/pocket-oasis-source.zip.
"""

from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {"project.godot", "export_presets.cfg", "README.md", "requirements-dev.txt", ".gitignore", "package.json", "package-lock.json", "index.html", "vite.config.js"}
SOURCE_DIRS = {"game", "scenes", "assets", "docs", "tests", "scripts", ".github", "web", "public"}
EXTENSIONS = {".gd", ".tscn", ".ttf", ".txt", ".md", ".py", ".json", ".uid", ".yml", ".js", ".mjs", ".html", ".css"}


def project_files(root=ROOT):
    for name in sorted(ROOT_FILES):
        path = root / name
        if path.is_file():
            yield path
    for folder in sorted(SOURCE_DIRS):
        for path in sorted((root / folder).rglob("*")):
            if path.is_symlink() or not path.is_file():
                continue
            if "__pycache__" in path.parts or (path.suffix not in EXTENSIONS and path.name != ".gdignore"):
                continue
            yield path


def package(destination):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in project_files():
            archive.write(path, Path("pocket-oasis") / path.relative_to(ROOT))
    return destination


if __name__ == "__main__":
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "build/pocket-oasis-source.zip"
    print(package(output))
