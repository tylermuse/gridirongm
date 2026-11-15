# Notes for agents working in this repo

## Feedback help sheets

The "Feedback & questions" modal answers players' how-to questions automatically, using only the facts in a help sheet:

- BS Football: `src/lib/feedback/helpSheet.ts`
- BS Hoops: `apps/bs-basketball/src/lib/feedback/helpSheet.ts` (once it exists)

**If your change renames, moves, adds or removes something a player sees (a button, tab, page, sidebar entry or a game rule such as a roster limit), update the matching line in the help sheet in the same PR.** A stale line makes the game give players a confidently wrong answer. Follow the editing rules at the top of the sheet: quote on-screen labels exactly, and delete a line rather than guess.

CI runs `npm run check:help-sheet`, which fails when a label quoted in a sheet no longer appears in the code. It cannot catch a changed rule or number, so those are on you.
