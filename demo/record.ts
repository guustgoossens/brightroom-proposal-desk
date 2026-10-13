// Records the narrated demo: drives the real app (live Convex + Claude + Jev runs) in Chrome,
// narrates with macOS `say`, and muxes with ffmpeg. Run: bun demo/record.ts
// Needs: the app on :5173, `bunx convex dev` running, Google Chrome installed, ffmpeg.
import { chromium, type Page } from "playwright-core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { $ } from "bun";

const APP = "http://localhost:5173";
const W = 1440, H = 900;
const VOICE = process.env.VOICE ?? "Samantha";
const RATE = process.env.RATE ?? "172";
const DIR = new URL(".", import.meta.url).pathname;
mkdirSync(`${DIR}audio`, { recursive: true });

// ---------------------------------------------------------------- helpers
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function glideClick(page: Page, selector: string, nth = 0) {
  const el = page.locator(selector).nth(nth);
  await el.scrollIntoViewIfNeeded();
  const box = (await el.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
  await sleep(350);
  await el.click();
}
const smoothTo = (page: Page, selector: string, block: "start" | "center" = "center") =>
  page.locator(selector).first().evaluate((e, b) => e.scrollIntoView({ behavior: "smooth", block: b as ScrollLogicalPosition }), block);
const top = (page: Page) => page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
const rail = (label: string) => `.rail__row:has(.rail__label:text-is("${label}"))`;
const play = (label: string) => `${rail(label)} .rail__play`;

async function waitRun(page: Page) {
  await page.waitForFunction(() => (document.querySelector(".runhead__meta")?.textContent ?? "").includes("running"), null, { timeout: 12000 }).catch(() => {});
  await page.waitForFunction(() => {
    const m = document.querySelector(".runhead__meta")?.textContent ?? "";
    return m !== "" && !m.includes("running");
  }, null, { timeout: 120000 });
  await sleep(600);
}

// ---------------------------------------------------------------- pre-flight: real numbers for the narration
const browser = await chromium.launch({ channel: "chrome", headless: true });
const probe = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
await probe.goto(APP);
await probe.locator(".topbar__tab", { hasText: "Evaluation" }).click();
await probe.waitForSelector(".tile");
const tiles = await probe.$$eval(".tile", (ts) => ts.map((t) => ({ v: t.querySelector("dd")!.textContent!, s: t.querySelector("small")!.textContent! })));
await probe.close();
const num = (s: string) => Number(s.match(/(\d+) of (\d+)/)!.slice(1, 3)[0]);
const tot = (s: string) => Number(s.match(/(\d+) of (\d+)/)!.slice(1, 3)[1]);
const pipePass = num(tiles[0].s), pipeTot = tot(tiles[0].s), basePass = num(tiles[1].s), baseTot = tot(tiles[1].s);
console.log("preflight:", tiles, { pipePass, pipeTot, basePass, baseTot });

// ---------------------------------------------------------------- scenes
interface Scene { id: string; text: string; pre?: (p: Page) => Promise<void>; run: (p: Page) => Promise<void> }

const scenes: Scene[] = [
  {
    id: "s0-title",
    text: "This is the BrightRoom proposal desk, our solution for case two: turning a client enquiry into a feasible draft proposal, or into the questions needed before one can be made.",
    run: async (p) => { await sleep(300); },
  },
  {
    id: "s1-problem",
    text: "The user is a BrightRoom salesperson. Today they clarify the brief, check the catalogue, do the sums and write the proposal by hand. It repeats, but every enquiry has different constraints, and a persuasive proposal is only useful if the package actually fits. Our value target is a first proposal in seconds instead of minutes, with correct totals, and a clear warning before an infeasible proposal can go out.",
    run: async (p) => { await glideClick(p, `${rail("Q1")} .rail__item`); await sleep(1500); await smoothTo(p, ".deck", "start"); },
  },
  {
    id: "s2-solution",
    text: "We built a small application with three lanes. Claude Sonnet sub-agents read the enquiry, write the draft and audit it. Jev, a typed decision model from TypeSafe, gives fast probabilistic judgments, like whether the enquiry is complete. And plain code does everything that must be exact: pricing, constraints, alternatives and the total check. The language model never computes money. A human stays in the chain: nothing is sent or booked.",
    run: async (p) => { await top(p); await sleep(1800); await smoothTo(p, ".hood", "start"); await sleep(2500); await top(p); },
  },
  {
    id: "s3a-routine",
    text: "First a routine case. Q3: ten people, four hours, wheelchair access, coffee and a projector, six hundred euros. I press play and run it live. Claude extracts the brief, Jev triages in about half a second, and the code prices it.",
    run: async (p) => { await glideClick(p, play("Q3")); await sleep(500); },
  },
  {
    id: "s3b-routine",
    pre: waitRun,
    text: "The banner says ready. Only the Loft is wheelchair accessible, so the package is the Loft, coffee for ten and a projector: five hundred thirty-five euros, recomputed independently by code. The draft email beside it is a proposal for the salesperson to approve, it states that availability is unconfirmed, and a code check and an LLM auditor have both passed it.",
    run: async (p) => { await smoothTo(p, ".deck", "start"); await sleep(2500); await smoothTo(p, ".mail", "center"); await sleep(1500); },
  },
  {
    id: "s4a-hard",
    text: "Now a difficult case. Q2: twenty people, coffee and lunch both required, a budget of eight hundred fifty euros. Run it live.",
    run: async (p) => { await top(p); await glideClick(p, play("Q2")); await sleep(500); },
  },
  {
    id: "s4b-hard",
    pre: waitRun,
    text: "The banner turns red before anyone reads the draft: the package costs nine hundred forty euros, ninety over budget. The system does not quietly drop something to make the numbers work. It shows alternatives, each with its trade-off: keep everything and cut to sixteen people, or drop the coffee, or drop the lunch. Jev recommends one and shows its confidence, but the salesperson decides.",
    run: async (p) => { await top(p); await sleep(1500); await smoothTo(p, ".alts", "center"); await sleep(3500); },
  },
  {
    id: "s4c-approve",
    text: "Approval is disabled until an alternative is chosen. I choose one, and only then can the draft be approved. Approval only marks it locally. Nothing is sent.",
    run: async (p) => {
      await glideClick(p, ".alt button:has-text('Choose')", 0); await sleep(1200);
      await smoothTo(p, ".draft-actions, .mail", "center").catch(() => {});
      await glideClick(p, "button:has-text('Approve draft')"); await sleep(1500);
    },
  },
  {
    id: "s4d-jev",
    text: "Under the hood, this tab puts Jev next to Claude: triage probabilities, which services are hard requirements, and where the two agree or differ. A difference is a signal for the salesperson to look closer.",
    run: async (p) => { await smoothTo(p, ".hood", "start"); await sleep(600); await glideClick(p, ".tab:has-text('Jev vs LLM')"); await sleep(4500); },
  },
  {
    id: "s5a-missing",
    text: "Missing information. Q4 only says: can you organise a team workshop next month, send me your best offer.",
    run: async (p) => { await top(p); await glideClick(p, play("Q4")); await sleep(500); },
  },
  {
    id: "s5b-missing",
    pre: waitRun,
    text: "The system does not guess a headcount. It asks what it needs, and the draft contains questions only, with no prices. Q5 asks for thirty people for six hours and to confirm today. That is infeasible on both capacity and duration, Jev flags the commitment pressure at ninety-six percent, and the draft says plainly that nothing can be confirmed.",
    run: async (p) => { await top(p); await sleep(3500); await glideClick(p, `${rail("Q5")} .rail__item`); await sleep(4000); },
  },
  {
    id: "s6-tests",
    text: `We ran eighteen cases: the five from the brief plus thirteen variations, including exact capacity boundaries, a discount demand, a request to book a date, and a prompt-injection attempt. The pipeline passes ${pipePass} of ${pipeTot} against our expected results. A single prompt with the same catalogue passes ${basePass} of ${baseTot}, failing where it should have asked questions or declined. Read that carefully: our baseline scoring is lenient, the expected values are ours, each case ran once, and we fixed one extractor prompt after a failure, so that case is not a clean held-out test. Re-running also showed variance: once, on the prompt-injection case, the extractor treated coffee as optional and the total came out wrong. We tightened the rule and it now holds across three re-runs.`,
    run: async (p) => { await glideClick(p, ".topbar__tab:has-text('Evaluation')"); await sleep(2500); await smoothTo(p, ".table--results", "start"); await sleep(5000); await top(p); },
  },
  {
    id: "s7-honest",
    text: "Two honest notes about the components. The code check blocked the writer's first draft in eight of eighteen runs, mostly over-cautious phrasing, with one real catch: a price inside a clarification email. Jev's triage agreed with the engine in all eighteen cases. And in that coffee case, Jev flagged an eighty-five percent hard requirement against the language model's optional, so the desk now shows that disagreement as a warning on the main screen. That makes Jev a useful cross-check, but we have not shown that it improves accuracy, and its alternative pick is unvalidated.",
    run: async (p) => { await sleep(4000); },
  },
  {
    id: "s8-limits",
    text: "Limitations: manual preparation time is our estimate of ten to fifteen minutes, not a measurement, and token cost was not measured. Next improvement: a fresh held-out set of enquiries, catalogue identifiers on every line so sources are visible, and timing a real salesperson. Thank you.",
    run: async (p) => { await glideClick(p, ".topbar__tab:has-text('Desk')"); await sleep(1500); },
  },
];

// ---------------------------------------------------------------- narration audio
const durations: number[] = [];
for (const s of scenes) {
  await $`say -v ${VOICE} -r ${RATE} -o ${DIR}audio/${s.id}.aiff ${s.text}`;
  const out = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${DIR}audio/${s.id}.aiff`.text();
  durations.push(parseFloat(out));
}
writeFileSync(`${DIR}script.md`, `# Demo narration (synthetic voice: ${VOICE}). Re-record in your own voice if you prefer.\n\n` + scenes.map((s, i) => `## ${i + 1}. ${s.id} (~${durations[i].toFixed(0)} s)\n\n${s.text}\n`).join("\n"));
console.log("narration total s:", durations.reduce((a, b) => a + b, 0).toFixed(0));

// ---------------------------------------------------------------- record
const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: "light" });
await ctx.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.style.cssText = "position:fixed;z-index:99999;width:20px;height:20px;border-radius:50%;background:rgba(20,184,166,.3);border:2px solid #14b8a6;pointer-events:none;transform:translate(-50%,-50%);left:-60px;top:-60px;transition:transform .12s";
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => (c.style.transform = "translate(-50%,-50%) scale(.6)"), true);
    addEventListener("mouseup", () => (c.style.transform = "translate(-50%,-50%) scale(1)"), true);
  });
});
const page = await ctx.newPage();
mkdirSync(`${DIR}frames`, { recursive: true });
const cdp = await ctx.newCDPSession(page);
const frames: { t: number; file: string }[] = [];
let n = 0;
cdp.on("Page.screencastFrame", (e: { data: string; sessionId: number }) => {
  const file = `${DIR}frames/f${String(n++).padStart(6, "0")}.jpg`;
  frames.push({ t: Date.now(), file });
  writeFileSync(file, Buffer.from(e.data, "base64"));
  void cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: W, maxHeight: H, everyNthFrame: 2 });
const t0 = Date.now();
const starts: number[] = [];

// title card for scene 0, then the app
await page.setContent(`<body style="margin:0;height:100vh;display:grid;place-items:center;background:#faf9f7;font-family:'Zalando Sans',system-ui,sans-serif;color:#0a0a0a">
<link href="https://fonts.googleapis.com/css2?family=Zalando+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<div style="max-width:900px"><div style="display:inline-grid;place-items:center;width:44px;height:44px;border-radius:6px;background:#2d776d;color:#fff;font-weight:600;font-size:22px">B</div>
<h1 style="font-size:56px;font-weight:600;letter-spacing:-0.02em;margin:24px 0 8px">BrightRoom Proposal Desk</h1>
<p style="font-size:26px;color:#747474;margin:0">From a client enquiry to a feasible proposal</p>
<p style="font-size:18px;color:#747474;margin-top:40px">MSc DSAIB · Case 02 · Convex · Claude Sonnet · TypeSafe Jev · deterministic engine</p></div></body>`);
await sleep(800);

for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];
  if (i === 1) { await page.goto(APP); await page.waitForSelector(".rail__row"); await sleep(1000); }
  if (s.pre) await s.pre(page);
  starts.push((Date.now() - t0) / 1000);
  console.log(`[${starts[i].toFixed(1)}s] ${s.id}`);
  const started = Date.now();
  await s.run(page);
  const spent = (Date.now() - started) / 1000;
  const need = durations[i] + 0.7 - spent;
  if (need > 0) await sleep(need * 1000);
}
await sleep(1200);
await cdp.send("Page.stopScreencast");
await ctx.close();
await browser.close();

// ---------------------------------------------------------------- mux
const list = frames.map((f, i) => {
  const from = i === 0 ? t0 : f.t;
  const to = i + 1 < frames.length ? frames[i + 1].t : f.t + 1000;
  return `file '${f.file}'\nduration ${Math.max(0.01, (to - from) / 1000).toFixed(3)}`;
});
list.push(`file '${frames[frames.length - 1].file}'`);
writeFileSync(`${DIR}frames.txt`, list.join("\n"));
const inputs = scenes.flatMap((s) => ["-i", `${DIR}audio/${s.id}.aiff`]);
const filters = scenes.map((_, i) => `[${i + 1}:a]adelay=${Math.round(starts[i] * 1000)}|${Math.round(starts[i] * 1000)}[a${i}]`).join(";");
const mix = scenes.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${scenes.length}:dropout_transition=0:normalize=0[aout]`;
await $`ffmpeg -y -f concat -safe 0 -i ${DIR}frames.txt ${inputs} -filter_complex ${filters + ";" + mix} -map 0:v -map [aout] -vf fps=25,format=yuv420p -c:v libx264 -preset medium -crf 21 -c:a aac -b:a 160k -shortest ${DIR}brightroom-demo.mp4`.quiet();
const dur = (await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${DIR}brightroom-demo.mp4`.text()).trim();
rmSync(`${DIR}frames`, { recursive: true, force: true });
console.log("DONE", `${DIR}brightroom-demo.mp4`, dur, "s");
