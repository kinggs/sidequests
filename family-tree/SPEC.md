# Inggs Family Tree — spec

The Inggs family tree that Jon Inggs researched and published at familytree.inggs.com, recovered
from the Wayback Machine's February 2010 capture before it is lost, and given a private home where
the family can browse the tree and the oldest photographs and add or correct what they know.
The brief is `BRIEF.md`; the sessions that build it are `PLAN.md`. This spec is the app as it will
be (0.1.0 is a placeholder from `_template`; Session 3 ships the first real build).

**Jon Inggs is the author.** Every screen that shows his work says so: the home page, every
person page ("Researched by Jon Inggs, familytree.inggs.com, 2010"), the footer, the GEDCOM's
`SOUR` record and this file. (The brief wrote "John"; the owner settled on Jon on 2026-10-10,
the spelling on Jon's own forum post and WikiTree profiles, and confirmed in Session 2: the
recovered home page is titled "Jon Inggs's home page".)

**Files.** `index.html` (the app), `sw.js`, `manifest.json`, icons, `tools/` (the Node scripts
that recover and parse the site: run locally or in a cloud session, never shipped; each pure
module has a `*.test.mjs` beside it, run by `node --test` from the repo root), `data/` (a clone of
the private data repo, gitignored: nothing in it ever enters this repo).

---

## 1. Who uses it

- **A member**: someone in `members/`, signed in with Google. Kenny first; then anyone a member
  invites and another member approves (§5). Members read everything and suggest corrections.
- **The owner** (`cloud.role()` is `"owner"`): the one admin, a member always. Alone imports the
  recovered data, acts on suggestions, approves their own invitees, removes members, exports the
  lot.
- **A newcomer**: signed in, not yet a member. Sees only the waiting screen (§5) and their own
  account sheet.
- **Signed out**: Sign in with Google, and nothing else. No anonymous read of anything, ever, not
  even the shape of the tree.

Not a player list: the people *in* the tree are data, not accounts (`shared/people.js` only
names the signed-in person for the header's avatar and My QR). A living relative who is also a
member is two things that aren't linked (Parked in `PLAN.md`).

## 2. Screens

Three tabs (`.tabbar`: **People · Photos · Family**), person pages and the tree view on top.
Everything on the shared parts (`shared/DESIGN.md`); the app's own CSS is the tree view and the
photo treatment, nothing else.

**People** (Home). The credit line under the title ("Researched by Jon Inggs · familytree.inggs.com
· 2010"), a search field (name, any part), then every person as a `.rows` list sorted by surname
then given name: a neutral initial ring or their first photo as the avatar, the name as `.l1`, the
years as `.l2` ("1884–1951", "b. 1902", or nothing). A caps label groups them by surname. Tap
opens the person. The list reads from one `people` listener (a few hundred documents, fine).

**A person.** The name large (Grotesk, the hero), the years line, then:

- **Photos** of them, as a strip (tap → the photo).
- **Born** and **Died**: date and place, as Jon wrote them. Hidden for a living person (§6) behind
  **Show details**.
- **Parents**, **Married** (each spouse, with the date and place if known), **Children**: rows,
  each a tap to that person. A reference that doesn't resolve shows the name from the source with
  "(not in the tree)".
- **Notes**: Jon's own text, verbatim.
- **On WikiTree** (only for a person matched to a profile, §4 `wikitree`): "Kept by Jon on
  WikiTree" (or the manager WikiTree names), the profile's current birth and death, fetched live
  from WikiTree's public API when the page opens, and a link to the profile. Where WikiTree's
  dates or places differ from the 2006 tree, the Born and Died rows show WikiTree's, and the 2006
  value stays under Source ("2006 tree: …"). Offline, or if WikiTree doesn't answer, the row is
  the link alone. Nothing from WikiTree is stored.
- **Source**: "Researched by Jon Inggs, familytree.inggs.com, 2010" and a link to the Wayback
  page the record came from (opens in the browser).
- **Tree** (76px, the one you came for): the tree view centred on them.
- **Suggest a correction**: a sheet with a text box; saves to `suggestions/` with your name.
  "Thanks, Kenny will look at it."

**The tree view.** The person in the middle; parents, grandparents and great-grandparents above;
children, grandchildren and great-grandchildren below; spouses beside. Each person a card with
name and years, in `--accent` for the centre, neutral for the rest; a tap moves the centre there.
Generations are rows; lines join a child to its parents. It scrolls both ways and fits a phone
held upright: three generations each way on a 390px screen with the cards readable (nothing
under 15px). This is the one screen built to feel like something: the brief says aim high, and
the owner wants the family to see the shape of the tree, not a table. Reduced motion: no
animated re-centring.

**Photos.** Every recovered photograph as a grid, newest-captured first, each with its caption
under it. Tap: the photo full width (the 1400px image, loaded on demand), the caption verbatim,
the people in it as chips (tap → the person), the source link. A photo the Wayback Machine
didn't keep shows as a placeholder with its caption and "Not recovered", so the family knows it
existed.

**Family.** Who's in: every member with their avatar, "invited by Ann · approved by Kenny". Then
**Waiting** (§5): each pending invite as "Kenny invited Dad. Is this them?" with **Approve** and
**Decline** in its `⋯` sheet. Then **Invite family**: **Show my QR** (My QR in the app's look)
and **Invite a friend** (pick from your Connect friends who aren't members). The owner's `⋯` on
a member row holds **Hold to remove**.

**The account sheet** (your avatar, every tab): Profile, My QR, Friends, **Export** (members:
the whole tree as JSON, logged, §6), **Import** (owner only: the recovered data, §4), Install on
this phone, Sign out.

**The waiting screen** (a newcomer): "Waiting for a family member to confirm it's you" with the
inviter's name; declined: "A family member said this isn't you. Ask them." With no invite at all:
"This is the Inggs family's tree. Ask a family member to show you their QR." Nothing else loads.

## 3. The look

Accents **lilac** (`--lilac`: the centre of the tree, the years on a person, the photo count) and
**coral** (`--coral`, the second state: the lines and cards of the descendant side of the tree,
so up and down read differently; and "Not recovered"). Choosing is neutral, as everywhere. Dark
only; photographs sit on `--ink-1` cards with generous margins, never cropped to a square in the
grid (height follows the photo). Base 18px; nothing under 15px bar caps labels. Icon: three nodes
joined by a lilac fork on the card colour.

## 4. Data

Under `/sidequests/family-tree/`. Times are milliseconds. Ids are the parser's: a person's id is
a slug of the name and birth year (`<given>-<surname>-<year>`, `-2` on a clash): Jon's pages
are one per family (Gedpage), with no person ids (`PLAN.md`, The site's pattern).

```
members/<uid>       { name, since, invitedBy, approvedBy }
invites/<uid>       { uid, name, email, invitedBy, invitedByName, at, status, decidedBy, decidedAt }
                    // status: "pending" | "approved" | "declined"; email: the newcomer's own Google address, or ""
people/<id>         { name, given, surname, sex, birth: { date, year, place }, death: { date, year, place },
                      parents: [id], spouses: [{ id, name, date, place }], children: [id], notes,
                      photos: [photoId], refs: [{ role, name }],      // refs: references that didn't resolve
                      wikitree,                                       // a WikiTree id ("Inggs-12") or absent
                      source: { url, wayback, captured } }
photos/<id>         { caption, people: [id], names: [name], file, recovered, thumb, w, h,
                      source: { url, wayback, captured } }           // thumb: ~400px JPEG data URL
images/<id>         { data }                                         // the 1400px JPEG data URL, apart so lists stay light
suggestions/<id>    { person, personName, text, by, byName, at, status, doneBy, doneAt }   // status: "open" | "done"
exports/<id>        { by, byName, at, people, photos }               // the export log
meta/main           { source, captured, researcher, people, photos, photosRecovered, importedAt, importedBy, version }
```

Dates stay as Jon wrote them (`date`, a string) with a parsed `year` beside them when one can be
read; nothing is guessed (BRIEF.md, parsing rules). `refs` keeps a parent, spouse or child Jon
named whose page the parser couldn't match, rather than dropping it.

**Import** (the owner, the account sheet): the seed files the tools emit, `seed/family-tree-N.json`,
each under 20 MB, in the export format below; each is written in batches of at most 400
documents (images 10 at a time), merged by id, so a file can be imported twice without harm.
From a laptop browser if the phone struggles with the size.

**Export** (any member): one JSON file, `{ app: "family-tree", version, exportedAt, meta, people,
photos, images, suggestions }` for a member; the owner's also carries `members` and `invites`.
An `exports/` entry is written first; an export that can't be logged doesn't happen.

**Who reads what** (`shared/firestore.rules`, its own block; cases in `shared/rules-check.mjs`;
mirrored in `shared/cloud-memory.js`). `isFam()` is "in `members/`, or the owner".

| | A newcomer (signed in) | A member | The owner |
|---|---|---|---|
| members/ | get their own | get, list | create (by approval, below), delete |
| invites/ | get their own; create their own (below) | get, list; create for a friend; decide one they didn't send | the same, and decide their own |
| people, photos, images, meta | — | read | read, write |
| suggestions/ | — | read; create with `by` = me | read, write, delete |
| exports/ | — | create with `by` = me | read |

The generic owner rule over `/sidequests/` skips this app, like Rack It's and Sessions Loyalty's;
the block spells the owner out. Nothing is readable signed out.

## 5. Access and invites

Built on the shared Connect kit (`shared/KIT.md`, `shared/CONNECT.md`): a friendship made here is
network-wide, and the owner is fine with that (BRIEF.md). The app adds one thing on top: a member
has to say "yes, that's them".

1. A member opens **Show my QR** (the Family tab, or the account sheet). The newcomer scans it,
   or opens the copied link, lands at `…/family-tree/?i=<code>` and signs in with Google.
2. `connect.handleInvite` makes the friendship, as in every app. Then, because the code was shown
   from this app, the newcomer's phone writes `invites/<their uid>`: their name and Google email,
   `invitedBy` the QR's owner (`onDone` gives the uid), `status: "pending"`. The rule accepts it
   only from the newcomer themselves, only pending, only naming an inviter they are now connected
   to, and only with their own email.
3. The newcomer sees the waiting screen.
4. Every member sees it under **Waiting**: "Kenny invited Dad (dad@gmail.com). Is this them?"
   **Approve** writes one batch: the invite's `status: "approved"`, `decidedBy`, `decidedAt`, and
   `members/<uid>` with `invitedBy` and `approvedBy`. The rule lets a member decide an invite
   they didn't send; **the owner may decide any invite, their own included** (owner, 2026-10-10:
   with one member at launch nobody else could approve the first invitee). **Decline** sets
   `status: "declined"` and nothing else.
5. The newcomer's phone, watching its own invite, opens the app the moment it's approved.

**An existing friend** who is family: **Invite a friend** lists your Connect friends not yet in
`members/` or `invites/`; picking one writes `invites/<their uid>` with you as `invitedBy` and
their profile name (no email: profiles don't carry one). The rule accepts it from a member
connected to that uid. When they next open the app, they wait as above, or are already in.

**Removing a member** (the owner, hold): deletes `members/<uid>`. The friendship stays.

Trusts the family to recognise each other; accepted for a few dozen people (BRIEF.md).

## 6. Privacy

- **Private by default.** Google sign-in plus the member list. No anonymous reads.
- **Nothing personal in the public repo**: no names, dates, photos, GEDCOM or screenshots with
  real data. `data/` is gitignored and is a clone of the private data repo. `?mock` runs on
  invented people (`tools/mock-seed.mjs` makes them, Session 3).
- **Living people shown with less.** A person with no death date who was born within the last
  100 years, or whose birth year is unknown, is treated as living: name and relationships only;
  dates and places sit behind **Show details**, a per-phone toggle (localStorage) each member
  sets for themselves. (BRIEF.md said "born after 1926", which is this rule today.)
- **Opt-out honoured.** Any relative may ask for their record minimised or removed; `suggestions/`
  is the channel and the owner acts on it.
- **The raw mirror** lives in the private data repo and the owner's backup: never in Firestore,
  never here.
- **Export is logged** (`exports/`), so the data doesn't quietly leave.
- **The WikiTree read sends only the id.** The phone asks `api.wikitree.com` for one public
  profile by its WikiTree id, no sign-in and nothing about the family app; WikiTree's own privacy
  levels decide what comes back. A living person is never fetched (their row is the link alone).

## 7. Out of scope (for now)

Re-researching or verifying the genealogy; a public site; members editing people directly (next:
with an edit history); adding photos (photo-coach pattern); a member claiming the person that is
them; committing to WikiTree, Gramps or Ancestry (GEDCOM keeps the door open; WikiTree is a
link per person, read live, never copied: §2, §8); notifications.

## 8. Decisions

| Date | Decision |
|---|---|
| 2026-10-10 (owner) | **Jon Inggs**, not John, on every credit; Session 2 confirms against the recovered home page. |
| 2026-10-10 (owner) | **archive.org is allowlisted** in the cloud environment (web.archive.org, archive.org and www.wikitree.com under Allowed domains). Checked the same day: `web.archive.org` resets the cloud's TLS handshakes, so Session 2 opens with a one-line check and runs the recovery on the laptop if it still does (`PLAN.md`). |
| 2026-10-10 (owner) | **A private data repo** holds the mirror, manifest, parsed JSON, GEDCOM and seed files, cloned at `family-tree/data/` (gitignored). Confirms "no family data in the public repo". |
| 2026-10-10 (owner) | **Straight to main**, per CLAUDE.md: the planning branch was fast-forwarded into it. |
| 2026-10-10 (owner) | **WikiTree as a cross-check** in Session 2's recovery report; nothing imported from it without the owner's say-so. The Wayback copy is canonical. |
| 2026-10-10 (owner) | **WikiTree is linked, not copied.** Jon still keeps his Inggs profiles there (44 Inggs profiles against 2,332 people in his 2006 tree), so a matched person stores only the WikiTree id, and the person page reads the profile live from WikiTree's public API; its dates win on screen, the 2006 values stay as the source. Replaces "a cross-check only". The email to Jon says so and offers him the recovered tree. |
| 2026-10-10 (owner) | Accents **lilac** first, **coral** second. |
| 2026-10-10 (owner) | **The owner approves anyone**, their own invitees included; another member needs a second member. |
| 2026-10-10 (Fable) | Three tabs; the tree view reached from a person. A living person is one with no death and a birth within 100 years or unknown. Show details is per phone. The seed is the app's own Import, in files under 20 MB, since there is no server code and no admin key. Tools in `tools/` with tests beside them (the brief's own allowance; CLAUDE.md rule 1 names it). |
