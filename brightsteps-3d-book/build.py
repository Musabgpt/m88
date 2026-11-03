#!/usr/bin/env python3
"""Builds BrightSteps3D_Book.html: the original BrightSteps 3D page with the 3D book as its home view.

Usage: python3 build.py [--artifact OUT]   (--artifact also writes a copy without the html/head/body wrapper)
"""
import pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
html = (SRC / 'original.html').read_text(encoding='utf-8')
css = (SRC / 'book.css').read_text(encoding='utf-8')
js = '\n'.join((SRC / f).read_text(encoding='utf-8') for f in
               ['book-engine.js', 'book-pages.js', 'book-pops-a.js', 'book-pops-b.js', 'book-pops-c.js', 'book-pops-d.js', 'book-app.js'])

def sub(old, new, count=1):
    global html
    if html.count(old) < 1:
        sys.exit('patch target not found: ' + old[:80])
    html = html.replace(old, new, count)

sub('<title>BrightSteps 3D</title>', '<title>BrightSteps 3D Book</title>')
sub('<meta name="description" content="كتيّب Year 2 · Autumn 2 كعالم تعليمي ثلاثي الأبعاد:',
    '<meta name="description" content="كتاب Year 2 · Autumn 2 ثلاثي الأبعاد تقلّب صفحاته، ولكل درس نموذج مجسّم يقفز من الصفحة:')
sub('family=Readex+Pro:wght@300;400;600', 'family=Readex+Pro:wght@300;400;600;700')
sub('\n</style>\n</head>', '\n' + css + '\n</style>\n</head>')
sub("if(h.startsWith('w-')&&WB[h.slice(2)])this.world(h.slice(2));else if(h==='parent')this.parent();else this.home();",
    "if(h.startsWith('w-')&&WB[h.slice(2)])this.world(h.slice(2));else if(h==='parent')this.parent();else if(h==='island')this.island();else this.book();")
sub("  home(){\n    this.cur='home';Hub.focused=null;", "  island(){\n    this.cur='island';Hub.focused=null;")
sub("this.hubBar=bar($('#bar'),[{id:'all',", "this.hubBar=bar($('#bar'),[{id:'book',label:'📖 الكتاب',cls:'go',fn:()=>App.go('home')},{id:'all',")
sub('<small>Year 2 · Autumn 2 · كتيّب الفصل كعالم ثلاثي الأبعاد</small>', '<small>Year 2 · Autumn 2 · كتاب الفصل ثلاثي الأبعاد</small>')
sub('aria-label="رجوع للجزيرة"', 'aria-label="رجوع إلى الكتاب"')
sub("""['700 40px "Andika"','800 40px "Baloo Bhaijaan 2"','400 20px "Readex Pro"']""",
    """['700 40px "Andika"','400 40px "Andika"','800 40px "Baloo Bhaijaan 2"','700 40px "Baloo Bhaijaan 2"','400 20px "Readex Pro"','600 20px "Readex Pro"','700 20px "Readex Pro"']""")
sub("if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>App.boot());else App.boot();",
    js + "\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>App.boot());else App.boot();")

out = ROOT / 'BrightSteps3D_Book.html'
out.write_text(html, encoding='utf-8')
print('wrote', out, len(html.encode('utf-8')), 'bytes')
if '--artifact' in sys.argv:
    dst = pathlib.Path(sys.argv[sys.argv.index('--artifact') + 1])
    head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
    head = re.sub(r'<meta charset="utf-8">\s*', '', head)
    head = re.sub(r'<meta name="viewport"[^>]*>\s*', '', head)
    body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
    dst.write_text(head.strip() + '\n' + body.strip() + '\n', encoding='utf-8')
    print('wrote', dst)
