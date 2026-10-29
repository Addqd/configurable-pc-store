"""Read-only verification of user-supplied PC Builder reference PNGs.

Usage from project root:
    python scripts/verify_references.py
"""
import json
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REF_ROOT = ROOT / 'docs' / 'references'
MANIFEST = REF_ROOT / 'manifest.json'
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'


def crc32_file(path: Path) -> str:
    checksum = 0
    with path.open('rb') as stream:
        while block := stream.read(1024 * 1024):
            checksum = zlib.crc32(block, checksum)
    return f'{checksum:08x}'


def main() -> int:
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    dest = REF_ROOT / data['subdirectory']
    failures = []
    print(f'Reference folder: {dest}')
    for item in data['files']:
        name = item['file']
        path = dest / name
        if not path.is_file():
            print(f'MISSING  {name}')
            failures.append(name)
            continue
        with path.open('rb') as f:
            signature = f.read(8)
        if signature != PNG_SIGNATURE:
            print(f'INVALID  {name}: not a PNG file')
            failures.append(name)
            continue
        expected_size = item['size_bytes']
        expected_crc = item['crc32']
        if path.stat().st_size != expected_size or crc32_file(path) != expected_crc:
            print(f'MISMATCH {name}: content differs from original RAR')
            failures.append(name)
            continue
        print(f'OK       {name}')
    print(f'\nVerified: {len(data["files"]) - len(failures)}/{len(data["files"])}')
    if failures:
        print('Add the PNGs from pcbuilder.rar to docs/references/pcbuilder/.')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
