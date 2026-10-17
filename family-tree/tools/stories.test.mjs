// node --test from the repo root. An invented page in the style of Jon's hand-made ones: nothing
// here is from the real site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decode1252, htmlToMarkdown, story } from "./stories.mjs";

test("decode1252 reads windows-1252's quotes and dashes, and leaves Latin-1 alone, on every Node", () => {
  assert.equal(decode1252(Buffer.from("\x93Caf\xe9\x94 \x96 \x85 \x80", "latin1")), "“Café” – … €");
  assert.equal(decode1252("already a string"), "already a string");
});

const PAGE = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2//EN">
<HTML><HEADER><TITLE>Albert Fenwick and the first bicycle</TITLE></HEADER>
<BODY BGCOLOR="#C0C0C0"><!-- a note to himself -->
<H1 ALIGN=CENTER>The first <B>bicycle</B> in town</H1>
<P><IMG SRC="bike.jpg" ALT="[The bicycle]" ALIGN=LEFT>Albert Quill Fenwick (1850-1920) bought it in 1890 from a
shop in <I>Port Example</I>. His wife, <B>Clara Beamish </B>, would not ride it.
<P>He wrote to his son:<BR>
<DL><DT><DD><I>Dear Frank, the machine is a marvel.</I></DD></DL>
<TABLE><TR><TD><IMG SRC="shop.jpg"></TD></TR><TR><TD><I>The shop, about 1890.</I></TD></TR></TABLE>
<TABLE BORDER><TR><TD COLSPAN=2>Prices in 1890</TD><TD></TD></TR>
<TR><TD>Item</TD><TD>Cost</TD><TD>Notes</TD></TR>
<TR><TD>Bicycle</TD><TD>&pound;12 | 6s</TD><TD>&quot;dear&quot;</TD></TR></TABLE>
<P>See <A HREF="photos.htm">the photographs</A>, <A HREF="http://example.org/x">a link elsewhere</A>
or <A HREF="MAILTO:someone@example.org">write to me</A>.
<HR>
Caf\xe9 \x93Example\x94 &amp; sons.
</BODY></HTML>`;
const bytes = Buffer.from(PAGE, "latin1");

test("htmlToMarkdown keeps the words, the emphasis, the quotes, the images and a table of words", () => {
  const md = htmlToMarkdown(bytes, {
    link: h => /^mailto:/i.test(h) ? null : h,
    image: (src, alt) => ({ path: `../mirror/${src}`, caption: alt }),
  });
  assert.equal(md, [
    "## The first **bicycle** in town",
    "![The bicycle](../mirror/bike.jpg)",
    "Albert Quill Fenwick (1850-1920) bought it in 1890 from a shop in *Port Example*. His wife, **Clara Beamish** , would not ride it.",
    "He wrote to his son:",
    "> *Dear Frank, the machine is a marvel.*",
    "![](../mirror/shop.jpg)",
    "*The shop, about 1890.*",
    "| Prices in 1890 |  |  |\n| --- | --- | --- |\n| Item | Cost | Notes |\n| Bicycle | £12 \\| 6s | \"dear\" |",
    "See [the photographs](photos.htm), [a link elsewhere](http://example.org/x) or write to me.",
    "---",
    "Café “Example” & sons.",
  ].join("\n\n") + "\n");
});

test("a table that lays out paragraphs becomes its cells in order", () => {
  const md = htmlToMarkdown(`<TABLE><TR><TD>One line<BR>and another</TD><TD>Short</TD></TR><TR><TD>${"Long words here. ".repeat(12)}</TD><TD>x</TD></TR></TABLE>`);
  assert.ok(!md.includes("| --- |"));
  assert.ok(md.startsWith("One line  \nand another\n\nShort\n\nLong words here."));
});

test("story heads the Markdown with the title and source, and links images, stories and people", () => {
  const people = [
    { id: "albert-quill-fenwick-1850", given: "Albert Quill", surname: "FENWICK", birth: { year: 1850 } },
    { id: "clara-beamish-1852", given: "Clara", surname: "BEAMISH", birth: { year: 1852 } },
    { id: "frank-fenwick-1878", given: "Frank", surname: "FENWICK", birth: { year: 1878 } },
  ];
  const s = story({ file: "bike%20story.htm", html: bytes, source: { url: "u", wayback: "https://web.archive.org/web/2017/u", captured: Date.UTC(2017, 6, 2) } }, {
    people,
    photoOf: f => ({ "bike.jpg": "bike", "shop.jpg": "shop" })[f] || null,
    storyOf: f => f === "photos.htm" ? "photos" : null,
    viewOf: () => "https://web.archive.org/web/2017/other",
  });
  assert.equal(s.id, "bike-story");
  assert.ok(s.markdown.startsWith("# Albert Fenwick and the first bicycle\n\n*From Jon Inggs's pages · [the Wayback Machine's copy](https://web.archive.org/web/2017/u) · captured 2 July 2017*\n\n## The first"));
  assert.ok(s.markdown.includes("[the photographs](photos.md)"));
  assert.deepEqual(s.row, { id: "bike-story", title: "Albert Fenwick and the first bicycle", file: "stories/bike-story.md", source: { url: "u", wayback: "https://web.archive.org/web/2017/u", captured: Date.UTC(2017, 6, 2) }, images: ["bike", "shop"], people: ["albert-quill-fenwick-1850", "clara-beamish-1852"] });
  assert.deepEqual(s.found.unmatched, []);
});

test("a page with no title takes Jon's link to it", () => {
  const s = story({ file: "list.htm", html: "<HTML><BODY><P>Names</P></BODY></HTML>", source: null }, { people: [], linkTitle: "The roll of honour" });
  assert.equal(s.row.title, "The roll of honour");
  assert.ok(s.markdown.includes("captured unknown"));
});
