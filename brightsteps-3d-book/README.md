# BrightSteps 3D Book

The Year 2 · Autumn 2 home-learning booklet as a **real 3D book** for a child at a British primary school (Birmingham, UK).
Everything is in English, the language of school. Arabic stays only as short notes for grown-ups.

- Tap the cover and the book opens. It reads left to right like an English book. Drag a page corner, use the arrows or the arrow keys to turn.
- Every topic (21 of them, in 6 chapters) has **two spreads**:
  1. **Learn | Try it.** The left page teaches, with key words and a "Predict, then lift the flap" question. The right page has a 3D pop-up model to play with: stretch, drag, tap, build, roll.
  2. **Practise | Quiz.** A practice game (sort, pick, put in order, fill the gap, match), the booklet's home learning as tick boxes, and a 4-question quiz with a trophy.
- The controls sit **in the book, next to the thing they move.** The buttons are printed on the page, labels like "👆 Tap" and "✋ Drag" sit on the models, and a sticky note on the page says what just happened.
- Stamps, stickers and trophies collect on the back pages. The last spread is the parents' corner (dates and tips).
- On a phone the book shows one page at a time. The text button opens the page as plain text, with Arabic notes for parents.
- The old 3D island is still there (`#island`) as an extra. Its worlds are English-first too: English tabs (Learn, Play, Quiz, Home learning), buttons, messages and quiz. The longer Arabic guides for grown-ups are folded away under «للأهل».

## Files

| | |
|---|---|
| `BrightSteps3D_Book.html` | the finished single-file page (open it in a browser; needs internet for Three.js and the fonts) |
| `src/original.html` | the original BrightSteps 3D page, unchanged (patched at build time) |
| `src/book-core.js` | book sizes, chapters, spreads list, saved progress, page-drawing helpers |
| `src/book-engine.js` | the 3D book: page-curl geometry, covers, flips, camera, flap, stamp, pop-up kit (on-page buttons, tags, sticky note), text overlay |
| `src/book-pages.js` | page printer: cover, how-to, contents, learn pages, try-it pages, parents' corner, stamp collection, back cover |
| `src/book-games.js` | practise games, home-learning ticks and the quiz page |
| `src/book-world-a.js` … `-d.js` | the English content and pop-up model for each topic (English, Maths, Science, History · D&T, Computing · Music · PE, RE · PSHE · Values) |
| `src/book-app.js` | makes the book the home view, top bar, page arrows, read-aloud |
| `src/book-english.js` | English-first layer for the island and the extra 3D worlds |
| `src/book.css` | styles |
| `build.py` | injects everything into the original and writes `BrightSteps3D_Book.html` |

```sh
python3 build.py                      # rebuild BrightSteps3D_Book.html
python3 build.py --artifact out.html  # also write a copy without the html/head/body wrapper
```
