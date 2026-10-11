# Inggs Family Tree — spec

The Inggs family tree that Jon Inggs researched and published at familytree.inggs.com, recovered
from the Wayback Machine's copies (the last whole one, 2 July 2017) before they are lost, and given a private home where
the family can browse the tree and the oldest photographs and add or correct what they know.
The brief is `BRIEF.md`; the sessions that build it are `PLAN.md`. This spec is the app as it is:
**1.0.0, the MVP (Session 4).** What comes next is `PLAN.md` (Sessions 6 to 8, research agents) and its
Parked list (adding family photos is next in line).

**Jon Inggs is the author.** Every screen that shows his work says so: the home page, every
person page ("Compiled by Jon Inggs · familytree.inggs.com · 2006"), the footer, the GEDCOM's
`SOUR` record and this file. (The brief wrote "John"; the owner settled on Jon on 2026-10-10,
the spelling he uses himself online, and confirmed in Session 2: the
recovered home page is titled "Jon Inggs's home page".)

**Files.** `index.html` (the app), `kin.js` (its pure logic: the living rule, the tree view's
layout, the Markdown renderer, the WikiTree copy beside Jon's and Share as Markdown; `kin.test.mjs`
beside it, CLAUDE.md rule 1's one exception), `sw.js`, `manifest.json`, icons, `tools/` (the Node scripts
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

Four tabs (`.tabbar`: **People · Stories · Photos · Family**; Stories got its own tab rather than
the top of Photos, Session 4), with person pages, the tree view, a photo and a story opened on top:
the phone's Back closes them one at a time, and each tab keeps its place.
Everything on the shared parts (`shared/DESIGN.md`); the app's own CSS is the tree view and the
photo treatment, nothing else.

**People** (Home). The credit line under the title ("Compiled by Jon Inggs · familytree.inggs.com
· 2006"), a search field (name, any part), then every person as a `.rows` list sorted by surname
then given name: a neutral initial ring or their first photo as the avatar, the name as `.l1`, the
years as `.l2` ("1884–1951", "b. 1902", or nothing). A caps label groups them by surname. A
name Jon didn't know sorts last (owner, 2026-10-11): a surname of only "?" at the end of the list
under "Surname not known", a given name of only "?" last in its surname (`kin.js` `byName`). Tap
opens the person. The list reads from one `people` listener (a few hundred documents, fine).

**A person.** The name large (Grotesk, the hero), the years line, **Tree** (76px, the one you came
for: the tree view centred on them), then:

- **Photos** of them, as a strip (tap → the photo).
- **Born** and **Died**: date and place, as Jon wrote them, for everyone (§6).
- **Parents**, **Married** (each spouse, with the date and place if known), **Children**: rows,
  each a tap to that person. A reference that doesn't resolve shows the name from the source with
  "(not in the tree)".
- **Jon wrote about them**: each of Jon's stories that names them (tap → the story).
- **Notes**: Jon's own text, verbatim.
- **On WikiTree** (only for a person matched to a profile, §4 `wikitree`): the profile's birth
  and death, who keeps it on WikiTree, "as of" the day the owner last copied it, and a link to
  the profile. The copy is `wikitree/<WikiTree id>` (§4), made on the owner's laptop
  (`tools/wikitree.mjs --cache`) and imported with seed part 1: WikiTree's API answers a browser
  only from wikitree.com's own pages (checked 2026-10-10), so the app never asks it. The Born
  and Died rows always show Jon's 2006 values; where WikiTree adds a day, a month or a date Jon
  didn't have, or disagrees, its value sits beside them ("WikiTree: 11 Apr 1863"), so a wrong
  link shows rather than quietly replacing a relative's dates; where WikiTree says less, nothing
  is added. Not in the copy (private on WikiTree, merged, or not fetched yet): the row is the
  link alone. A link is made only when a second fact agrees beyond name and birth year: the full
  birth date, or a parent's or spouse's name (`tools/wikitree.mjs`); the rest wait in the data
  repo's `wikitree-review.md` for the owner, with the copy's disagreements.
- **WikiTree also names**: the parents, spouses and children on the WikiTree profile that Jon's
  record doesn't show here, with "Father on WikiTree" and their years: someone linked to a person
  in the tree opens their page, anyone else opens WikiTree (Jon's newer work, mostly).
- **Source**: "Compiled by Jon Inggs · familytree.inggs.com · 2006" and a link to the Wayback
  page the record came from (opens in the browser).
- **Suggest a correction**: a sheet with a text box; saves to `suggestions/` with your name.
  "Thanks, Kenny will look at it." (the owner's first name, from their member document).
- **Share as Markdown** (the `⋯` beside Back, any member): **Their line** (the person and every
  parent up to the earliest known ancestor, father then mother, each generation a section) or
  **Their family** (parents, spouses, children). Each person: name, dates and places verbatim,
  relationships, Jon's notes, the full text of every story that names them (written out once,
  under the first person it names, and pointed at after), the WikiTree link with the copy's
  dates and "as of"; every source at the end. `navigator.share` with a `.md` file
  (NotebookLM, Drive, mail), a download where share isn't offered; logged in `exports/` first,
  like Export. ⚠ A member born after 2006 isn't in the tree: the line stops at the newest
  recorded generation until members can add people (Parked).

**The tree view.** The person in the middle; parents, grandparents and great-grandparents above;
children, grandchildren and great-grandchildren below; spouses beside. Each person a card with
name and years, in `--accent` for the centre, neutral for the rest; a tap moves the centre there.
Generations are rows; lines join a child to its parents (neutral above, coral below, the
descendant cards edged in coral), and a spouse beside the centre is joined to them. A tap moves
the centre there (Back moves it back); the centre itself opens their page. It scrolls both ways,
opens with the centre in the middle of the screen, and fits a phone held upright: cards 9rem wide,
the name at 17px and the years at 15px, at 390px. The layout is `kin.js` `layoutTree`: each person
sits over the middle of the block their parents (above) or children (below) take, so cards never
overlap; the page is a CSS grid of half-card columns, one row a generation, and an SVG under the
cards draws the lines from where they land (redrawn on resize). This is the one screen built to feel like something: the brief says aim high, and
the owner wants the family to see the shape of the tree, not a table. Reduced motion: no
animated re-centring.

**Stories.** Jon's family-history pages, by title, each with how many people and photos it has.
A story opens in a reading view: the title in Grotesk, the body at 18px, selectable, each image
full width (the thumb at once, the 1400px image as it loads) under its own ALT text (the caption
Jon wrote beside it is already in the words that follow), `photo:` and `story:` links opening
the photo or the story (a page that wasn't recovered says so), the source line, and the people it
names as chips. Markdown by `kin.js` `markdownToHtml`, no library: headings, paragraphs and line
breaks, rules, quotes, lists, emphasis, links, images and tables; a table wider than four columns
(Jon's register of the war dead has 21) is a card per row, label and value, read down a phone.
The 1916 PDF is a link to the Wayback copy.

**Photos.** Every recovered photograph as a grid, newest-captured first, each with its caption
under it. Tap: the photo full width (the 1400px image, loaded on demand), the caption verbatim,
the people in it as chips (tap → the person), the source link. A photo the Wayback Machine
didn't keep shows as a placeholder with its caption and "Not recovered", so the family knows it
existed.

**Family.** Who's in: every member with their avatar, "invited by Ann · approved by Kenny" (the
owner's own row: "Keeps the tree"). Then **Waiting** (§5): each pending invite as "Kenny invited
Dad" with the email, and **Approve** and **Hold to decline** in its `⋯` sheet ("Is this them?");
on an invite you sent, the sheet says another member decides (the owner decides any). Then
**Invite family**: **Show my QR** (My QR in the app's look) and **Invite a friend** (pick from
your Connect friends who aren't members or waiting; the owner may ask again for someone
declined). The owner's `⋯` on a member row holds **Hold to remove from the family**. Last, the
owner alone sees **Suggestions**: each open one with the person, the text, who and when, and in
its `⋯` **Open** the person and **Hold to mark done** (`status: "done"`, `doneBy`, `doneAt`).

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
stories/<id>        { title, markdown, images: [photoId], people: [id], source, pdf }   // Jon's pages; pdf: listed, not converted
wikitree/<wtId>     { person, fetchedAt, name, lastNameCurrent, nicknames, gender, manager, touched,
                      birth: { date, place }, death: { date, place },   // WikiTree's "1874-06-02", 00 for unknown
                      relatives: [{ role, wikitree, name, birth, death, date, place }] }
                    // the WikiTree copy (§2): a linked public profile's facts, never a biography or photo;
                    // role "father" | "mother" | "spouse" | "child"; date and place: a marriage's
suggestions/<id>    { person, personName, text, by, byName, at, status, doneBy, doneAt }   // status: "open" | "done"
exports/<id>        { by, byName, at, people, photos, kind, person, mode }   // the export log; kind "markdown"
                                                                     // for Share as Markdown (person, mode "line" | "family")
meta/main           { source, credit, captured, researcher, people, photos, photosRecovered, stories, wikitree, wikitreeFetched, mirrorFiles,
                      importedAt, importedBy, version }
```

Dates stay as Jon wrote them (`date`, a string) with a parsed `year` beside them only for an exact
date (`30 DEC 1922`, `MAR 1850`, `1845`, the first year of `1750/51`); `ABT 1850` keeps its text
and no `year`, and the app shows it as "c. 1850". Nothing is guessed (BRIEF.md, parsing rules).
A story's Markdown points at its images as `photo:<id>` and at another story as `story:<id>`. `refs` keeps a parent, spouse or child Jon
named whose page the parser couldn't match, rather than dropping it.

**Import** (the owner, the account sheet): the seed files the tools emit, `seed/family-tree-N.json`,
each under 20 MB, in the export format below (part 1: `meta`, `people`, `photos`, `stories`, `wikitree`; the
rest: `images`, with `seed: { part, of }`). Several can be picked at once and go in part order;
each is written in batches of at most 400 documents (images 10 at a time), each document
replaced whole by id (a field the file drops goes too), so a file can be imported twice without
harm. `members` and `invites` aren't imported: they are made
by approval (§5). From a laptop browser if the phone struggles with the size.

**Ids stay put across re-runs.** The parser keeps `data/ids.json` (each place a person appears on
Jon's pages → their id) and gives a person the id they had last time, so a corrected name or year
updates the same record; only someone new gets a new id, and a retired id is never reused.
**Seed part 1 is the whole tree**, so its Import first lists anyone in people, photos, stories or wikitree
that the file doesn't have: **Hold to remove** them (a photo takes its image), or **Import and
keep them**. Nothing goes without the owner seeing it.

**Export** (any member): one JSON file, `{ app: "family-tree", version, exportedAt, meta: { main },
people, photos, images, stories, wikitree, suggestions }` for a member (every collection an array of
`{ id, … }`, meta keyed like a collection, so `?mock&seed=` reads it as it is); the owner's also
carries `members` and `invites`. An `exports/` entry is written first; an export that can't be
logged doesn't happen.

**Who reads what** (`shared/firestore.rules`, its own block; cases in `shared/rules-check.mjs`;
mirrored in `shared/cloud-memory.js`). `isFam()` is "in `members/`, or the owner".

| | A newcomer (signed in) | A member | The owner |
|---|---|---|---|
| members/ | get their own | get, list | create (by approval, below), delete |
| invites/ | get their own; create their own (below) | get, list; create for a friend; decide one they didn't send | the same, and decide their own |
| people, photos, images, stories, wikitree, meta | — | read | read, write |
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

**The owner has a member document too** (`members/<owner's uid>`, written by the app on the
owner's first open): the rules know an inviter by their member document, and can't tell the owner
from a uid alone (the owner is found by email). A newcomer asking in writes their invite once: a
declined newcomer asks again through the owner.

Trusts the family to recognise each other; accepted for a few dozen people (BRIEF.md).

## 6. Privacy

- **Private by default.** Google sign-in plus the member list. No anonymous reads.
- **Nothing personal in the public repo**: no names, dates, photos, GEDCOM or screenshots with
  real data. `data/` is gitignored and is a clone of the private data repo. `?mock` runs on
  invented people (`tools/mock-seed.mjs` makes them, Session 3).
- **Members see everyone's dates and places** (owner, 2026-10-11), the living included: Jon
  published them on his public site for years, and the app is members-only and all family. The
  living rule stays for one thing, research agents (`PLAN.md` Session 5): a person with no death
  date who was born within the last 100 years, or whose birth year is unknown, is treated as
  living, and an agent searches for them only with their recorded consent (`consent/<id>`, set by
  the owner with a dated note). Softened (owner, 2026-10-11, "we all want to trace our lineage
  back"): without consent, an agent may still find a living person's parents (parent and birth
  claims only), and the owner's own line (the owner and their living ancestors) counts as
  consented, shared with the family, unless one of them says None (`kin.js` `researchStatus`,
  `ownLine`). A relative's dates prove death (owner, 2026-10-11): no birth year,
  but a child born 100+ years ago, a parent 150+ or a spouse 110+, and they are searched as the
  dead (`kin.js` `isPresumedDead`). Never searched for anyone living, even with consent: address,
  phone, email, ID numbers, employer today, finances, health, legal records, social media,
  current photos.
- **Opt-out honoured.** Any relative may ask for their record minimised or removed; `suggestions/`
  is the channel and the owner acts on it.
- **The raw mirror** lives in the private data repo and the owner's backup: never in Firestore,
  never here.
- **Export is logged** (`exports/`), so the data doesn't quietly leave.
- **The app never asks WikiTree.** The copy is made on the owner's laptop, never signed in, so
  WikiTree's own privacy levels decide what comes back, living people included. WikiTree's terms
  (read 2026-10-11) allow copying for personal family research, not a substantial part of the
  site, and ask a copy to link back to each profile and to be refreshed, since members change
  their privacy settings: every entry links its profile, and the owner refreshes it
  (`wikitree.mjs --cache`, then Import part 1). Facts only: a biography or photo is copyright
  of whoever wrote or took it.

## 7. Out of scope (for now)

Re-researching or verifying the genealogy; a public site; members editing people directly (next:
with an edit history); adding photos (photo-coach pattern); a member claiming the person that is
them; committing to WikiTree, Gramps or Ancestry (GEDCOM keeps the door open; WikiTree is a
link per person with a dated copy of its facts: §2, §8); notifications.

## 8. Decisions

| Date | Decision |
|---|---|
| 2026-10-10 (owner) | **Jon Inggs**, not John, on every credit; Session 2 confirms against the recovered home page. |
| 2026-10-10 (owner) | **archive.org is allowlisted** in the cloud environment (web.archive.org, archive.org and www.wikitree.com under Allowed domains). Checked the same day: `web.archive.org` resets the cloud's TLS handshakes, so Session 2 opens with a one-line check and runs the recovery on the laptop if it still does (`PLAN.md`). |
| 2026-10-10 (owner) | **A private data repo** holds the mirror, manifest, parsed JSON, GEDCOM and seed files, cloned at `family-tree/data/` (gitignored). Confirms "no family data in the public repo". |
| 2026-10-10 (owner) | **Straight to main**, per CLAUDE.md: the planning branch was fast-forwarded into it. |
| 2026-10-10 (owner) | **WikiTree as a cross-check** in Session 2's recovery report; nothing imported from it without the owner's say-so. The Wayback copy is canonical. |
| 2026-10-10 (owner) | **The email to Jon waits until the MVP is live**, so there is something to show him. The build doesn't depend on it: Session 3 parses the recovered HTML, and a GEDCOM from Jon, if he sends one, replaces that later. |
| 2026-10-10 (owner) | **The credit reads "Compiled by Jon Inggs · familytree.inggs.com · 2006"**: the year Jon built this version of the tree, the family domain people knew it by (not his ISP page), and "compiled", the genealogy word GEDCOM uses. |
| 2026-10-10 (owner) | **WikiTree is linked, not copied.** Jon still keeps his Inggs profiles there (44 Inggs profiles against 2,332 people in his 2006 tree), so a matched person stores only the WikiTree id, and the person page reads the profile live from WikiTree's public API. Replaces "a cross-check only". The email to Jon says so and offers him the recovered tree. |
| 2026-10-10 (owner) | **Jon's stories and a Markdown export.** His family-history pages become readable stories linked to the people they name (Sessions 3 and 4, `PLAN.md`); any member can share a person's line or family as Markdown (for NotebookLM and the like), logged like Export. **Research agents** come after the MVP (Session 5), on hard lines: the dead freely, a living person only with their recorded consent and only genealogy, never contact, ID, financial, health, legal or social-media details. |
| 2026-10-10 (owner) | **Jon's dates stay first; WikiTree's sit beside them** where they differ (replaces "WikiTree's dates win"), and a WikiTree link needs a second fact (the full birth date, or a parent's or spouse's name) beyond name and birth year. A namesake born the same year is common outside the Inggs name: 18 of 117 name-and-year links failed the check and went to the owner's review. |
| 2026-10-10 (owner) | Accents **lilac** first, **coral** second. |
| 2026-10-10 (Opus, Session 4) | **Stories is a fourth tab**, not the top of Photos: eleven stories and twenty photos read better apart, and four tabs fit 390px. A story's figure is captioned by the image's ALT, since Jon's own caption follows it in the text. In Share as Markdown a story naming several people in the line is written out once. |
| 2026-10-10 (Opus, Session 4) | **WikiTree's live read can't run from github.io** (its API allows only wikitree.com origins). Built as specified, with the spec's own fallback (the link alone); no proxy, since there is no server code. |
| 2026-10-10 (owner) | **The owner approves anyone**, their own invitees included; another member needs a second member. |
| 2026-10-11 (owner) | **WikiTree is cached, not read live.** Since the live read can't run from github.io, the owner's laptop keeps a dated copy of each linked person's public WikiTree profile (facts only: see the terms row below), refreshed by hand and imported into `wikitree/`, apart from Jon's records. Replaces "linked, not copied"; built in Session 4b (`PLAN.md`). |
| 2026-10-11 (owner) | **Members see everyone's dates and places**, the living included; Show details is gone. The rule had hidden 1,411 of 2,331 people, 876 of them only for want of a birth year, and Jon published these dates for years. The living rule stays for research agents' consent (Session 5). The WikiTree copy takes what WikiTree shows publicly, living included. |
| 2026-10-11 (Opus, Session 4b) | **WikiTree's terms checked**: personal family research, not a substantial part of the site, link back, keep it fresh; biographies and photos belong to their authors, so the copy is facts only. Its dates are compared with Jon's as same, vaguer, more or differ: only "more" and "differ" show beside his, and only "differ" goes to the owner's review (7 of 97 on the first run; 36 more only add a day or a date). |
| 2026-10-11 (owner, Session 5) | **Research agents**: free public sources searched by agents (WikiTree's API, FreeBMD, FreeREG, FreeCEN, eGGSA, NAAIRS, free newspaper archives); FamilySearch and paid sites by hand, from lookups the agent writes. Run from a laptop session, 10 briefs a run. The owner alone approves a finding; an approved one shows on the person page with its source and never changes Jon's record. A relative's dates prove death (316 more searchable). `PLAN.md` Sessions 5 to 8. |
| 2026-10-10 (Fable) | Three tabs; the tree view reached from a person. A living person is one with no death and a birth within 100 years or unknown. Show details is per phone. The seed is the app's own Import, in files under 20 MB, since there is no server code and no admin key. Tools in `tools/` with tests beside them (the brief's own allowance; CLAUDE.md rule 1 names it). |
