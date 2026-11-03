# BrightSteps 3D Book · كتاب BrightSteps ثلاثي الأبعاد

كتيّب Year 2 · Autumn 2 صار **كتاباً حقيقياً ثلاثي الأبعاد**: غلاف تفتحه، وصفحات تنثني وأنت تقلّبها، ولكل درس صفحتان:

- **الصفحة اليمنى (تُقرأ أولاً):** الدرس، والكلمات المهمة بالإنجليزية، ولسان ورقي «توقّع ثم اكشف». ارفع اللسان لترى الجواب، فيطير ختم من علبة الحبر ويطبع «أحسنت» على الصفحة.
- **الصفحة اليسرى:** نموذج مجسّم يقفز من الصفحة (pop-up) تسحبه وتضغطه: تمدّ الزنبرك، تدحرج السيارة على المنحدر، تشعل الغلاية، تطوي الأشكال على خط التناظر، تبدّل 10 آحاد بعصا، تبرمج الروبوت… أكمل التجربة فتحصل على ملصق.
- زر **«ادخل العالم الكامل»** في كل صفحة يفتح العالم الأصلي بكل ألعابه وتحدياته، والرجوع يعيدك إلى الصفحة نفسها. الجزيرة القديمة ما زالت موجودة في `#island`.

The book reads right to left like an Arabic book: drag the left page's edge to the right (or use the arrows / arrow keys) to turn. On a phone it shows one page at a time; the text button opens the page as plain text.

## الملفات · Files

| | |
|---|---|
| `BrightSteps3D_Book.html` | the finished single-file page (open it in a browser) |
| `src/original.html` | the original BrightSteps 3D page, unchanged |
| `src/book-engine.js` | the book: page-curl geometry, boards, flips, camera, flap, stamp, pop-up kit, overlay |
| `src/book-pages.js` | the page printer: cover, contents, lesson pages, try-it pages, parents' corner, stamp collection |
| `src/book-pops-*.js` | the lesson text and the pop-up model for each of the 21 worlds |
| `src/book-app.js` | makes the book the home view |
| `src/book.css` | styles for the book view |
| `build.py` | injects the book into the original and writes `BrightSteps3D_Book.html` |

```sh
python3 build.py                      # rebuild BrightSteps3D_Book.html
python3 build.py --artifact out.html  # also write a copy without the html/head/body wrapper
```
