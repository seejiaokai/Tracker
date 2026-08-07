# Your syllabus lives in a file

**Status:** agreed, not built yet · **Date:** 2026-08-07

## What this changes

Today your charts are written into the app's own code, and your work is kept in
your browser's memory. Both of those are wrong for what you're doing.

After this, **one file on your computer holds your syllabus work**. You open it,
you edit, you save. The app itself ships empty. That single change solves four
things at once: your work is safe outside the browser, handing a clean app to the
engineers needs no cleanup, sending me the latest chart is the same act as saving
it, and the file is what goes into the database later.

## Why the charts must leave the code

Five syllabi are compiled into the app today — 2024, 2026, Tx 2026,
A/G - A/A 2026 and Tx 2024, over a thousand events between them.

The 🗑 Delete syllabus button appears to remove them but only hides them in your
browser. Anyone opening the app fresh gets all five back. **No button in a web
page can ever truly delete them,** because they live in the code the site serves.
A wipe button would be pretend.

So the charts move out of the code and into your file. The app ships with
nothing. Handover is clean because there was never anything to clean.

## The buttons

| Button | What it does |
|---|---|
| **📁 Open** | Pick your file, or start a new one. Its name shows on the toolbar so you always know what you're editing. |
| **✓ Save changes** | Writes to that file. A dot appears on the button when you have unsaved work. |
| **⊕ Import syllabus** | Takes one syllabus out of another file and drops it into what you already have — for when a new syllabus is issued. Asks whether to add it as new or replace an existing one. |
| **⤓ Save a copy** | Saves a separate copy somewhere else. Tick which syllabi to include. For sending me a single chart, or keeping a snapshot. |

**💾 Save backup** and **⤒ Load backup** stay exactly as they are — the
everything-included pair, students and marks included.

**⤓ Save as new HTML goes.** It exists only to produce a standalone copy of the
app, and a second complete duplicate of the app is kept in the project purely to
feed it. That duplicate has drifted out of step before and once carried a
security hole fixed in one copy but not the other. Removing the button lets the
whole duplicate go.

**☁ Cloud and ⟳ Load latest are left alone** — still unknown whether a colleague
depends on the sync. Decide separately.

## How saving works

You choose where the file lives — Documents, your desktop, a network drive,
anywhere. It's an ordinary file you can see in File Explorer, copy, and email.

Chrome and Edge can write back into that same file, so saving behaves like Word:
one file, updated in place. Safari and Firefox can't, so there the app falls back
to downloading a fresh copy each time and says so plainly rather than pretending.

Saving is **manual** — it happens when you press the button, so the file always
holds a version you chose. To make forgetting hard rather than silent:

- the Save button carries a visible dot whenever there is unsaved work
- closing the tab with unsaved work warns you first

Browsers won't let a web page write to your files silently forever. Each time you
open the app fresh it asks once to confirm it can still write to your file. One
click. Decline it and the app says clearly that it is not writing to your file,
rather than failing quietly.

**Tip:** save your file into a OneDrive or SharePoint folder and you get
automatic backup and version history without us building anything.

## What's in the file

Everything that makes up a chart:

- every event — its code, name, type, hours and crew
- every connection between events
- the position of every ball, not only the ones you have moved
- your drawn lines, arrowheads, merges and font sizes

**Nothing that names a person.** No students, no marks, no dates. The file is
safe to send to me, to the engineers, or anywhere else, by construction rather
than by remembering to check.

## Dropping in a new syllabus

When a new syllabus is issued, you design its chart, save it, and import it.
**Every other syllabus, every student, and all their marks stay exactly as they
are.** This is proven, not assumed: a student was marked on an event, the
syllabus underneath was then rewritten and saved, and the mark came back
byte-for-byte identical. Marks are filed under the student and syllabus name,
entirely separately from the drawing.

One catch worth knowing. If you replace a syllabus and an event's **code**
changes — ACG-03 becoming ACG-03A — that event's marks are stranded, because they
are filed under the old code. Anything whose code stays the same is untouched.

## The changeover — this must not lose your current work

Emptying the app is the dangerous moment. Your saved edits live in your browser;
any syllabus you have never edited exists **only** in the code we are removing.
Ship the empty app carelessly and those charts are gone.

So the changeover happens in this order, and not in any other:

1. The app gains 📁 Open, ✓ Save changes and ⤓ Save a copy while the built-in
   charts are still in place. Nothing is removed yet.
2. On first run after that, the app offers once to write everything it currently
   holds into a file for you — and says plainly why it is asking.
3. You save that file, open it again, and confirm your charts are all there.
4. **Only then** do the charts come out of the code.

Step 3 is yours and cannot be skipped. I cannot verify from here that your file
holds what you expect, and no automated check can either — I do not have your
browser. If step 3 is skipped, step 4 loses work permanently.

## Working together on a chart

The file is how we exchange work, both directions. You send it, I edit, I send it
back, you open it.

**Only one of us holds the chart at a time.** If you refine it while I am also
editing it, whoever saves last wins and the other's work is gone. This is a rule
we follow, not machinery — machinery here would cost more than it saves.

## What gets checked before it ships

- a chart saved, closed and reopened comes back identical: every ball, every
  line, every arrowhead, every font size
- importing one syllabus leaves all other syllabi, students and marks untouched
- no student name can reach the file — fake students are planted, and the check
  fails if any of them appear
- the app starts sensibly with no file open, rather than looking broken
- declining the browser's write permission is reported plainly, not swallowed

Each check is confirmed to fail before its fix exists. A check that has never
failed has proven nothing.

## Known gap: your marks are still only in the browser

This design puts your **charts** in a file. Student marks stay in browser memory,
protected only by 💾 Save backup.

That is the right split for now — you are designing syllabi, not tracking people,
and keeping the two apart is what makes the chart file safe to send. But you told
me you don't trust browser memory, and that concern applies to marks just as much
as to charts.

Not solved here. Worth deciding once the syllabus work settles.

## Deliberately not doing

- **A "wipe all syllabi" button.** It could only hide, never delete. Looks like a
  solution and isn't one. Moving the charts into your file removes the need.
- **Automatic saving.** Considered and rejected: an accidental deletion would be
  written to the file too.
- **Merging two people's edits.** A rule about who holds the chart is cheaper and
  clearer than machinery that would guess wrong.
- **A readable summary table of events for the engineers.** Genuinely useful, but
  not needed to start. Easy to add later if they ask.
