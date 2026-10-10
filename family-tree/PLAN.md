# Inggs Family Tree — working doc for the build sessions

Recover Jon Inggs's family tree from the Wayback Machine, turn it into portable data, and give the
family a private place to browse it and grow it. This doc is the handover between consecutive
Claude Code sessions, the `rack-it/V3-PLAN.md` pattern: each session does its list, ticks its
boxes, and writes its Handover note at the bottom, so the next session starts from the truth.

**Start every session with:** "Read `family-tree/PLAN.md` and do Session N."
Session 1 (planning, Fable) is done. Sessions 2 to 4 run on Opus 5.5 and are specified below in
full; don't re-plan them, do them.

## Read first, every session

1. `CLAUDE.md` — the repo rules. Direct to `main`, one file per app, bump `APP_VERSION` and
   `CACHE` together, deploy with `/deployquest`, test with `?mock`.
2. `family-tree/SPEC.md` — the app as it will be: screens, data, rules, invites, privacy, and the
   owner's decisions. Update it in the same commit when a decision here changes it.
3. `family-tree/BRIEF.md` — the owner's brief, for the why. The spec and this doc override it
   where they differ (the Decisions table in the spec says where).
4. `shared/KIT.md` (Connect, accounts, the owner), `shared/CONNECT.md` §1–§2 and §8 (My QR,
   `handleInvite`), `shared/DESIGN.md` (before touching a screen).
5. The **Handover** section at the bottom of this doc.
6. Before a rules change: the Sessions Loyalty block in `shared/firestore.rules` and its cases in
   `shared/rules-check.mjs` (from "Sessions Loyalty: staff"), and `shared/proofs/README.md`.

## Ground rules for every session

- **No family data in this repo, ever.** Not a name, date, photo, GEDCOM, export or screenshot
  with real people. `family-tree/data/` is gitignored and is a clone of the private data repo
  (`kinggs/kinggs-family-tree-data`); the tools write only there. Findings recorded in this doc are
  counts and patterns with placeholder names (`<given> <surname>`). The `?mock` seed is invented.
- **The raw mirror is immutable.** `data/mirror/` is written once by `tools/mirror.mjs` and never
  overwritten; every later step reads from it.
- **Be kind to archive.org.** About one request a second, retries with exponential backoff on
  429 and 5xx, a user agent that says who we are. Everything is read-only and within their terms.
- **Jon's wording is kept verbatim** in notes and captions; nothing missing is guessed; the
  unresolved is logged, never dropped (BRIEF.md, parsing rules).
- **Tools have tests.** A pure module in `tools/` gets a `*.test.mjs` beside it with synthetic
  fixtures; `node --test` from the repo root runs them (`make verify`).
- **Every rules change: cases first** in `shared/rules-check.mjs`, then the rule, then its guard
  in `shared/proofs/guards.mjs`, then `shared/cloud-memory.js`'s matching row. The `deploy-rules`
  Action runs the cases; a cloud session usually has no Java, so the Action is the check.
- **Deploy at the end of the session** (Sessions 3 and 4), not the start of the next. A session
  that can't finish its list deploys what works and writes the rest into Handover. The data repo
  is committed and pushed at the end of every session too; a cloud container is wiped afterwards.
- **Don't build ahead.** Each session's list is the whole of that session. Ideas go in Parked.
- Ask the owner nothing the spec, the brief or this doc already answers. If something is
  genuinely open, pick the simplest reading, do it, and say so in Handover.
- A cloud session may lack Playwright: `npm i playwright-core` in the scratchpad and point
  `PLAYWRIGHT` at its `index.mjs` (Chromium is at `/opt/pw-browsers`); Session 1 did this and
  smoke and the icon script ran. Say in Handover what did and didn't run.

---

## Session 1 — Planning and inventory (Fable, 2026-10-10)

**Goal:** the folder, the spec, this plan, the inventory tooling, the owner's open decisions
settled, and the CDX inventory run. **Status: done, bar the inventory**, which this cloud
environment couldn't run (archive.org is denied by its network policy; see Handover). The
inventory and the HTML sampling are Session 2's step 0, with the script ready.

- [x] `family-tree/` from `/sidequest` steps 1–2: the template, the icon (three nodes on a lilac
      fork) and its PNGs, `.gitignore` for `data/`, `mirror/`, `node_modules/`, `*.ged`.
- [x] `SPEC.md` from the brief, with the Decisions from the owner's interview.
- [x] `PLAN.md` (this), Sessions 2–4 specified.
- [x] `tools/cdx.mjs` + tests (parsing the CDX index, canonical URLs, the best capture per URL, the
      site's shape) and `tools/inventory.mjs` (the fetch, one request a second, resumable).
- [ ] ~~Run the inventory and sample the HTML~~ → Session 2 step 0 (network).
- [x] The owner's decisions (SPEC.md §8). The email to Jon drafted: `EMAIL-DRAFT.md`.
- [x] Handover. Pushed to `main`.

---

## Session 2 — Recovery (Opus 5.5)

**Goal:** a complete local mirror of familytree.inggs.com as the Wayback Machine holds it, with a
manifest that ties every file to its capture, a recovery report, and the site's HTML pattern
recorded here for the parser. No app work. Lands nothing on the live site except this doc.

**Owner, before the session** (the Session 1 Handover says how):

- [x] The cloud environment allows `web.archive.org`, `archive.org` and `www.wikitree.com`
      (done 2026-10-10; the Handover says what each host then did).
- [x] The private repo exists, named **`kinggs/kinggs-family-tree-data`** (not `family-tree-data`;
      this doc uses the real name from here on), and the environment clones it (Session 2).

**In the session, first:** `git clone https://github.com/kinggs/kinggs-family-tree-data family-tree/data`
(gitignored here). If the clone can't happen, work in `family-tree/data/` anyway and say in
Handover that the mirror needs pushing from a machine that can.

**Then the one check that decides where this session runs:**

```bash
curl -sS -m 30 -o /dev/null -w "%{http_code}\n" "https://web.archive.org/cdx/search/cdx?url=familytree.inggs.com/*&output=json&limit=2"
```

200 means the cloud can do it: carry on here, with `NODE_USE_ENV_PROXY=1` in front of every
`node` command that fetches (Node's fetch ignores the proxy otherwise). `000` with "Connection
reset by peer" means what Session 1 saw: `web.archive.org` resets this cloud address at the TLS
handshake while `archive.org` answers, which is the archive's side and no setting fixes it. Then
Steps 0 to 2 run **on the owner's laptop** instead (`git clone` both repos, `node
family-tree/tools/inventory.mjs`, then the mirror and strays scripts, written here and run
there), and this session writes and tests the scripts, records what the laptop run printed when
the owner pastes it back, and does Step 3 and 4 from what reached the data repo. Say which way it
went in Handover.

**Session 2 (2026-10-10): `000`, reset again.** So Steps 0 to 2 are one laptop command
(`tools/recover.mjs`, below), written and proved here on a fake archive; Steps 0's sample, 3 and 4
wait for its output in the data repo.

### On a desktop session (the way to finish; owner's choice, 2026-10-10)

A Claude Code session on the laptop (the desktop app or the CLI, in a local folder, not a cloud
environment) can reach the archive, so it does **all of the rest of Session 2 itself**: the run
below, then Step 0's checks and sample, Step 3, Step 4, and the pushes. Start it in an empty
folder with:

> Clone https://github.com/kinggs/sidequests, read `family-tree/PLAN.md`, and finish Session 2 on
> this machine.

Notes for that session: it runs locally, so no `NODE_USE_ENV_PROXY` and no proxy; it clones the
data repo into `sidequests/family-tree/data` as below, then starts `recover.mjs` in the
background (about a second per file; it prints progress and is safe to restart) and does the
reading as files land. Push `sidequests` straight to `main` (CLAUDE.md rule 5) and the data repo
to its `main`. Before each `sidequests` commit, `git status` must show nothing under
`family-tree/data/` (it's gitignored; check anyway). For WikiTree (Step 3), ask the owner to save
the page from their own browser into `family-tree/data/wikitree/`; if they skip it, park it.

### The laptop run by hand (if not a desktop session; about an hour, safe to stop and restart)

On a Mac or PC with Node 18 or later (`node -v`; nodejs.org if not) and git, in a terminal:

```bash
git clone https://github.com/kinggs/sidequests
cd sidequests
git clone https://github.com/kinggs/kinggs-family-tree-data family-tree/data
node family-tree/tools/recover.mjs
cd family-tree/data && git add -A && git commit -m "Recovery run" && git push
```

`recover.mjs` runs the inventory (and `inggs.com`, `*.inggs.com` beside it, into `data/hosts/`),
lists the home page's captures and saves the February and latest ones into `data/checks/`, then
the mirror and the strays, each skipping what's done. If it stops (the archive throttles, the lid
closes), run it again. If it can't connect at all, say so in the next session. While it runs, do
Step 3's WikiTree save into `family-tree/data/wikitree/` so the one push carries both. Then start a new
cloud session with: "Read `family-tree/PLAN.md` and finish Session 2 from the laptop run."

- [ ] **Owner:** the laptop run, pushed to the data repo.

### Step 0 — The inventory and the sample (Session 1's step 4)

- [ ] `NODE_USE_ENV_PROXY=1 node family-tree/tools/inventory.mjs` (the env var only in the cloud).
      It writes `data/cdx.json` (every capture),
      `data/cdx-best.json` (the chosen capture per URL) and `data/inventory.md`, and prints the
      shape. Paste the printed lines into **Findings** below (`data/inventory.md` holds them).
      `inggs.com` and `*.inggs.com` are run too, by `--host` (no edit), into `data/hosts/`;
      record what each returned.
- [ ] The brief's "last known good" is 2010-02-14, but the availability API says the home page's
      latest 200 is **2010-04-18 17:31:09** (Session 1 Handover). Check that capture: if it is the
      site, intact and later, set `TARGET` in `tools/cdx.mjs` to it (one constant, one test
      fixture) and say so in Findings; if it is a 401 dressed as a 200 or a holding page, keep
      February. Also look at `inggs.com` (captured 2010-02-22): if it links to the tree or holds
      photos, add it to the inventory with a second `HOST` run.
- [ ] Is there a GEDCOM in the index (`describe()` says)? If so, it changes Session 3: say so in
      Findings, download it in step 1 like any file, and Session 3's parser becomes a GEDCOM
      reader first and an HTML parser for what the GEDCOM lacks (photos, notes).
- [ ] **Sample by hand** (BRIEF.md Phase 2 step 1): the home page, an index or surname page, and
      five or six person pages, fetched with the `id_` URL. Write **The site's pattern** below:
      the generator (a `<meta name="generator">`, a footer line, the file naming), where the
      name, sex, birth, death, parents, spouses and children sit (tags, classes, label text), how
      a person links to another (href shape, the id in it), how photos are referenced (`<img src>`
      shape, caption placement, a photo page or inline), the character set, and anything odd.
      Placeholders for names, never real ones.

### Step 1 — The mirror

- [x] `tools/mirror.mjs` (Session 2; `recover.mjs` runs it): reads `cdx-best.json`, downloads
      every URL with status 200 via `waybackRaw()` (the `id_` flag), one request a second with the
      same backoff as the inventory, into `data/mirror/<path as on the site>` (`home.intekom.com/joni/html/fam00012.htm`
      → `data/mirror/html/fam00012.htm`; the site's root → `index.html`, another host under `_hosts/<host>/`; a query string becomes part of
      the file name, URL-encoded). **Never overwrites**: a file already there is skipped, so the
      run is resumable and the mirror immutable. Each file's row goes into `data/manifest.json`:
      `{ path, url, timestamp, status, mime, bytes, sha256, wayback (the view URL), raw (the id_
      URL), fetchedAt, kind }`. A URL with no 200 is listed in the manifest with its status and
      `path: null`, not fetched: that is the gaps log.
- [x] A 200 that comes back as the Wayback Machine's own error page (an HTML body on an image
      URL, or a body with "Wayback Machine" and no site content) is logged as `status: "soft-404"`
      and not kept.
- [x] `tools/mirror.test.mjs`: the path mapping, the skip-if-exists rule and the soft-404 test, on
      synthetic inputs.

### Step 2 — Strays

- [x] `tools/strays.mjs` (Session 2): parses every `.htm`/`.html` in the mirror for `href`, `src`,
      `background` and CSS `url()` references, resolves them against the page's URL, canonicalises
      (`cdx.canonical`), drops off-site links, and lists every on-site URL that isn't in
      `cdx-best.json`. For each, one exact CDX lookup (`url=<that url>&output=json`, same
      pacing); a hit is appended to `cdx.json` and `cdx-best.json`, then fetched by step 1's
      code. Repeat until a pass finds nothing new. A URL the CDX has never seen goes in the
      manifest as `status: "never-captured"`.
- [x] `tools/strays.test.mjs`: link extraction and resolution on a synthetic page.

### Step 3 — The WikiTree cross-check (owner, 2026-10-10)

- [x] Count WikiTree's Inggs profiles and who manages them (Findings). Done from the laptop: the
      surname page through the owner's Chrome, the counts through WikiTree's public API
      (`api.wikitree.com/api.php?action=searchPerson&LastName=Inggs&limit=100`), which answers
      curl and allows browser calls. No page saved: the counts were enough.
- **Owner's decision after the counts (2026-10-10): link, don't copy.** A matched person stores
  only a WikiTree id, and the person page reads the profile live (SPEC §2, §4, §8). Session 3
  does the matching, Session 4 the live row. The email to Jon now says so.

### Step 4 — The recovery report

- [ ] `data/report.md`: URLs in the index, pages and images recovered, missing (by status), bytes,
      the capture date range, the GEDCOM question, the WikiTree counts, what strays found, and
      anything the parser should know. One page.
- [ ] Commit and push the data repo. Commit the tools and this doc's Findings and Handover to
      `main` (`/deployquest` is not needed: nothing on the live site changed; a plain push).

**Done when:** `data/mirror/` holds every 200 the index has, `manifest.json` has a row for every
URL in `cdx-best.json`, the report reads as one page, **The site's pattern** below is filled in,
and `git status` in `sidequests` shows no data.

### Findings (Session 2 fills in)

- Inventory: _the `describe()` lines_.
- GEDCOM in the index: _yes/no_.
- Recovered: _N pages, N images; missing N (401), N (404), N never captured_.
- WikiTree: _N profiles; managed by…; overlap…_.

### The site's pattern (Session 2 fills in; Session 3's parser and its fixtures follow it)

- **Where the site was:** `familytree.inggs.com` was only a domain forwarder: every capture
  (2002–2010) is a one-frame `<frameset>` onto Jon's ISP home page, `home.intekom.com/joni`
  (before about 2003, `home.intekom.co.za/joni`, the same paths). The tools now treat
  `home.intekom.com/joni` as the site (`cdx.SITE`), fold `.co.za` into it (`cdx.ALIASES`) and keep
  the forwarder beside it (`mirror/_hosts/familytree.inggs.com/`).
- **Generator:** `<META NAME="Generator" CONTENT="Gedpage Version 2.00">`, footer "Page built by
  Gedpage Version 2.00 ©1997 on 17 July 2006". Gedpage turns a GEDCOM into one page per
  family. Jon's home page says "Browse the 2332 people… (updated 17th July 2006)". The GEDCOM
  itself was never published.
- **File naming and ids:** `joni/html/famNNNNN.htm` (five digits, from `fam00001`), one per
  family (a couple, or a parent with children); `joni/html/namesN.htm`, the names index in parts;
  `joni/html/surnames.htm`, the surname index. **There are no person ids.** A person is
  identified by the family page where they are a spouse, plus their name.
- **A family page:** `<TITLE>` is `<Given> <SURNAME>/<Given> <SURNAME>` (husband/wife). The body is
  one `<PRE>` block of labelled lines between `<HR NOSHADE SIZE=3>` rules: `Husband: <B>name</B>`,
  then `Born: <date> at: <place>`, `Married: … at: …`, `Died: … at: …`, `Father:<A HREF=famN>name</a>`,
  `Mother:<A HREF=famN>name</a>` (both link to the *parents'* family page), `Other Spouses:`
  (links); the same for `Wife:`; then `<B>CHILDREN</B>` and per child, between
  `<HR NOSHADE SIZE=1>`: `Name:`, `Born:`, `Married:`, `Died:`, `Spouses:` (links). Labels are
  right-aligned with leading spaces, values padded to column 26 before `at:`. Surnames are in
  capitals. Dates are GEDCOM style (`30 DEC 1922`, `22 MAR` with no year, `1845`); empty fields
  keep the label. A side with no person has a blank label line.
- **Links between people:** a child with a family of their own links to it (`Name: <A HREF=famN>`);
  a child with none is plain text (no page: they exist only on their parents' sheet). Father and
  Mother link to one parents' page. The footer links HOME (`http://familytree.inggs.com`),
  `mailto:` and `surnames.htm`.
- **Notes:** none on the pages sampled. Some child names carry a short prefix of Jon's
  (`D1 <given> <SURNAME>`); keep it verbatim, don't interpret it.
- **Photos and captions:** none on the Gedpage pages. Photos are on Jon's hand-made pages beside
  the tree (`joni/j_stone.htm`, "photographs and history"; `joni/*.jpg`, a few dozen in the index),
  with captions in the page text. Session 3 links them to people by hand-checked name matches.
- **Index pages:** `namesN.htm`: under `<A NAME="SURNAME">` anchors, one line per person,
  `<A HREF="famN.htm">SURNAME, Given</A> (birth-death)<BR>`, dates as on the family page, either
  side blank. This is the closest thing to a person list: one row per person with their page.
- **Character set and oddities:** no charset declared; the names index is ISO-8859-1 (accented
  names), the rest ASCII; CRLF line ends; upper-case tags. Jon's own pages (home, history,
  articles, the economic-history society) share the folder: the parser reads only
  `joni/html/` and the photo pages.

---

## Session 3 — Structure, the rules, and a gated shell with the people list (Opus 5.5)

**Goal:** `people.json`, `photos.json` and `inggs.ged` in the data repo, every record carrying its
source page; the seed files; the rules block; and the app live at
`https://kinggs.github.io/sidequests/family-tree/` as a sign-in-and-member gate with the People
tab working from Firestore. Lands `0.2.0`.

**Before starting:** clone the data repo as in Session 2. Read **The site's pattern** above. If
Session 2 found a GEDCOM, step 1 reads it first (see Session 2 step 0) and the HTML fills in
what it lacks.

### Step 1 — The parser

- [ ] `tools/parse.mjs` → `data/people.json` and `data/photos.json` in SPEC.md §4's shapes, read
      from `data/mirror/` only. HTML parsing with `cheerio` (`npm i --no-save cheerio` in
      `family-tree/tools/`, its `node_modules/` gitignored) unless the pages are regular enough
      for a small hand parser; either way `tools/parse.test.mjs` pins the pattern on **synthetic
      fixtures** written in that pattern (`tools/fixtures/`, invented names) and never on the
      mirror. Rules: never guess a date or a relationship; `date` verbatim, `year` only when four
      digits read cleanly; notes and captions verbatim; `refs` for a parent, spouse or child whose
      page couldn't be matched; `source` on every record (`url`, `wayback`, `captured` from the
      manifest).
- [ ] Validate: every `parents`, `spouses[].id`, `children` and `photos` id resolves; a photo's
      `recovered` is whether its file is in the mirror; a spouse link is symmetric and a
      parent/child link is mirrored (fix the data where one side is missing, and log it).
- [ ] `data/parse-report.md`: people parsed, photos (recovered vs missing), unresolved refs,
      pages that failed to parse, one-sided links fixed. The brief's one-page recovery report is
      this plus Session 2's.

### Step 2 — GEDCOM

- [ ] `tools/gedcom.mjs` (pure; `gedcom.test.mjs` on the same fixtures) → `data/inggs.ged`,
      GEDCOM 5.5.1, UTF-8: `HEAD` with `SOUR` "sidequests family-tree", a `SOUR` record naming
      **Jon Inggs** as compiler and familytree.inggs.com (2010) as the publication; one `INDI` per
      person (`NAME` given /surname/, `SEX`, `BIRT`/`DEAT` with `DATE` as written and `PLAC`,
      `NOTE`, `OBJE` per photo naming the mirror file, a `SOUR` citation with the Wayback URL);
      one `FAM` per couple or per single parent with children (`HUSB`, `WIFE`, `CHIL`, `MARR`
      with `DATE`/`PLAC`); `FAMC`/`FAMS` links; a `NOTE` on every unresolved ref. Every xref
      resolves (the test checks a round-trip of the ids).

### Step 2b — WikiTree ids (owner, 2026-10-10: link, don't copy)

- [ ] `tools/wikitree.mjs` → `data/wikitree.json`: for each surname in `people.json` that WikiTree
      has (start with Inggs; `searchPerson` by `LastName`, `limit` at most 100, paged, a second
      between calls), match a profile to a person when the given names and the surname agree
      and the birth years agree (or both lack one and the parents' names agree). One match →
      `people[i].wikitree = "<Surname>-<n>"`; two or more, or a near miss, go in
      `data/wikitree-review.md` for the owner and are not linked. Store the id only: no dates,
      no bio, nothing else from WikiTree enters the data repo or Firestore. The pure matching
      (`matchProfiles(people, profiles)`) gets `wikitree.test.mjs` on invented rows.
- [ ] Count in `parse-report.md`: matched, ambiguous, WikiTree profiles with no match (those are
      Jon's newer work; the person page can't show them, and Parked says what might).

### Step 3 — The seed, and a mock seed

- [ ] `tools/seed.mjs` → `data/seed/family-tree-1.json`, `-2.json`, …: the app's export format
      (SPEC.md §4), each file under 20 MB: the first carries `meta`, `people` and `photos`
      (thumbs ~400px, made with `sharp`? no: no native deps; use Chromium via `shared/proofs/pw.mjs`
      to draw and shrink, as `make-icons.mjs` does, or a pure-JS JPEG decoder/encoder in
      `node_modules` of `tools/` if Chromium can't be had), the rest carry `images` (1400px long
      edge JPEG data URLs) in chunks. `meta.photosRecovered` counts files actually in the mirror.
- [ ] `tools/mock-seed.mjs` → `shared/proofs/seeds/family-tree-mock.json`: about 15 invented
      people over four generations (two living by the rule, one with no birth year, one
      unresolved ref), six photos as small generated images (an SVG-drawn JPEG or a coloured
      PNG data URL), captions, one suggestion. Committed: it's invented. `?mock&seed=../shared/proofs/seeds/family-tree-mock.json`.

### Step 4 — The rules (cases first)

- [ ] Cases in `shared/rules-check.mjs`, a "Family Tree" describe block in the Sessions Loyalty
      style, seeded past the rules with members `owner` (role owner) and `ann`, newcomer `ben`
      connected to `ann` (`friendships/ann_ben`), stranger `cat`, a person, a photo, an image,
      meta, a suggestion:
  - a member reads people, photos, images, meta, suggestions, members and invites (get and list);
  - a newcomer gets `members/ben` (absent) and `invites/ben`; refused: listing either, any
    person, photo, image or meta;
  - signed out: refused everything;
  - ben creates `invites/ben` `{ uid: "ben", name, email: "ben@gmail.com", invitedBy: "ann",
    invitedByName, at, status: "pending" }`; refused: for cat (`uid` not his), `status: "approved"`,
    `invitedBy` someone he isn't connected to, another's email, an extra key;
  - ann creates `invites/cat` with `invitedBy: "ann"` when connected to cat; refused when not;
  - ann (the inviter) refused deciding `invites/ben`; the owner decides it (own invitees too); a
    second member `dee` decides it: the batch `{ status: "approved", decidedBy: "dee", decidedAt }`
    + `members/ben { name, since, invitedBy: "ann", approvedBy: "dee" }` succeeds; refused: the
    member doc alone, `approvedBy` not self, deciding an invite already decided, changing any
    other field, declining with a member doc in the batch;
  - a member refused writing people, photos, images, meta, members (bar approval), deleting an
    invite; the owner writes and deletes all of them;
  - a member creates a suggestion with `by` self; refused with `by` another or updating one; the
    owner updates and deletes;
  - a member creates `exports/x` with `by` self; refused reading the list; the owner reads it.
- [ ] The block in `shared/firestore.rules` after Sessions Loyalty's, `isFam()`, with
      `'family-tree'` added to the generic owner rule's exclusion list; the SPEC §4 table is the
      rule. The approval is `getAfter` on the invite in the same batch, as `confirming()` does.
- [ ] Guards in `shared/proofs/guards.mjs` for each new condition; rows in `shared/cloud-memory.js`
      (`isFam` there too). `KIT.md`'s open-rule row and CLAUDE.md's rules bullet name Family
      Tree beside Rack It and Sessions Loyalty.

### Step 5 — The shell

- [ ] Replace the placeholder section of `index.html` with: the gate (signed out), the
      **waiting screen** (a newcomer, watching `invites/<me>` and `members/<me>`), and the three
      tabs with People working: the credit line, search, the surname-grouped list (SPEC §2). A
      person's tap opens a stub person page: name, years, source link, "More in the next
      session". Photos and Family tabs say "Coming next". The account sheet: Profile, My QR,
      Friends, Export (logged), Import (the owner; the seed files; batches of 400, images 10),
      Install, Sign out. `connect.handleInvite({ app, appName, onDone })` writes the newcomer's
      invite from `onDone({ uid })` when there is no `members/<me>` and no invite yet
      (SPEC §5 step 2). The invite UI itself (approve, decline, invite a friend) is Session 4;
      but the waiting screen and the invite write are here, so the rules are exercised end to end.
- [ ] Living rule applied in the stub page already (`isLiving()` in a small pure function in the
      page; the years line shows nothing for a living person without Show details).
- [ ] `shared/proofs/family-tree-gate.mjs`: the owner on the mock seed sees the people list and
      imports a second seed file without duplicates; `&as=stranger` sees the waiting screen and
      nothing else; signed out sees Sign in; a two-tab scan (`h.mjs`, as `connect-scan.mjs` does)
      writes `invites/<newcomer>` with the right `invitedBy`. Smoke green.
- [ ] Version `0.2.0`, `CACHE` to match, `/deployquest`; wait for the rules Action and report it.
- [ ] Commit and push the data repo (people.json, photos.json, inggs.ged, seed/).
- [ ] **Owner:** sign in to the live URL (the phone, or a laptop browser for the big files),
      account sheet → Import each `seed/family-tree-N.json` in order; the People tab fills.
      Tick this box.

**Done when:** `node --test` passes with the parser and GEDCOM tests; the rules Action is green on
the new cases; the owner sees the real people list on the phone; a stranger sees the waiting
screen; nothing personal is in `sidequests`.

---

## Session 4 — The interface, invites, and the MVP (Opus 5.5)

**Goal:** the person page, the tree view, the photo gallery, suggestions, the Family tab with
invites and members, the launcher tile, and `1.0.0` live. MVP done when Kenny can sign in on his
phone and browse to his grandparents' photos, and his father can be invited by QR and approved.

Read `shared/DESIGN.md` again before this session; the tree view and the photo treatment are the
app's own CSS, everything else is theme parts. If a `frontend-design` skill is available in the
session, load it before the tree view; if not, say so and build from DESIGN.md.

- [ ] **The person page** (SPEC §2): photos strip, Born/Died, Parents/Married/Children rows with
      `(not in the tree)` for a `ref`, Notes verbatim, **On WikiTree** (SPEC §2: a live
      `getProfile` by the stored id, fields `Name,BirthDate,DeathDate,BirthLocation,DeathLocation,Manager,Touched`,
      kept in memory for the session; WikiTree's dates win on screen with the 2006 value under
      Source; offline or no answer → the link alone; never for a living person), Source with
      the Wayback link, **Tree**
      (76px), **Suggest a correction** (a sheet → `suggestions/`). Living: Show details toggles
      the dates and places, per phone.
- [ ] **The tree view**: three generations up and down and spouses beside, the centre in lilac,
      the descendant side's lines in coral; cards of name and years; a tap re-centres; scrolls both
      ways; readable at 390×844 with nothing under 15px; no animation under reduced motion. Build
      it as one `<section class="tree">` with CSS grid rows per generation and SVG lines drawn
      from the laid-out card positions (a `ResizeObserver` redraws). Test with the mock seed's four
      generations and with a person who has no parents and no children.
- [ ] **Photos** tab: the grid of thumbs with captions, a placeholder for a photo not recovered;
      the photo page loads `images/<id>` on demand, shows the caption, the people as chips, the
      source.
- [ ] **Family** tab: members with "invited by · approved by"; **Waiting** with Approve and
      Decline in each row's `⋯` (one batch, SPEC §5); **Show my QR** (`connect.showQR({ app })`);
      **Invite a friend** (`people.pick`-style sheet over `cloud.account.watchFriends`, minus
      members and invitees) → `invites/<uid>`; the owner's **Hold to remove** on a member. The
      newcomer's phone opens the app the moment its invite is approved.
- [ ] **Suggestions for the owner**: a section on the Family tab the owner alone sees, each
      suggestion with the person, the text, who and when, and **Done** (hold) → `status: "done"`.
- [ ] The launcher tile in the root `index.html`, alphabetical (between Bloc 11 and Photo Coach),
      lilac, "The family tree, from Jon's research".
- [ ] `shared/proofs/family-tree-invites.mjs`: two tabs: the owner shows My QR, `dad` lands with
      `&i=<code>`, sees the waiting screen, the owner approves from the Family tab, dad's tab opens
      the people list; a second member `ann` invites friend `eve` without a QR; the owner declines
      `eve`; `ann` can't approve her own invitee but `dad` can. `family-tree-tree.mjs`: the tree
      view renders four generations at 390×844 with no overlap (card rects don't intersect) and a
      screenshot to `SHOTS`. Smoke green.
- [ ] SPEC.md updated to "the app as it is"; KIT.md's row; this doc's Handover.
- [ ] Version `1.0.0`, `/deployquest`.
- [ ] **Owner:** install on the phone, browse to the grandparents' photos, show Dad the QR, approve
      him. Tick this box. Send the email to Jon if not yet sent (`EMAIL-DRAFT.md`).

**Done when:** the owner's step above is ticked.

---

## Parked (not in any session)

- Members editing people directly, with an edit history (`history/` per person); then adding
  photos (the photo-coach pattern, 1400px data URLs; Firebase Storage if that gets heavy).
- A member claiming the person in the tree that is them (links a `people/<id>` to a uid; would let
  "Show details" default to on for your own record).
- Jon as a member with edit rights, if he wants in.
- WikiTree people with no match in the 2006 tree (Jon's newer additions): show them, read live,
  as "Also on WikiTree" on the parent's page, still storing ids only. And an offer to Jon of the
  recovered tree as a GEDCOM (the email makes it; whether he wants it is his call).
- An ancestor or descendant *chart* for print (a PDF of the tree).
- A "This day" or "Born 100 years ago" note on the People tab.
- A one-off Node seed using the Admin SDK, if the owner ever adds a service account with Firestore
  write; until then the app's Import is the seed (no server code, no paid plan: KIT-PLAN.md).
- Revisit the trust-the-family approval if membership passes a few dozen.
- The 24-hour QR code can't be printed for a family gathering (KIT-PLAN Parked, Groups).

## Handover

Each session appends a short note: what shipped, what was skipped and why, what the next session
must know.

### After Session 1 (Fable, 2026-10-10)

**Done:** the folder (`0.1.0`, a `_template` placeholder with lilac/coral accents, the credit in
the footer, the icon and its PNGs), `SPEC.md`, this plan, `tools/cdx.mjs` + 8 tests,
`tools/inventory.mjs`, `EMAIL-DRAFT.md`, the owner's seven decisions (SPEC §8), CLAUDE.md's
layout line and DESIGN.md's ramp row. `node --test`: 50 pass. Smoke on `family-tree` green
(owner, stranger, signed out) with Playwright from the scratchpad. Nothing is on the launcher yet.

**Not done: the inventory and the sample.** This cloud environment's network policy denies every
archive.org host (`web.archive.org`, `archive.org`, `wayback.archive.org`: the proxy answers 403
to CONNECT), and `WebFetch` is denied the same way; `www.genealogy.com`, `www.wikitree.com` and
`linkpendium.com` fail too. So Session 1 step 4 (the counts, the URL conventions, the generator,
whether a GEDCOM was published) is Session 2's step 0, with the script written and tested on
synthetic rows. What the web search did show, from snippets only: the only inbound link to
familytree.inggs.com is a Genealogy.com South Africa board post signed **Jon Inggs** (Mildenhall
and Hinton ancestors; his address written with backslashes, `http:\familytree.inggs.com`), and
WikiTree's INGGS surname page lists profiles managed by Jon Inggs. Both are leads, not facts
about the site.

**Owner, before Session 2:**

1. ~~Allow the hosts.~~ Done 2026-10-10 (claude.ai/code → the cloud icon above the message box →
   the gear on the environment → Network access **Custom** → Allowed domains, with the package
   managers box ticked). **What it gave, checked the same hour:** `archive.org` answers (its
   availability API works: the home page has a 200 capture at `20100214230828` and its latest 200
   is `20100418173109`; `inggs.com` was captured too, nearest `20100222093706`); `web.archive.org`
   accepts the tunnel and then **resets the TLS handshake every time**, from curl, Node and
   Chromium, over several minutes; `www.wikitree.com` answers an empty `202` (a JavaScript
   challenge) to curl and to headless Chromium. So the CDX and the downloads, which only
   `web.archive.org` serves, could not run from this cloud address: the archive's side, not the
   environment's. Session 2 checks once more from a fresh session (its own egress address may
   differ) and otherwise runs Steps 0 to 2 on the laptop, as its opening says.
2. **Make the data repo.** GitHub → New repository → `family-tree-data`, **Private**, with a
   README. Nothing else. The session asks for push access to it when it starts (`add_repo`); if
   GitHub refuses, the error names the settings page to open.
3. **Send the email** (`EMAIL-DRAFT.md`), or wait for the recovered site to confirm the name.
   The build doesn't wait on a reply.

**How to start Session 2:** a new cloud session on the sidequests environment, model Opus 5.5,
with exactly: "Read `family-tree/PLAN.md` and do Session 2."

**Choices made where the brief was open** (all in SPEC §8 or §2):

- The app is three tabs with the tree view reached from a person, not a single scrolling Home:
  five screens is past DESIGN.md's four.
- The seed is the app's own Import of files under 20 MB, since there's no server code and the
  only service account the repo has can deploy rules, not write Firestore.
- "Born after 1926" became "born within the last 100 years, or no birth year", so it doesn't
  rot; Show details is per phone.
- Invites are keyed by the newcomer's uid (one invite per account), and the newcomer writes their
  own, with the friendship as proof that the QR was a member's. An invited friend's invite is
  written by the member instead. The rules cases in Session 3 spell out both.
- The tools' tests run under the repo's `node --test`, so they must stay synthetic.
- `cdx.mjs` treats a Wayback *revisit* row as carrying the status of the capture with the same
  digest, and keeps a URL that never returned 200 in the chosen list (as a gap) rather than
  dropping it.
- Coral is the second accent for the descendant side of the tree; if it reads as a warning next
  to amber (Rack It's experience), Session 4 may drop `--accent-2` and draw both sides neutral.
  Say so here if it does.

**Environment notes for Opus.** Node 22, Ruby 3.3 (the brief's `wayback-machine-downloader`
would run, but the tools are ours), Java absent (no rules emulator: the Action is the check),
Chromium at `/opt/pw-browsers`, Playwright by `npm i playwright-core` in the scratchpad then
`PLAYWRIGHT=<scratchpad>/node_modules/playwright-core/index.mjs`. `registry.npmjs.org` and
`raw.githubusercontent.com` are reachable; `*.github.io` isn't (the deploy skill's fallback proof
applies). `gh` is installed and proxy-configured. Pushes go over HTTPS. **Node's built-in fetch
ignores the proxy**: run any fetching script as `NODE_USE_ENV_PROXY=1 node …` (Node 22.21+), or it
times out with no proxy error. curl reads the proxy on its own. Headless Chromium needs
`proxy: { server: process.env.HTTPS_PROXY }` on the context to reach outside.

### After Session 2, part 1 (Opus 5.5, 2026-10-10)

**Which way it went: the laptop.** The opening check gave `000`, "Connection reset by peer", as in
Session 1 (the agent proxy logs `web.archive.org:443 — ws_closed_mid_exchange`); `archive.org`'s
availability API still answers, inconsistently (it found the 2010-02-14 home page once and
nothing for the April date the next time). `wayback.archive.org`, `timetravel.mementoweb.org` and
`arquivo.pt` are proxy 403s, not allowed hosts. The data repo is `kinggs/kinggs-family-tree-data`
and cloned fine; nothing was pushed to it, as there's nothing in it yet.

**Done:** `tools/mirror.mjs` + `mirror.test.mjs` (path mapping with Mac-safe case collisions,
never-overwrite via `.part` files, soft-404s, backoff, gaps rows, a stopped run's orphan file
recorded rather than refetched), `tools/strays.mjs` + `strays.test.mjs` (attributes, CSS `url()`,
`window.open('…')` in scripts and handlers, Jon's `http:\host` spelling), `inventory.mjs --host`
(other hosts into `data/hosts/<host>/`, `*.inggs.com` as `all.inggs.com`), and
`tools/recover.mjs`, the one laptop command. `node --test`: 58 pass, 16 of them the family-tree tools' (8 new). An
end-to-end run of `recover.mjs` against a fake archive (a `--import` that replaces `fetch`,
invented pages, in the scratchpad) produced the inventory, the checks, the mirror, a stray found
and fetched, a never-captured row and a 401 gap, and a second run did nothing.

**Not done, waiting on the laptop run:** Step 0's printed lines, the April check, the GEDCOM
question and the hand sample (**The site's pattern**); Step 3 (WikiTree); Step 4 (the report).
The finishing session reads `data/inventory.md`, `data/hosts/*/inventory.md`, `data/checks/`,
`data/manifest.json` and the mirror, fills in **Findings** and **The site's pattern**, writes
`data/report.md` (counts from `mirror.mjs`'s `summarise()`, which `recover.mjs` prints last),
and pushes the data repo and this doc. If `data/checks/` shows April 2010 is the intact site and
later, set `TARGET` and re-mirror once, before anything reads the mirror: since it never
overwrites, that means deleting `data/mirror/` and `manifest.json`, then `inventory.mjs
--offline`, `mirror.mjs` and `strays.mjs` (cloud-side, only if the archive answers; else the
laptop again). Say so in Findings.

**Owner's choice, after part 1:** finish on a desktop session (see "On a desktop session" under
Session 2's opening), which needs neither the Action below nor a cloud session afterwards.

**An option that would skip the laptop:** a GitHub Action in the private data repo (private logs,
its own `GITHUB_TOKEN` to push) that checks out `kinggs/sidequests` and runs `recover.mjs` with
`--data .`, then commits. GitHub's runners are not this proxy's address, so the archive likely
answers them. This session tried to push a one-step probe workflow to the data repo and the
session's permission check refused it (adding CI to a shared repo); it wasn't pushed and nothing
was left behind. If the owner says yes to it, the next session can add it.

