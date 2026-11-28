"""Extract shared world constants from the existing Godot project for the web preview.
Run this after editing world_data.gd. Use --check in CI to detect drift.
"""
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def export():
    source = (ROOT / "game/world_data.gd").read_text()
    data = {}
    for name in ["GRID", "WORLD_RADIUS", "GROW_SECONDS", "STACK_LIMIT", "BUILD_LIMIT"]:
        data[name] = float(re.search(rf"const {name} := ([\d.]+)", source)[1])
    for name in ["TREES", "ROCKS", "PLOTS"]:
        body = re.search(rf"const {name} := \[(.*?)\]", source, re.S)[1]
        data[name] = [[float(x), float(z)] for x, z in
                      re.findall(r"Vector2i?\((-?[\d.]+),\s*(-?[\d.]+)\)", body)]
    for name in ["COSTS", "BUILD_NAMES", "LABELS"]:
        body = re.search(rf"const {name} := (\{{[^\n]*\}}|\{{.*?\n\}})", source, re.S)[1]
        data[name] = json.loads(re.sub(r",\s*}", "}", body))
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    target = ROOT / "web/world-data.json"
    content = export()
    if "--check" in sys.argv:
        if not target.exists() or target.read_text() != content:
            raise SystemExit("web/world-data.json is stale: run scripts/export_web_data.py")
        print("Web world constants match Godot source.")
    else:
        target.parent.mkdir(exist_ok=True)
        target.write_text(content)
        print(target)
