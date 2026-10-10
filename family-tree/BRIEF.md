# Inggs Family Tree Revival — Side Quest Brief

Oct 10, 2026 · Kenny Inggs

> **How to start a session:** "Read `family-tree/BRIEF.md` and do Session 1." Once `PLAN.md` exists, start with "Read `family-tree/PLAN.md` and do Session N." instead. Do not create the app before Session 1 says so.

## Purpose & background

Recover the Inggs family tree that John Inggs researched and published at familytree.inggs.com, before it is lost, and give the family a place to keep growing it.

John's site is no longer live. The only surviving copy is in the Internet Archive's Wayback Machine. It held the genealogy (people, relationships, dates) and the oldest known family photographs. Later captures of the site return 401 errors, so the February 2010 snapshot is the last known good version.

This is a side quest: a scoped, agent-driven build that Kenny steers. The agent should treat John's work as the canonical source and preserve his authorship throughout.

## Source

Start from the last known good snapshot: <https://web.archive.org/web/20100214230828/http://familytree.inggs.com/> (captured 14 Feb 2010). Captures after this date return 401s.

What we know about the original site:

- Original domain: familytree.inggs.com
- Appears to be static HTML pages. There may have been a backend generating them, but it is gone, so only the rendered pages are recoverable.
- Content: a full family tree / genealogy plus family photographs going back as far as John could find.
- Not yet verified from this chat (archive.org is blocked from here): the generator used, page count, image count, and whether a GEDCOM file was ever published. Step 1 of the build is to establish these.

## Goals & non-goals

Goals, in priority order:

1. Recover everything the Wayback Machine holds for familytree.inggs.com: every page, image and linked file, with the capture timestamp for each.
2. Turn the recovered pages into structured, portable data: a GEDCOM file plus a JSON representation, with every person and photo traceable to the source page it came from.
3. Give the family a private site where they can browse the tree and photos, and add or correct information.
4. Credit John Inggs visibly as the original researcher and author.

Non-goals for this side quest:

- Not re-researching the genealogy or verifying John's findings against external records.
- Not building a public website. Family-only access from day one.
- Not committing to a genealogy platform (WikiTree, Gramps, Ancestry). Keeping GEDCOM as the interchange format leaves that door open.

## Phase 1 — Recovery

Output: a local mirror of the site as it stood in Feb 2010, plus an inventory of every URL ever captured.

1. Inventory with the CDX API. Query `https://web.archive.org/cdx/search/cdx?url=familytree.inggs.com/*&output=json&fl=timestamp,original,statuscode,mimetype,digest` and save the full result. This lists every captured URL, when, and with what status, before downloading anything.
2. Analyse the inventory. Count pages vs images, note the date range, find which captures are 200 vs 401/404, and spot the URL conventions (e.g. `/people/`, `/photos/`, `surnames.htm`). Report this back before Phase 2 starts.
3. Pick the best capture per URL. Prefer the capture closest to 14 Feb 2010 with status 200; fall back to the nearest earlier 200. Use the `digest` field to skip duplicate content.
4. Download. Fetch raw originals using the `id_` flag (`https://web.archive.org/web/<timestamp>id_/<url>`) so pages come back without the Wayback toolbar and rewritten links. Keep the original path structure on disk.
5. Crawl for strays. Parse every downloaded HTML page for links and image references; any target not in the inventory gets a second CDX lookup. Repeat until nothing new appears.
6. Record provenance. For every file saved, log the original URL, capture timestamp and Wayback URL in a manifest (JSON or CSV). This is what makes attribution and later checking possible.

Practical constraints:

- Rate limit yourself: roughly 1 request per second, with retries and exponential backoff on 429 and 5xx. Archive.org throttles aggressive clients.
- Expect some images to be missing. The Wayback Machine often captured pages without all their assets. Log gaps rather than failing.
- Keep the raw mirror immutable. All later processing reads from it; nothing writes into it.
- The existing tool `wayback-machine-downloader` (Ruby) is a reasonable alternative to hand-rolled scripts for steps 3 and 4, but the inventory and manifest still need to be ours.
- Everything here is read-only against archive.org and legitimate under their terms; no scraping tricks needed.

## Phase 2 — Structure

Output: `people.json`, `photos.json` and `inggs.ged`, every record carrying the source page it came from.

1. Sample first. Read five or six person pages and one index page by hand and write down the HTML pattern: where the name, birth/death dates, spouse, parents and children sit, and how photos are linked.
2. Parse into a people table: id, name, sex, birth date/place, death date/place, parents, spouses, children, notes, source URL and capture timestamp.
3. Parse photos into a photo table: filename, caption, people shown, source page, and whether the image file was actually recovered.
4. Validate: every parent/spouse/child reference resolves to a person; flag the ones that do not rather than dropping them.
5. Emit GEDCOM 5.5.1 (the format every genealogy tool imports) plus the JSON the site will load. Keep a `SOUR` record in the GEDCOM naming John Inggs as the original compiler.
6. Produce a one-page recovery report: people recovered, photos recovered vs missing, unresolved links, pages that failed to parse.

Parsing rules: never guess a missing date or relationship; leave it blank and log it. Keep John's own wording for notes and captions verbatim.

Tooling: Node scripts (the monorepo is plain Node, `node --test`), e.g. `cheerio` for HTML parsing. These scripts live in the quest folder but are run locally, not shipped.

## Phase 3 — Family site, as a side quest

Build it as a standard quest in `kinggs/sidequests`: `family-tree/index.html` on the shared kit, deployed to `https://kinggs.github.io/sidequests/family-tree/`, data in Firestore under `sidequests/family-tree/`.

Follow the repo's CLAUDE.md rules as-is: one `index.html`, no framework or build step, `shared/cloud.js` for all Firebase, PWA with icons, dark mobile-first design per `shared/DESIGN.md`, `APP_VERSION` and `sw.js` CACHE bumped together, JSON export/import, deploy by push to `main` via `/deployquest`. Start with `/sidequest` and the `_template`.

Two deliberate departures, because this quest holds personal data and a public repo:

- Not on the open rule. Write a dedicated rules block in `shared/firestore.rules` (the sessions-loyalty pattern): reads and writes only for signed-in users whose uid is in `sidequests/family-tree/members`. Kenny is the first member; after that any member can approve a newcomer (see Access & invites).
- No family data in git. The raw mirror, parsed JSON and GEDCOM stay out of the public repo (gitignored). The site loads everything from Firestore; the recovery scripts seed Firestore once via a small admin page or a one-off Node script.

MVP (one session): sign-in gate, a searchable people list, a person page (dates, parents, spouse, children, photos, John's notes, a "source" link to the Wayback page), a simple ancestor/descendant view, and a photo gallery. Everything read-only except a "Suggest a correction" note on each person, saved to `suggestions/` for Kenny to review.

Interface: aim high on the visuals — this is the one quest the whole family will see. Pick an unused accent (coral or lilac), lean on typography and generous photo treatment, and make the tree view feel like something, not a table. Load the `frontend-design` skill before building.

Next iterations: members editing people directly with an edit history, adding photos (photo-coach pattern: 1400px data URLs in Firestore; Firebase Storage if that gets heavy), invitations by QR via `shared/connect.js`.

## Access & invites

Membership is controlled by the family, not just by Kenny: any existing member can approve a newcomer.

Flow:

1. A member taps "Invite" and enters the person's name and the Gmail address they will sign in with. This creates a record in `invites/` (name, email, invited-by, date, status: pending).
2. The newcomer signs in with Google. If their email matches a pending invite, they see "Waiting for a family member to confirm it's you"; nothing else loads.
3. Every member sees the pending invite in an "Invites" section: "Kenny invited Dad (dad@gmail.com). Is this them?" with Approve / Decline. One approval from any member (other than the inviter) adds the uid to `members/` and the newcomer is in. The approver is recorded.
4. Members can see the full member list, who invited whom, and who approved. Kenny can remove a member.

For a first-time user on a phone (Kenny's father), the invite is a link or QR that opens the app and lands straight on Google sign-in; no app store, no password.

Firestore rules: `invites/` writable by members; `members/` writable only through an approval by a member who is not the inviter; everything else readable only by members. Known limitation, accepted for now: this trusts the family to recognise each other, and a member could approve someone they shouldn't. Revisit if the family grows beyond a few dozen.

## Attribution & engaging John

John Inggs is credited as the original researcher on the site's home page, on every person page ("Researched by John Inggs, familytree.inggs.com, 2010"), in the GEDCOM `SOUR` record, and in `SPEC.md`.

Kenny will email John separately, early, to tell him about the revival, ask for his blessing, and ask whether he still has the original data (a GEDCOM or database export would replace most of Phase 2). The build does not wait on a reply. If John wants in, he becomes a member with edit rights.

- [ ] Kenny: draft and send the email to John (Claude can draft it on request).

## Privacy guardrails

The site concerns living relatives who may not know their details were ever online. Rules for the build:

- Private by default: Google sign-in plus a Firestore member allowlist. No anonymous reads, ever, even for the tree shape.
- Nothing personal in the public repo: no names, dates, photos or GEDCOM committed; no screenshots with real data in `SPEC.md` or design notes. Use `?mock` with invented people for development.
- Living people shown with less: for anyone without a death date and born after 1926, show name and relationships only; hide exact birth dates and places behind a per-person "show details" that members can toggle for themselves.
- Opt-out honoured: any family member can ask for their record to be minimised or removed; `suggestions/` is the channel, Kenny acts on it.
- The recovered raw mirror stays on Kenny's machine and in a private backup, not in Firestore and not in git.
- Export is member-only and logged, so the data does not quietly leave the site.

## Plan of attack

Run this as a multi-session quest with a working doc, the rack-it `V3-PLAN.md` pattern: `family-tree/PLAN.md` with Read first / Ground rules / Session N / Parked / Handover, and every session opened with "Read `family-tree/PLAN.md` and do Session N."

One planning session on Fable, then implementation on Opus 5.5, since Fable usage is near its limit.

**Session 1 — Fable (planning + inventory, no site yet)**

1. Create `family-tree/` from `/sidequest` steps 1–2 only (folder, placeholders, `.gitignore` for `mirror/`, `data/`).
2. Write `SPEC.md` from this brief (purpose, who uses it, screens, data model, out of scope, Decisions).
3. Write `PLAN.md` with Sessions 2–4 fully specified so Opus can run them without re-planning.
4. Run the CDX inventory (Phase 1 step 1–2) and the HTML sampling (Phase 2 step 1); record the page patterns and counts in `PLAN.md`. This is the one bit of real research that benefits from Fable.
5. Handover note. Stop.

**Session 2 — Opus 5.5:** recovery scripts, full mirror, manifest, recovery report.

**Session 3 — Opus 5.5:** parser, `people.json`, `photos.json`, GEDCOM, Firestore seed, member rules, deploy a sign-in-gated shell with the people list live.

**Session 4 — Opus 5.5:** the interface: person page, tree view, gallery, suggestions, icon, launcher tile, `/deployquest`. MVP done when Kenny can sign in on his phone and browse to his grandparents' photos.

Decisions still needed from Kenny:

- [x] Surname confirmed: Inggs. App id `family-tree`.
- [ ] Confirm "no family data in the public repo" (the alternative is making a private quests repo, which breaks the Pages setup).
- [x] Living-person rule: go with the default above (born after 1926, no death date → details hidden by default).
- [x] Members: Kenny only at launch, with invites built in from day one. First invitee is Kenny's father, who is not technical: the invite must work from a phone (QR or a link) and viewing must need nothing beyond Google sign-in. Second: John himself via his University of Cape Town address if it still works; otherwise ask the wider family who has a current contact for him.

Parked for later: members claiming their own profile and editing it directly.
