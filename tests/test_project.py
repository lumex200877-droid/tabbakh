"""Source/packaging checks only; these do NOT execute or type-check GDScript."""

import importlib.util
import re
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("pack", ROOT / "scripts/package_project.py")
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)


class ProjectStructure(unittest.TestCase):
    def test_scene_and_script_paths_exist(self):
        for path in [ROOT / "project.godot", *ROOT.glob("scenes/*.tscn"), *ROOT.glob("game/*.gd"),
                     *ROOT.glob("tests/*.gd")]:
            for resource in re.findall(r'res://([^"\n]+)', path.read_text()):
                self.assertTrue((ROOT / resource).is_file(), (path, resource))

    def test_no_network_or_process_execution_in_game(self):
        for path in ROOT.glob("game/*.gd"):
            text = path.read_text()
            for token in ["HTTPRequest", "HTTPClient", "WebSocketPeer", "ENetMultiplayerPeer",
                          "OS.execute", "OS.create_process", "JavaScriptBridge", "load_from_system"]:
                self.assertNotIn(token, text, path)

    def test_android_is_offline_and_no_keystore(self):
        text = (ROOT / "export_presets.cfg").read_text()
        self.assertIn('platform="Android"', text)
        self.assertIn("permissions/internet=false", text)
        self.assertIn("architectures/arm64-v8a=true", text)
        self.assertNotIn("keystore/release_password", text)

    def test_arabic_font_and_license_present(self):
        font = ROOT / "assets/fonts/NotoSansArabic.ttf"
        self.assertEqual(font.read_bytes()[:4], b"\x00\x01\x00\x00")
        self.assertGreater(font.stat().st_size, 100000)
        self.assertIn("SIL OPEN FONT LICENSE", (ROOT / "assets/fonts/OFL.txt").read_text())

    def test_package_contains_editable_game_and_no_environment(self):
        with tempfile.TemporaryDirectory() as folder:
            output = pack.package(Path(folder) / "game.zip")
            with zipfile.ZipFile(output) as archive:
                names = archive.namelist()
                self.assertIsNone(archive.testzip())
                self.assertEqual(len(names), len(set(names)))
                for expected in ["project.godot", "game/main.gd", "game/island_state.gd",
                                 "tests/test_game.gd", "assets/fonts/OFL.txt", "README.md"]:
                    self.assertIn("pocket-oasis/" + expected, names)
                for name in names:
                    self.assertNotIn("..", Path(name).parts)
                    self.assertNotIn(".git", Path(name).parts)
                    self.assertFalse(any(p in Path(name).parts for p in
                                         [".godot", ".claude", "replica", "__pycache__", "build"]))
                    self.assertNotIn(Path(name).suffix, [".apk", ".aab", ".jks", ".keystore"])

    def test_palette_matches_design_tokens(self):
        import json
        tokens = json.loads((ROOT / "assets/design-tokens.json").read_text())
        source = (ROOT / "game/world_data.gd").read_text()
        for color in tokens["color"].values():
            self.assertIn(f'Color("{color.lstrip("#")}")', source)


if __name__ == "__main__":
    unittest.main()
