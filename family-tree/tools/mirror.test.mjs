// node --test from the repo root. Synthetic inputs only: nothing here is from the real site.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { claimPath, isSoft404, localPath, mirrorAll, politeGet, summarise } from "./mirror.mjs";

const SITE = "http://familytree.inggs.com";
const html = s => Buffer.from(`<html><head><title>Example family</title></head><body>${s}</body></html>`);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]);

test("localPath keeps the site's paths, makes folders index.html and folds the query into the name", () => {
  assert.equal(localPath(`${SITE}/people/p12.htm`), "people/p12.htm");
  assert.equal(localPath(`${SITE}/`), "index.html");
  assert.equal(localPath("https://www.familytree.inggs.com"), "index.html");
  assert.equal(localPath(`${SITE}/index.htm`), "index.html");
  assert.equal(localPath(`${SITE}/photos/`), "photos/index.html");
  assert.equal(localPath(`${SITE}/p.php?id=3&x=a b`), "p.php%3Fid%3D3%26x%3Da%2520b");
  assert.equal(localPath(`${SITE}/a/../../etc/passwd`), "etc/passwd");
  assert.equal(localPath(`${SITE}/odd:name|x.htm`), "odd%3Aname%7Cx.htm");
  assert.equal(localPath("http://inggs.com/pics/a.jpg"), "_hosts/inggs.com/pics/a.jpg");
});

test("claimPath gives a second spelling that differs only in case its own file", () => {
  const taken = new Map();
  assert.equal(claimPath("people/P1.htm", "k/P1", taken), "people/P1.htm");
  assert.equal(claimPath("people/p1.htm", "k/p1", taken), "people/p1~2.htm");
  assert.equal(claimPath("people/P1.htm", "k/P1", taken), "people/P1.htm");   // the owner again: same file
  assert.equal(claimPath("README", "a", taken), "README");
  assert.equal(claimPath("readme", "b", taken), "readme~2");
});

test("isSoft404 spots the Wayback Machine's own pages and HTML on an image URL", () => {
  assert.equal(isSoft404(JPEG, { url: `${SITE}/a.jpg`, mime: "image/jpeg", contentType: "image/jpeg" }), false);
  assert.equal(isSoft404(html("Not here"), { url: `${SITE}/a.jpg`, mime: "image/jpeg" }), true);
  assert.equal(isSoft404(Buffer.from("<!DOCTYPE html><p>x</p>"), { url: `${SITE}/a.gif` }), true);
  assert.equal(isSoft404(html("<p>Born 1900 in a town.</p>"), { url: `${SITE}/p1.htm`, mime: "text/html" }), false);
  assert.equal(isSoft404(Buffer.from("<html><title>Wayback Machine</title><p>Hrm.</p></html>"), { url: `${SITE}/p1.htm` }), true);
  assert.equal(isSoft404(html("The Wayback Machine has not archived that URL."), { url: `${SITE}/p1.htm` }), true);
  assert.equal(isSoft404(html("I found this on the Wayback Machine years ago."), { url: `${SITE}/p1.htm` }), false);
});

test("politeGet backs off on 429 and 5xx, and gives up with the last answer", async () => {
  const waits = [];
  let n = 0;
  const answers = [429, 503, 200];
  const fake = async () => ({ status: answers[n++], url: "u", headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(1) });
  const got = await politeGet("u", { fetchImpl: fake, wait: ms => waits.push(ms) });
  assert.equal(got.status, 200);
  assert.deepEqual(waits, [2000, 4000]);
  const down = await politeGet("u", { fetchImpl: async () => { throw new Error("ECONNRESET"); }, wait: () => {}, tries: 3 });
  assert.deepEqual(down, { status: "error", error: "ECONNRESET" });
});

function fakeArchive(bodies, calls){
  return async url => {
    calls.push(url);
    const original = url.replace(/^.*?id_\//, "");
    const b = bodies[original];
    if (b === undefined) return { status: 404, url, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) };
    if (typeof b === "number") return { status: b, url, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) };
    const type = original.endsWith(".jpg") && b === JPEG ? "image/jpeg" : "text/html";
    return { status: 200, url, headers: new Headers({ "content-type": type }), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
  };
}
const item = (p, status = "200", mime = "text/html") => ({ key: "familytree.inggs.com" + p, url: SITE + p, timestamp: "20100214230828", status, mime });

test("mirrorAll keeps 200s, logs gaps and soft-404s, never overwrites, and retries only failures", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-mirror-"));
  try {
    const list = [item("/"), item("/people/p1.htm"), item("/photos/a.jpg", "200", "image/jpeg"), item("/photos/b.jpg", "200", "image/jpeg"),
      item("/secret/p2.htm", "401"), item("/people/p3.htm")];
    const bodies = { [`${SITE}/`]: html("home"), [`${SITE}/people/p1.htm`]: html("one"), [`${SITE}/photos/a.jpg`]: JPEG,
      [`${SITE}/photos/b.jpg`]: html("Wayback Machine"), [`${SITE}/people/p3.htm`]: 404 };
    const calls = [];
    const opts = { dataDir, fetchImpl: fakeArchive(bodies, calls), wait: () => {}, log: () => {} };
    const first = await mirrorAll(list, opts);
    assert.deepEqual(first.counts, { kept: 3, skipped: 0, gaps: 1, soft404: 1, failed: 1 });
    assert.equal(calls.length, 5);                                   // the 401 is never fetched
    const m = JSON.parse(fs.readFileSync(path.join(dataDir, "manifest.json"), "utf8"));
    assert.equal(m.rows.length, list.length);                        // one row per URL
    const row = u => m.rows.find(r => r.url === SITE + u);
    assert.equal(row("/").path, "index.html");
    assert.equal(row("/photos/a.jpg").bytes, JPEG.length);
    assert.match(row("/photos/a.jpg").sha256, /^[0-9a-f]{64}$/);
    assert.equal(row("/photos/a.jpg").raw, `https://web.archive.org/web/20100214230828id_/${SITE}/photos/a.jpg`);
    assert.equal(row("/photos/b.jpg").status, "soft-404");
    assert.equal(row("/photos/b.jpg").path, null);
    assert.equal(row("/secret/p2.htm").status, "401");
    assert.equal(row("/secret/p2.htm").path, null);
    assert.equal(row("/people/p3.htm").status, "fetch-404");
    assert.equal(fs.readFileSync(path.join(dataDir, "mirror", "people/p1.htm"), "utf8").includes("one"), true);
    assert.equal(fs.readdirSync(path.join(dataDir, "mirror", "people")).some(f => f.endsWith(".part")), false);

    // Second run: the archive now answers differently; nothing kept changes, only the failure is retried.
    bodies[`${SITE}/people/p1.htm`] = html("CHANGED");
    bodies[`${SITE}/people/p3.htm`] = html("three");
    calls.length = 0;
    const second = await mirrorAll(list, opts);
    assert.deepEqual(calls, [`https://web.archive.org/web/20100214230828id_/${SITE}/people/p3.htm`]);
    assert.equal(second.counts.kept, 1);
    assert.equal(fs.readFileSync(path.join(dataDir, "mirror", "people/p1.htm"), "utf8").includes("one"), true);

    // A file on disk with no manifest row (a stopped run) is recorded, not fetched.
    fs.writeFileSync(path.join(dataDir, "mirror", "late.htm"), html("late"));
    calls.length = 0;
    await mirrorAll([item("/late.htm")], opts);
    assert.equal(calls.length, 0);
    const late = JSON.parse(fs.readFileSync(path.join(dataDir, "manifest.json"), "utf8")).rows.find(r => r.url === SITE + "/late.htm");
    assert.equal(late.path, "late.htm");

    assert.match(summarise(second.manifest), /^Manifest: 6 URLs; 4 files kept/);
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
});
