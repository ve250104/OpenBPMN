"""Optional maintainer task, never part of npm install/build/runtime.

In a disposable Python >=3.10 venv install fonttools==4.64.0 brotli==1.2.0,
then run this script after npm run build has copied the pinned WOFF2 assets.
Uses fontTools' documented TTFont/cmap/hmtx APIs, not browser/system fonts:
https://fonttools.readthedocs.io/en/latest/ttLib/ttFont.html
"""
import hashlib
import json
from pathlib import Path

from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'assets/runtime/manifest.json').read_text())
faces = []
for face in manifest['font']['faces']:
    path = root / 'assets/fonts' / face['file']
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest == face['sha256']
    with TTFont(path) as font:
        units = font['head'].unitsPerEm
        advances = {str(code): round(font['hmtx'][glyph][0] / units, 6)
                    for code, glyph in sorted(font.getBestCmap().items())}
    faces.append({'file': face['file'], 'sha256': digest, 'weight': face['weight'], 'advances': advances})
result = {'source': manifest['font']['source'], 'generator': 'fonttools==4.64.0; brotli==1.2.0', 'faces': faces}
(root / 'assets/fonts/metrics.json').write_text(json.dumps(result, separators=(',', ':'), ensure_ascii=True) + '\n')
