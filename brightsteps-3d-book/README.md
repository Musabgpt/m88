# BrightSteps 3D Book

The Year 2 · Autumn 2 home-learning booklet as a **real 3D book** for a child at a British primary school (Birmingham, UK).
Everything is in English, the language of school. Arabic stays only as short notes for grown-ups.

- Tap the cover and the book opens. It reads left to right like an English book. Drag a page corner, use the arrows or the arrow keys to turn.
- Every topic (21 of them, in 6 chapters) has **two spreads**:
  1. **Learn | Try it.** The left page teaches, with key words and a "Predict, then lift the flap" question. The right page has a 3D pop-up model to play with: stretch, drag, tap, build, roll.
  2. **Practise | Quiz.** A practice game (sort, pick, put in order, fill the gap, match), the booklet's home learning as tick boxes, and a 4-question quiz with a trophy.
- The controls sit **in the book, next to the thing they move.** The buttons are printed on the page, labels like "👆 Tap" and "✋ Drag" sit on the models, and a sticky note on the page says what just happened.
- **Bright teaches like a teacher at a lightboard.** When a lesson page opens, a dark glass board rises out of the book and Bright writes on it in neon, step by step, saying each idea as it writes and draws it (sticks and cubes, dice, shapes, words with their sounds lit up). It asks the child questions with glowing answers, waits, praises by name or helps, explains any step "another way" with the AI, and answers the child's own questions on the board. Pause, Next, Another way and Close sit on the board.
- **The pen ✎ writes on the page itself**: strokes go into the page's paper, stay on that page, turn with it and are kept on the device (undo and clear work on the open pages).
- **Bright, the AI helper, lives in the book** as a little glowing star that floats over the page and follows the child:
  - tap Bright: its thought bubbles open (explain again, another example, fun fact, a story, quiz me, read it to me, ask by voice or typing, Arabic for parents);
  - tap **any sentence or key word** on a lesson page: the yellow marker sweeps over it, Bright flies there and writes the explanation on a paper note that pops out of the page;
  - **✨ Ask why** under every 3D model, **💡 Hint** inside every quiz question, **✨ New questions** for endless quizzes; Bright cheers right answers and comforts wrong ones;
  - **Read it to me**: Bright reads the lesson line by line while the marker follows.
- **Fast answers**: every reply streams in word by word; the provider that answers fastest on this device goes first; if it is slow to start, the next one starts too and the first to write wins; answers are kept on the device (asking again is instant) and the next "Another" is fetched while the child reads.
- The AI uses the free providers of the MusabAI app (Musabgpt/C66) with the same order and failover rules. When none answers, the book answers from its own pages. Grown-ups add optional keys behind a small maths gate (Parents' corner → AI helper settings).
- Stamps, stickers and trophies collect on the back pages. The last spread is the parents' corner (dates and tips).
- On a phone the book shows one page at a time. The text button opens the page as plain text, with Arabic notes for parents.
- The old 3D island is still there (`#island`) as an extra. Its worlds are English-first too.
- The Android app (APK) is built from this book in the Musabgpt/D3 repository.

## Files

| | |
|---|---|
| `BrightSteps3D_Book.html` | the finished single-file page (open it in a browser; needs internet for Three.js and the fonts) |
| `src/original.html` | the original BrightSteps 3D page, unchanged (patched at build time) |
| `src/book-core.js` | book sizes, chapters, spreads list, saved progress, page-drawing helpers |
| `src/book-engine.js` | the 3D book: page-curl geometry, covers, flips, camera, flap, stamp, pop-up kit (on-page buttons, tags, sticky note), text overlay |
| `src/book-pages.js` | page printer: cover, how-to, contents, learn pages, try-it pages, parents' corner, stamp collection, back cover |
| `src/book-games.js` | practise games, home-learning ticks and the quiz page |
| `src/book-world-a.js` … `-d.js` | the English content and pop-up model for each topic |
| `src/book-app.js` | makes the book the home view, top bar, page arrows, read-aloud |
| `src/book-english.js` | English-first layer for the island and the extra 3D worlds |
| `src/book-ai.js` | Bright's engine: the MusabAI provider pool (health, cooldowns, failover) with streaming, racing, fastest-first and an answer cache; prompts, safety filters, offline helper, endless quiz questions |
| `src/book-bright.js` | Bright in the 3D book: the star, its thought bubbles, the paper notes with streaming ink, tap-a-sentence, Ask why, hints, read-aloud with the marker |
| `src/book-board.js` | the lightboard lesson: the glass board, neon writing and drawings, questions, another way, the child's questions |
| `src/book-ink.js` | the pen that writes on the page |
| `src/book-ai-ui.js` | the ✨ button, voice typing, the grown-ups' settings, Android bridges (voice, back button, saving files) |
| `src/book.css` | styles |
| `vendor/` | Three.js r128 and the fonts, for the offline Android build (`tools/vendor_fonts.py` refreshes the fonts) |
| `build.py` | injects everything into the original and writes `BrightSteps3D_Book.html` |

```sh
python3 build.py                      # rebuild BrightSteps3D_Book.html
python3 build.py --artifact out.html  # also write a copy without the html/head/body wrapper
python3 build.py --apk DIR            # also write DIR/index.html + DIR/vendor/ for the Android app (works offline)
```
