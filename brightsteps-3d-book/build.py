#!/usr/bin/env python3
"""Builds BrightSteps3D_Book.html: the original BrightSteps 3D page with the 3D book as its home view.

Usage: python3 build.py [--artifact OUT] [--apk DIR]
  --artifact OUT  also writes a copy without the html/head/body wrapper (for a claude.ai page)
  --apk DIR       also writes DIR/index.html plus DIR/vendor/ for the Android app: Three.js and the fonts
                  are local files, so the book works with no internet (only the AI helper needs it)
"""
import pathlib, re, shutil, sys
ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
html = (SRC / 'original.html').read_text(encoding='utf-8')
css = (SRC / 'book.css').read_text(encoding='utf-8')
js = '\n'.join((SRC / f).read_text(encoding='utf-8') for f in
               ['book-core.js', 'book-engine.js', 'book-pages.js', 'book-games.js', 'book-world-a.js', 'book-world-b.js', 'book-world-c.js', 'book-world-d.js', 'book-app.js', 'book-english.js', 'book-ai.js', 'book-bright.js', 'book-board.js', 'book-ink.js', 'book-ai-ui.js', 'book-perf.js'])

def sub(old, new, count=1):
    global html
    if html.count(old) < 1:
        sys.exit('patch target not found: ' + old[:80])
    html = html.replace(old, new, count)

sub('<title>BrightSteps 3D</title>', '<title>BrightSteps 3D Book</title>')
sub('<meta name="description" content="كتيّب Year 2 · Autumn 2 كعالم تعليمي ثلاثي الأبعاد:',
    '<meta name="description" content="A Year 2 · Autumn 2 learning book in 3D (English, with short Arabic notes for parents). Turn the pages, lift the flaps, play with pop-up models, practise, quiz and home learning:')
sub('family=Readex+Pro:wght@300;400;600', 'family=Readex+Pro:wght@300;400;600;700')
sub('\n</style>\n</head>', '\n' + css + '\n</style>\n</head>')
sub("if(h.startsWith('w-')&&WB[h.slice(2)])this.world(h.slice(2));else if(h==='parent')this.parent();else this.home();",
    "if(h.startsWith('w-')&&WB[h.slice(2)])this.world(h.slice(2));else if(h==='parent')this.parent();else if(h==='island')this.island();else this.book();")
sub("  home(){\n    this.cur='home';Hub.focused=null;", "  island(){\n    this.cur='island';Hub.focused=null;")
sub("this.hubBar=bar($('#bar'),[{id:'all',", "this.hubBar=bar($('#bar'),[{id:'book',label:'📖 My book',cls:'go',fn:()=>App.go('home')},{id:'all',")
sub('<small>Year 2 · Autumn 2 · كتيّب الفصل كعالم ثلاثي الأبعاد</small>', '<small>Year 2 · Autumn 2 · My 3D learning book</small>')
sub("route(){\n    const h=decodeURIComponent(location.hash.slice(1));Pen.wipe();", "route(){\n    const h=decodeURIComponent(location.hash.slice(1));Pen.wipe();document.documentElement.dir='rtl';document.documentElement.lang='ar';")
sub('aria-label="رجوع للجزيرة"', 'aria-label="Back to my book"')
# phones draw fewer pixels, so the 3D book stays smooth
sub("r.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<700?1.75:2));", "r.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<700?1.5:2));")
# ---- English first on the island and in the extra 3D worlds (Arabic stays as short notes) ----
sub("""<div class="wtitle"><b>${esc(w.ar)}</b><span class="en">${esc(w.en)}</span></div>""",
    """<div class="wtitle"><b dir="ltr">${esc(w.en)}</b><span lang="ar">${esc(w.ar)}</span></div>""")
sub('aria-label="إعادة ضبط الكاميرا"', 'aria-label="Reset the view"')
sub("""const T=[['learn','افهم'],['play','العب'],['quiz','تحدَّ'],['home','واجب الكتيّب']].filter(([k])=>w.tabs&&w.tabs[k]);
    $('#tabs').innerHTML=""",
    """const T=[['learn','Learn'],['play','Play'],['quiz','Quiz'],['home','Home learning']].filter(([k])=>(w.tabs&&w.tabs[k])||WorldEN.has(w.id,k));
    $('#tabs').setAttribute('dir','ltr');$('#tabs').innerHTML=""")
sub("const f=w.tabs[k];if(k==='quiz'&&Array.isArray(f))quiz(body,f,{id:w.id});else if(typeof f==='function')f(body,ctx,ctx.inst);",
    "const f=w.tabs&&w.tabs[k];if(!WorldEN.tab(k,body,w,ctx,f)){if(k==='quiz'&&Array.isArray(f))quiz(body,f,{id:w.id});else if(typeof f==='function')f(body,ctx,ctx.inst);}")
sub("b.innerHTML=it.label;b.dataset.id=it.id||'';", "b.innerHTML=enT(it.label);b.dataset.id=it.id||'';")
sub("function toast(msg,ms=2200){const t=$('#toast');if(!t)return;t.textContent=msg;", "function toast(msg,ms=2200){const t=$('#toast');if(!t)return;t.textContent=enT(String(msg));")
sub('aria-label="استمع: ${esc(t)}"', 'aria-label="Listen: ${esc(t)}"')
# quiz frame
sub("""el.innerHTML=`<div class="card q-end"><b class="num">${score} / ${list.length}</b><p>${pass?'ممتاز! أنت بطل هذا العالم.':'محاولة جميلة! أعد التحدي لتصل إلى '+Math.ceil(list.length*.6)+' إجابات صحيحة.'}</p><div class="row" style="justify-content:center;margin-top:12px"><button class="btn hot" type="button" data-again>أعد التحدي</button></div></div>`;""",
    """el.innerHTML=`<div class="card q-end" dir="ltr" lang="en"><b class="num">${score} / ${list.length}</b><p>${pass?'Brilliant! You are the hero of this world.':'Good try! Have another go and get '+Math.ceil(list.length*.6)+' right.'}</p><div class="row" style="justify-content:center;margin-top:12px"><button class="btn hot" type="button" data-again>Try again</button></div></div>`;""")
sub("""el.innerHTML=`<div class="card q"><div class="q-top"><span>سؤال ${i+1} من ${list.length}</span>""",
    """el.innerHTML=`<div class="card q" dir="ltr" lang="en"><div class="q-top"><span>Question ${i+1} of ${list.length}</span>""")
sub("""(x.ok?'<b class="ok">صحيح! </b>':'<b class="bad">الإجابة الصحيحة مظللة بالأخضر. </b>')""",
    """(x.ok?'<b class="ok">Correct! </b>':'<b class="bad">The right answer is in green. </b>')""")
sub("data-next>التالي ←</button>", "data-next>Next →</button>")
# header buttons
sub('title="نجومك"', 'title="Your stars"')
sub('aria-label="الصوت"', 'aria-label="Sound"')
sub('aria-label="قلم الشرح"', 'aria-label="Drawing pen"')
sub('aria-label="لوحة ولي الأمر"', 'aria-label="Parents&#39; page"')
sub("'كتم الصوت':'تشغيل الصوت'", "'Sound off':'Sound on'")
# island
sub("""<div class="hub-hello"><h1>كتيّب الفصل صار <em>عالماً تلمسه</em></h1><p>اسحب لتدوير الجزيرة، واضغط على أي معلم لتدخل عالمه. اضغط النار في الوسط لعرض ألعاب نارية.</p></div>""",
    """<div class="hub-hello" dir="ltr" lang="en"><h1>My booklet is now <em>a world you can touch</em></h1><p>Drag to spin the island. Tap a place to visit its 3D world. Tap the bonfire for fireworks.</p><p class="ar-note" dir="rtl" lang="ar">اسحب لتدوير الجزيرة، واضغط أي مكان لتدخل عالمه.</p></div>""")
sub("""<section class="sec"><div class="sec-h"><h2>هذا الأسبوع</h2><small>${arDate(today())}</small></div>
          <div class="week">""",
    """<section class="sec" dir="ltr" lang="en"><div class="sec-h"><h2>This week</h2><small>${enDate(today())}</small></div>
          <div class="week">""")
sub("""<small>الرياضة PE (ثلاثاء وجمعة)</small><b>${inDays(pe.n)}</b><span>${arDate(pe.d)} — يذهب بزيّ الرياضة</span>""",
    """<small>PE (Tuesday and Friday)</small><b>${cap1(inDaysEn(pe.n))}</b><span>${enDate(pe.d)}: wear your PE kit</span>""")
sub("""<small>إحضار دليل الواجب للمدرسة</small><b>${inDays(fri.n)}</b><span>كل جمعة: أعمال الطفل للمشاركة والاحتفال</span>""",
    """<small>Bring your home learning to school</small><b>${cap1(inDaysEn(fri.n))}</b><span>Every Friday: share and celebrate your work</span>""")
sub("""<small>ورشة الرياضيات للأهالي</small><b>${inDays(ws)}</b><span>الخميس 19 نوفمبر · 2:15–3:15 مساءً</span>""",
    """<small>Parents' maths workshop</small><b>${cap1(inDaysEn(ws))}</b><span>Thursday 19 November · 2:15–3:15 pm</span>""")
sub("""<small>تحدّي القراءة البرونزي</small><b class="num">${Math.min(bc,5)} / 5</b><span>${br>=0?inDays(br)+' (16 ديسمبر)':'انتهى الموعد'}</span>""",
    """<small>Bronze Reading Challenge</small><b class="num">${Math.min(bc,5)} / 5</b><span>${br>=0?cap1(inDaysEn(br))+' (16 December)':'Finished'}</span>""")
sub("""<button class="btn hot" type="button" id="cont">تابع: ${esc(last.ar)} ←</button>""",
    """<button class="btn hot" type="button" id="cont" dir="ltr">Continue: ${esc(last.en)} →</button>""")
sub("""<h2>كل العوالم</h2><small>${WORLDS.length} عالماً من محتوى الكتيّب</small>""",
    """<h2>All the worlds</h2><small>${WORLDS.length} worlds from the booklet</small>""")
sub("""<h3><i style="background:${d.color}"></i>${d.ar} <span class="en" style="font-size:14px;color:${d.color}">${d.en}</span></h3>""",
    """<h3><i style="background:${d.color}"></i><span dir="ltr">${d.en}</span> <span style="font-size:14px;color:${d.color}">${d.ar}</span></h3>""")
html, n = re.subn(r'<section class="sec"><div class="card"><h3>عن هذه النسخة</h3>.*?</div></section>',
    lambda m: """<section class="sec"><div class="card" dir="ltr" lang="en"><h3>About this app</h3><p>An unofficial home-learning companion built from the Year 2 · Autumn 2 parents' booklet. Stars and records are saved on this device.</p><p class="note" style="margin-top:6px">Two notes about the booklet: the sum 12 + 9 = 23 is a misprint (the answer is 21), and the homework list says Autumn 1 for the reading challenge while the challenge box says 16.12.26, so we used 16 December.</p></div></section>""",
    html, count=1, flags=re.S)
if n != 1:
    sys.exit('patch target not found: about card')
sub("""${p>=1?'<span class="done">✓ مكتمل</span>':''}<span class="ic" style="background:${w.color}">${w.icon}</span><b>${esc(w.ar)}</b><span class="en">${esc(w.en)}</span><small>${esc(w.blurb)}</small>""",
    """${p>=1?'<span class="done">✓ Done</span>':''}<span class="ic" style="background:${w.color}">${w.icon}</span><b dir="ltr">${esc(w.en)}</b><span class="en" lang="ar">${esc(w.ar)}</span><small dir="ltr">${esc(WorldEN.blurb(w))}</small>""")
sub("""<b style="font-family:var(--f-display);font-size:18px;color:${d.color}">${d.ar}</b>""",
    """<b style="font-family:var(--f-display);font-size:18px;color:${d.color}" dir="ltr">${d.en}</b>""")
sub("""<button class="btn sm" type="button" data-w="${w.id}"><span>${w.icon}</span>${esc(w.ar)}</button>""",
    """<button class="btn sm" type="button" data-w="${w.id}" dir="ltr"><span>${w.icon}</span>${esc(w.en)}</button>""")
sub("""['700 40px "Andika"','800 40px "Baloo Bhaijaan 2"','400 20px "Readex Pro"']""",
    """['700 40px "Andika"','400 40px "Andika"','800 40px "Baloo Bhaijaan 2"','700 40px "Baloo Bhaijaan 2"','400 20px "Readex Pro"','600 20px "Readex Pro"','700 20px "Readex Pro"']""")
sub("if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>App.boot());else App.boot();",
    js + "\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>App.boot());else App.boot();")

out = ROOT / 'BrightSteps3D_Book.html'
out.write_text(html, encoding='utf-8')
print('wrote', out, len(html.encode('utf-8')), 'bytes')
if '--apk' in sys.argv:
    dst = pathlib.Path(sys.argv[sys.argv.index('--apk') + 1]).resolve()
    dst.mkdir(parents=True, exist_ok=True)
    page = html.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
                        '<script src="vendor/three.min.js"></script>')
    page = re.sub(r'<link rel="preconnect"[^>]*>\s*', '', page)
    page = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]*">',
                  '<link rel="stylesheet" href="vendor/fonts/fonts.css">', page)
    if 'cdnjs.cloudflare.com' in page or 'fonts.googleapis.com' in page:
        sys.exit('apk build: a remote script or font is still referenced')
    (dst / 'index.html').write_text(page, encoding='utf-8')
    vend = ROOT / 'vendor'
    if (dst / 'vendor').exists():
        shutil.rmtree(dst / 'vendor')
    (dst / 'vendor' / 'fonts').mkdir(parents=True)
    shutil.copy2(vend / 'three.min.js', dst / 'vendor' / 'three.min.js')
    for f in sorted((vend / 'fonts').iterdir()):
        if f.suffix in ('.woff2', '.css'):
            shutil.copy2(f, dst / 'vendor' / 'fonts' / f.name)
    print('wrote', dst / 'index.html', 'and vendor/ for the Android app')
if '--artifact' in sys.argv:
    dst = pathlib.Path(sys.argv[sys.argv.index('--artifact') + 1])
    head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
    head = re.sub(r'<meta charset="utf-8">\s*', '', head)
    head = re.sub(r'<meta name="viewport"[^>]*>\s*', '', head)
    body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
    dst.write_text(head.strip() + '\n' + body.strip() + '\n', encoding='utf-8')
    print('wrote', dst)
