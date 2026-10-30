"""Build static native faces from the exact variable Onest used in the preview."""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "work/font-tooling"))
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

source = ROOT / "assets/fonts/onest/source/Onest-variable.ttf"
destination = ROOT / "assets/fonts/onest"
destination.mkdir(parents=True, exist_ok=True)
assert (destination / "OFL.txt").is_file(), "The Onest license must accompany the fonts"
manifest = {"family": "Onest", "source": "https://github.com/google/fonts/tree/main/ofl/onest", "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "faces": []}
required = set(range(0x410, 0x450)) | {0x401, 0x451, 0x20BD} | set(range(0x30, 0x3A))
for weight in (400, 500, 600, 700, 800, 900):
    font = instantiateVariableFont(TTFont(source), {"wght": weight}, inplace=False, updateFontNames=True)
    assert not (required - set(font.getBestCmap())), "Russian/digit/ruble coverage missing"
    assert "fvar" not in font, "Native faces must be static"
    assert font["OS/2"].usWeightClass == weight
    path = destination / f"Onest-{weight}.ttf"
    font.save(path)
    manifest["faces"].append({"weight": weight, "file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
(destination / "SOURCE.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print("PASS: six static Onest faces, Cyrillic, digits and ruble checked")
