// Builds brightroom-demo.mp4 from demo/recording.json (written by record.ts): screen frames + narration.
// Re-run on its own with `bun demo/mux.ts` if only the encode needs fixing.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { $ } from "bun";

const DIR = new URL(".", import.meta.url).pathname;
const rec = JSON.parse(readFileSync(`${DIR}recording.json`, "utf8")) as {
  W: number; H: number; t0: number; frames: { t: number; file: string }[];
  starts: number[]; durations: number[]; ids: string[]; ext: string;
};
const { W, H, t0, frames, starts, durations, ids, ext } = rec;

// ffmpeg's concat demuxer silently drops the first block when the first image has a different size from later
// ones (the title page is shorter than the app viewport). So normalise every frame to W x H first.
function jpgSize(file: string) {
  const b = readFileSync(file);
  for (let i = 2; i < b.length - 9; ) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { w: W, h: H };
}
const PAD = `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0xfaf9f7`;
for (const f of frames) {
  const { w, h } = jpgSize(f.file);
  if (w !== W || h !== H) {
    await $`ffmpeg -y -v error -i ${f.file} -vf ${PAD} ${f.file + ".tmp.jpg"}`.quiet();
    renameSync(f.file + ".tmp.jpg", f.file);
  }
}

const endSecs = starts[starts.length - 1] + durations[durations.length - 1] + 1.2;
const list = frames.map((f, i) => {
  const from = i === 0 ? t0 : f.t;
  const to = i + 1 < frames.length ? frames[i + 1].t : t0 + endSecs * 1000;
  return `file '${f.file}'\nduration ${Math.max(0.01, (to - from) / 1000).toFixed(3)}`;
});
list.push(`file '${frames[frames.length - 1].file}'`);
writeFileSync(`${DIR}frames.txt`, list.join("\n"));

const audio = (id: string) => `${DIR}audio/${id}.${ext}`;
const inputs = ["-f", "concat", "-safe", "0", "-i", `${DIR}frames.txt`, ...ids.flatMap((id) => ["-i", audio(id)])];
const filters = ["[0:v]fps=25,format=yuv420p,tpad=stop_mode=clone:stop_duration=30[vp]", ...ids.map((_, i) => `[${i + 1}:a]adelay=${Math.round(starts[i] * 1000)}|${Math.round(starts[i] * 1000)}[a${i}]`)].join(";");
const mix = ids.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${ids.length}:dropout_transition=0:normalize=0[aout]`;
await $`ffmpeg -y ${inputs} -filter_complex ${filters + ";" + mix} -map [vp] -map [aout] -t ${endSecs.toFixed(3)} -c:v libx264 -preset medium -crf 21 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart ${DIR}brightroom-demo.mp4`.quiet();
const dur = (await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${DIR}brightroom-demo.mp4`.text()).trim();
console.log("DONE", `${DIR}brightroom-demo.mp4`, dur, "s");
