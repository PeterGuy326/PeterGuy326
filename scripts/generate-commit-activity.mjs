#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const USERNAME = process.env.ACTIVITY_USERNAME || 'PeterGuy326';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('GITHUB_TOKEN env var is required');
  process.exit(1);
}

const query = `
{
  user(login: "${USERNAME}") {
    contributionsCollection {
      contributionCalendar {
        weeks {
          firstDay
          contributionDays { contributionCount }
        }
      }
    }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': `${USERNAME}-commit-activity-bot`,
  },
  body: JSON.stringify({ query }),
});

if (!res.ok) {
  console.error(`GraphQL HTTP ${res.status}:`, await res.text());
  process.exit(1);
}

const body = await res.json();
if (body.errors) {
  console.error('GraphQL errors:', JSON.stringify(body.errors));
  process.exit(1);
}

const weeks = body.data.user.contributionsCollection.contributionCalendar.weeks;
const weekTotals = weeks.map((w) => ({
  firstDay: w.firstDay,
  total: w.contributionDays.reduce((s, d) => s + d.contributionCount, 0),
}));
const last52 = weekTotals.slice(-52);
if (last52.length === 0) {
  console.error('No weeks returned');
  process.exit(1);
}
const peak = Math.max(...last52.map((w) => w.total));
const total = last52.reduce((s, w) => s + w.total, 0);

const W = 340;
const H = 200;
const PAD_X = 18;
const PAD_TOP = 50;
const PAD_BOTTOM = 26;
const CHART_W = W - 2 * PAD_X;
const CHART_H = H - PAD_TOP - PAD_BOTTOM;
const BAR_GAP = 1.5;
const BAR_W = (CHART_W - BAR_GAP * (last52.length - 1)) / last52.length;

const PALETTE = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
const colorFor = (v) => {
  if (v === 0) return PALETTE[0];
  const r = v / peak;
  if (r <= 0.25) return PALETTE[1];
  if (r <= 0.5) return PALETTE[2];
  if (r <= 0.75) return PALETTE[3];
  return PALETTE[4];
};

const monthShort = (iso) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][new Date(iso).getUTCMonth()];

let lastMonth = null;
const monthTicks = [];
last52.forEach((w, i) => {
  const m = monthShort(w.firstDay);
  if (m !== lastMonth) {
    monthTicks.push({ i, label: m });
    lastMonth = m;
  }
});

const bars = last52
  .map((w, i) => {
    const h = Math.max(2, (w.total / peak) * CHART_H);
    const x = PAD_X + i * (BAR_W + BAR_GAP);
    const y = PAD_TOP + CHART_H - h;
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${BAR_W.toFixed(2)}" height="${h.toFixed(2)}" rx="1" ry="1" fill="${colorFor(w.total)}"><title>week of ${w.firstDay}: ${w.total} contributions</title></rect>`;
  })
  .join('');

const ticks = monthTicks
  .map(({ i, label }) => {
    const x = PAD_X + i * (BAR_W + BAR_GAP) + BAR_W / 2;
    return `<text x="${x.toFixed(2)}" y="${(PAD_TOP + CHART_H + 14).toFixed(0)}" fill="#8b949e" font-size="9" text-anchor="middle">${label}</text>`;
  })
  .join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Commit activity bars — last 52 weeks for ${USERNAME}">
  <title>${USERNAME} — commit activity (last 52 weeks)</title>
  <desc>${total} contributions across ${last52.length} weeks; peak week ${peak} contributions.</desc>
  <rect width="${W}" height="${H}" rx="6" ry="6" fill="#141321"/>
  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">
    <text x="${PAD_X}" y="24" fill="#fe428e" font-size="15" font-weight="700">Commit Activity</text>
    <text x="${PAD_X}" y="40" fill="#8b949e" font-size="11">last 52 weeks · peak ${peak} · total ${total}</text>
    ${bars}
    ${ticks}
  </g>
</svg>
`;

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'assets', 'commit-activity.svg');
writeFileSync(outPath, svg);

console.log(JSON.stringify({ weeks: last52.length, peak, total, outPath }, null, 2));
