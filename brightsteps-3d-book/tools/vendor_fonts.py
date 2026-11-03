#!/usr/bin/env python3
"""Download the book's Google Fonts (OFL) for the offline Android build.

Usage: python3 tools/vendor_fonts.py
Writes vendor/fonts/*.woff2 and vendor/fonts/fonts.css (latin, latin-ext and arabic subsets only).
"""
import pathlib, re, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'vendor' / 'fonts'
CSS_URL = ('https://fonts.googleapis.com/css2?family=Andika:wght@400;700'
           '&family=Baloo+Bhaijaan+2:wght@500;700;800&family=Readex+Pro:wght@300;400;600;700&display=swap')
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
KEEP = {'latin', 'latin-ext', 'arabic'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
        return r.read()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    css = get(CSS_URL).decode('utf-8')
    blocks = re.findall(r'/\* ([a-z-]+) \*/\s*(@font-face\s*\{.*?\})', css, re.S)
    out = ['/* Andika, Baloo Bhaijaan 2 and Readex Pro: SIL Open Font License 1.1, from Google Fonts. */']
    for subset, block in blocks:
        if subset not in KEEP:
            continue
        fam = re.search(r"font-family:\s*'([^']+)'", block).group(1)
        wt = re.search(r'font-weight:\s*(\d+)', block).group(1)
        url = re.search(r'url\((https://[^)]+\.woff2)\)', block).group(1)
        name = f"{fam.lower().replace(' ', '-')}-{wt}-{subset}.woff2"
        (OUT / name).write_bytes(get(url))
        out.append(block.replace(url, name))
    (OUT / 'fonts.css').write_text('\n'.join(out) + '\n', encoding='utf-8')
    print('fonts:', len(out) - 1, 'faces')


if __name__ == '__main__':
    main()
