// Encodes the two videos from what the recorders wrote.
//   node encode.mjs overview <pngFramesDir> <outDir>
//   node encode.mjs demo <recDir> <outDir>
// Writes <name>.webm (VP9), <name>.mp4 (H.264, faststart), <name>-x.mp4
// (H.264 with the captions burned in, silent audio track, for X),
// <name>.vtt, <name>.srt and <name>.jpg (poster).
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const FONT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts', 'Geist-SemiBold.ttf');
const here = dirname(fileURLToPath(import.meta.url));
const [kind, src, out] = process.argv.slice(2);
const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1].split(',')
  : null;
mkdirSync(out, {recursive: true});
const work = join(out, 'work');
mkdirSync(join(work, 'fonts'), {recursive: true});
copyFileSync(FONT, join(work, 'fonts', 'Geist-SemiBold.ttf'));

function ff(args, label) {
  console.log(`ffmpeg ${label}`);
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    cwd: work,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  if (r.status !== 0)
    throw new Error(`${label}: status=${r.status} signal=${r.signal} err=${r.error} ${r.stderr}`);
}
const ts = (s, sep) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000),
    m = Math.floor(ms / 60000) % 60,
    sec = Math.floor(ms / 1000) % 60,
    r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`;
};
function writeCaptions(name, cues) {
  const vtt = ['WEBVTT', ''];
  const srt = [];
  cues.forEach((c, i) => {
    vtt.push(String(i + 1), `${ts(c.start, '.')} --> ${ts(c.end, '.')}`, c.text, '');
    srt.push(String(i + 1), `${ts(c.start, ',')} --> ${ts(c.end, ',')}`, c.text, '');
  });
  writeFileSync(join(out, `${name}.vtt`), vtt.join('\n'));
  writeFileSync(join(work, `${name}.srt`), srt.join('\n'));
}

// The three encodes from one input description (inputArgs) and an optional extra filter.
function encodeAll(name, inputArgs, {vf = '', posterAt, outArgs = []}) {
  const base = vf ? [vf] : [];
  const scale = 'scale=1920:1080:flags=lanczos:out_range=tv,format=yuv420p';
  const want = (k) => !only || only.includes(k);
  if (want('webm'))
    ff(
      [
        ...inputArgs,
        ...outArgs,
        '-vf',
        [...base, scale].join(','),
        '-c:v',
        'libvpx-vp9',
        '-crf',
        '36',
        '-b:v',
        '0',
        '-threads',
        '4',
        '-deadline',
        'good',
        '-cpu-used',
        '3',
        '-g',
        '240',
        '-an',
        join(out, `${name}.webm`),
      ],
      `${name}.webm`,
    );
  if (want('mp4'))
    ff(
      [
        ...inputArgs,
        ...outArgs,
        '-vf',
        [...base, scale].join(','),
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '24',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-g',
        '240',
        '-movflags',
        '+faststart',
        '-an',
        join(out, `${name}.mp4`),
      ],
      `${name}.mp4`,
    );
  if (want('x')) {
    const subs = `subtitles=${name}.srt:fontsdir=fonts:force_style='FontName=Geist,FontSize=11,PrimaryColour=&H00F5EDE9,BackColour=&H33000000,OutlineColour=&H40000000,BorderStyle=3,Outline=6,Shadow=0,MarginV=22,MarginL=40,MarginR=40'`;
    ff(
      [
        ...inputArgs,
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=48000:cl=stereo',
        ...outArgs,
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-vf',
        [...base, scale, subs].join(','),
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '24',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-g',
        '240',
        '-c:a',
        'aac',
        '-b:a',
        '48k',
        '-shortest',
        '-movflags',
        '+faststart',
        join(out, `${name}-x.mp4`),
      ],
      `${name}-x.mp4`,
    );
  }
  if (want('poster'))
    ff(
      [
        '-ss',
        String(posterAt),
        '-i',
        join(out, `${name}.mp4`),
        '-frames:v',
        '1',
        '-q:v',
        '3',
        join(out, `${name}.jpg`),
      ],
      `${name}.jpg`,
    );
}

if (kind === 'overview') {
  const cues = JSON.parse(readFileSync(join(here, 'overview-captions.json'), 'utf8'));
  writeCaptions('overview', cues);
  encodeAll('overview', ['-framerate', '30', '-i', join(src, '%05d.png')], {posterAt: 5});
} else if (kind === 'demo') {
  const frames = readdirSync(join(src, 'frames'))
    .filter((f) => f.endsWith('.jpg'))
    .map((f) => ({f, t: Number(f.split('-')[0])}))
    .sort((a, b) => a.t - b.t || a.f.localeCompare(b.f));
  const captions = JSON.parse(readFileSync(join(src, 'captions.json'), 'utf8'));
  const segments = JSON.parse(readFileSync(join(src, 'segments.json'), 'utf8')).sort(
    (a, b) => a.start - b.start,
  );
  const t0 = captions[0].t;
  const tEnd = captions[captions.length - 1].t;
  // Time warp: real ms -> video seconds. Speed segments shrink, cuts vanish.
  const W = (t) => {
    let v = 0,
      cur = t0;
    for (const s of segments) {
      if (s.end <= cur) continue;
      if (s.start >= t) break;
      const a = Math.max(s.start, cur);
      v += a - cur;
      const b = Math.min(s.end, t);
      if (s.speed !== 'cut') v += (b - a) / s.speed;
      cur = b;
    }
    if (t > cur) v += t - cur;
    return v / 1000;
  };
  const used = frames.filter((x) => x.t <= tEnd);
  const start = used.findLastIndex((x) => x.t <= t0);
  const list = used.slice(Math.max(0, start));
  const lines = ['ffconcat version 1.0'];
  let total = 0;
  list.forEach((x, i) => {
    const next = i + 1 < list.length ? list[i + 1].t : tEnd;
    const d = W(Math.max(next, t0)) - W(Math.max(x.t, t0));
    if (d <= 0.0005) return;
    lines.push(`file '${join(src, 'frames', x.f).replace(/\\/g, '/')}'`, `duration ${d.toFixed(4)}`);
    total += d;
  });
  lines.push(lines[lines.length - 2]);
  writeFileSync(join(work, 'demo.ffconcat'), lines.join('\n') + '\n');
  const cues = [];
  captions.forEach((c, i) => {
    if (!c.text) return;
    const end = i + 1 < captions.length ? captions[i + 1].t : tEnd;
    cues.push({start: W(c.t), end: W(end) - 0.05, text: c.text});
  });
  writeCaptions('demo', cues);
  // A "4x" badge while a wait is shown faster.
  const fast = segments.filter((s) => s.speed !== 'cut' && W(s.end) - W(s.start) > 0.4);
  const badge = fast
    .map(
      (s) =>
        `drawtext=fontfile=fonts/Geist-SemiBold.ttf:text='${s.speed}x speed':fontsize=26:fontcolor=0xE9EDF5:box=1:boxcolor=0x0D1118@0.85:boxborderw=12:x=w-tw-36:y=28:enable='between(t,${W(s.start).toFixed(3)},${W(s.end).toFixed(3)})'`,
    )
    .join(',');
  writeFileSync(
    join(out, 'demo-timing.json'),
    JSON.stringify(
      {
        total,
        fast: fast.map((s) => ({label: s.label, speed: s.speed, from: W(s.start), to: W(s.end)})),
        cuts: segments
          .filter((s) => s.speed === 'cut')
          .map((s) => ({label: s.label, at: W(s.start), realSeconds: (s.end - s.start) / 1000})),
      },
      null,
      2,
    ),
  );
  console.log(
    `demo: ${list.length} frames, ${total.toFixed(1)} s, ${cues.length} captions, ${fast.length} fast segments`,
  );
  const posterAt = Number(process.env.POSTER_AT ?? 20);
  // A near-lossless 30 fps master first (libvpx crashed reading the variable-rate concat directly).
  ff(
    [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      'demo.ffconcat',
      '-fps_mode',
      'cfr',
      '-r',
      '30',
      '-vf',
      `${badge},scale=1920:1080:flags=lanczos:out_range=tv,format=yuv420p`,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '12',
      'master.mp4',
    ],
    'master.mp4',
  );
  encodeAll('demo', ['-i', 'master.mp4'], {posterAt});
}
for (const f of readdirSync(out)) {
  const p = join(out, f);
  if (statSync(p).isFile()) console.log(`${f}\t${(statSync(p).size / 1048576).toFixed(2)} MB`);
}
