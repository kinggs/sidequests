// Session 10 step 5: My QR wears the app's look: a frame in its accent and its icon as a badge on
// the frame. The code itself is untouched: for every app with Connect, the framed code's SVG is the
// plain code's, byte for byte, and it decodes to its link with zbar (zbarimg, from the screenshot)
// and with jsQR in the page at 600px and at 160px (a phone held well back).
// An icon in the middle and round dots were tried first and dropped: the decoders missed some codes,
// and which ones changed with the code (KIT-PLAN Session 10 step 5). The real test is still two real
// phones at the pool hall.
//
//   node shared/proofs/qr-look.mjs        needs zbarimg (zbar-tools) and network for jsQR's CDN copy
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { ok, summary, serve, browser, tab } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const APPS = ["rack-it", "zombie-dice", "around-the-clock", "bloc-11", "photo-coach", "sessions-loyalty"];
let zbar = true;
try { execFileSync("zbarimg", ["--version"]); } catch { zbar = false; console.log("SKIP zbar: no zbarimg"); }

for (const app of APPS){
  const p = await tab(ctx, `${srv.base}/${app}/?mock&as=qrtest`, app);
  const shown = {};
  for (const plain of [false, true]){
    await p.evaluate(async plain => { const { connect } = await import("../shared/connect.js"); window.__close = connect.showQR({ app: location.pathname.split("/")[1], ...(plain ? { icon: false } : {}) }); }, plain);
    await p.locator(".cn-qr svg").waitFor({ timeout: 5000 });
    await p.waitForTimeout(300);
    const link = await p.locator(".cn-ov").getAttribute("data-link");
    const look = await p.evaluate(() => { const q = document.querySelector(".cn-qr"), bd = document.querySelector(".cn-badge");
      return { look: q.classList.contains("cn-look"), frame: q.style.getPropertyValue("--frame"), badge: !!bd && !bd.hidden && bd.naturalWidth > 0, svg: q.innerHTML, inner: !!q.querySelector("image") }; });
    shown[plain ? "plain" : "look"] = look.svg;
    const label = `${app}${plain ? " (plain)" : ""}`;
    if (!plain) ok(look.look && look.badge && !!look.frame && !look.inner, `${label}: a frame in ${look.frame}, the icon as a badge, nothing over the code`);
    else ok(!look.look && !look.badge, `${label}: no frame, no badge`);
    if (zbar){
      const file = path.join(os.tmpdir(), `qr-${app}-${plain ? "plain" : "look"}.png`);
      await p.locator(".cn-qr").screenshot({ path: file });
      let out = "";
      try { out = execFileSync("zbarimg", ["--raw", "-q", file]).toString().trim(); } catch {}
      ok(out === link, `${label}: zbar reads the screen: ${out === link ? "the link" : JSON.stringify(out).slice(0, 60)}`);
    }
    const reads = await p.evaluate(async () => {
      if (!window.jsQR) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"; s.onload = res; s.onerror = rej; document.head.append(s); });
      const svg = document.querySelector(".cn-qr svg").outerHTML;
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await img.decode();
      const out = {};
      for (const size of [600, 160]){
        const c = document.createElement("canvas"); c.width = c.height = size + 40;
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 20, 20, size, size);
        const r = window.jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        out[size] = r ? r.data : null;
      }
      return out;
    });
    ok(reads[600] === link && reads[160] === link, `${label}: jsQR reads it at 600px and 160px`);
    if (!plain) await p.locator(".cn-ov").screenshot({ path: path.join(os.tmpdir(), `qr-${app}-screen.png`) });
    await p.evaluate(() => window.__close && window.__close());
  }
  ok(shown.look === shown.plain, `${app}: the framed code is the plain code, byte for byte`);
  await p.close();
}
summary();
await b.close(); srv.close();
