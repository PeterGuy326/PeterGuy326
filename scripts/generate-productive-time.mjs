#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const USERNAME = process.env.PRODUCTIVE_USERNAME || 'PeterGuy326';
const TZ = process.env.PRODUCTIVE_TZ || 'Asia/Shanghai';
const MAX_REPOS = Number(process.env.PRODUCTIVE_MAX_REPOS || 25);
const MAX_COMMITS_PER_REPO = Number(process.env.PRODUCTIVE_MAX_COMMITS || 100);
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('GITHUB_TOKEN env var is required');
  process.exit(1);
}

async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': `${USERNAME}-productive-time-bot`,
    },
    body: JSON.stringify({ query, variables }),
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
  return body.data;
}

const sinceISO = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

const userData = await gql(`query($login:String!){ user(login:$login){ id } }`, { login: USERNAME });
const userId = userData.user.id;

const reposData = await gql(
  `query($login:String!, $max:Int!){
    user(login:$login){
      contributionsCollection{
        commitContributionsByRepository(maxRepositories:$max){
          repository{ nameWithOwner owner{ login } name defaultBranchRef{ target{ ... on Commit { oid } } } }
        }
      }
    }
  }`,
  { login: USERNAME, max: MAX_REPOS },
);

const repos = reposData.user.contributionsCollection.commitContributionsByRepository
  .map((r) => r.repository)
  .filter((r) => r.defaultBranchRef);

const buckets = Array.from({ length: 7 }, () => Array(24).fill(0));
let totalCommits = 0;

const localFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
  hour: '2-digit',
  hour12: false,
});

const WEEKDAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

for (const repo of repos) {
  const data = await gql(
    `query($owner:String!, $name:String!, $authorId:ID!, $since:GitTimestamp!, $first:Int!){
      repository(owner:$owner, name:$name){
        defaultBranchRef{
          target{
            ... on Commit {
              history(author:{id:$authorId}, since:$since, first:$first){
                nodes{ committedDate }
              }
            }
          }
        }
      }
    }`,
    {
      owner: repo.owner.login,
      name: repo.name,
      authorId: userId,
      since: sinceISO,
      first: MAX_COMMITS_PER_REPO,
    },
  );
  const nodes = data.repository?.defaultBranchRef?.target?.history?.nodes ?? [];
  for (const { committedDate } of nodes) {
    const parts = localFormatter.formatToParts(new Date(committedDate));
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    const hourStr = parts.find((p) => p.type === 'hour')?.value;
    const wIdx = WEEKDAY_INDEX[weekday];
    const hour = Number(hourStr) % 24;
    if (wIdx === undefined || Number.isNaN(hour)) continue;
    buckets[wIdx][hour] += 1;
    totalCommits += 1;
  }
}

if (totalCommits === 0) {
  console.error('Zero commits collected — refusing to generate empty heatmap');
  process.exit(1);
}

let peak = 0;
for (const row of buckets) for (const v of row) if (v > peak) peak = v;

const PALETTE = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
const colorFor = (v) => {
  if (v === 0) return PALETTE[0];
  const ratio = v / peak;
  if (ratio <= 0.25) return PALETTE[1];
  if (ratio <= 0.5) return PALETTE[2];
  if (ratio <= 0.75) return PALETTE[3];
  return PALETTE[4];
};

const WIDTH = 730;
const HEIGHT = 520;
const LEFT = 70;
const TOP = 110;
const CELL_W = 24;
const CELL_H = 36;
const GAP = 3;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let peakIdx = { d: 0, h: 0 };
for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) if (buckets[d][h] === peak) { peakIdx = { d, h }; break; }

const cells = [];
for (let d = 0; d < 7; d++) {
  for (let h = 0; h < 24; h++) {
    const x = LEFT + h * (CELL_W + GAP);
    const y = TOP + d * (CELL_H + GAP);
    const v = buckets[d][h];
    cells.push(`<rect x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}" rx="3" ry="3" fill="${colorFor(v)}"><title>${DAYS[d]} ${String(h).padStart(2, '0')}:00 — ${v} commits</title></rect>`);
  }
}

const dayLabels = DAYS.map((d, i) => `<text x="${LEFT - 12}" y="${TOP + i * (CELL_H + GAP) + CELL_H / 2 + 5}" fill="#8b949e" font-size="14" text-anchor="end">${d}</text>`).join('');

const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];
const hourLabels = HOUR_TICKS.map((h) => `<text x="${LEFT + h * (CELL_W + GAP) + CELL_W / 2}" y="${TOP + 7 * (CELL_H + GAP) + 18}" fill="#8b949e" font-size="13" text-anchor="middle">${String(h).padStart(2, '0')}</text>`).join('');

const LEGEND_Y = TOP + 7 * (CELL_H + GAP) + 60;
const LEGEND_X = LEFT + 24 * (CELL_W + GAP) - (PALETTE.length * 20 + 80);
const legendSwatches = PALETTE.map((c, i) => `<rect x="${LEGEND_X + 40 + i * 20}" y="${LEGEND_Y}" width="16" height="16" rx="3" ry="3" fill="${c}"/>`).join('');

const peakLabel = `${DAYS[peakIdx.d]} ${String(peakIdx.h).padStart(2, '0')}:00 · ${peak} commits`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="Productive time heatmap for ${USERNAME}">
  <title>${USERNAME} — productive time (last year, ${TZ})</title>
  <desc>Commits aggregated by weekday and hour. Peak: ${peakLabel}. Total commits sampled: ${totalCommits}.</desc>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0d1117"/>
  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">
    <text x="${WIDTH / 2}" y="48" fill="#ff6b9a" font-size="22" font-weight="700" text-anchor="middle">When ${USERNAME} commits</text>
    <text x="${WIDTH / 2}" y="76" fill="#8b949e" font-size="14" text-anchor="middle">last year · ${TZ} · peak ${peakLabel}</text>
    ${dayLabels}
    ${cells.join('\n    ')}
    ${hourLabels}
    <text x="${LEFT + 12 * (CELL_W + GAP) + CELL_W / 2}" y="${TOP + 7 * (CELL_H + GAP) + 42}" fill="#8b949e" font-size="13" text-anchor="middle">hour of day</text>
    <text x="${LEGEND_X + 30}" y="${LEGEND_Y + 12}" fill="#8b949e" font-size="13" text-anchor="end">less</text>
    ${legendSwatches}
    <text x="${LEGEND_X + 40 + PALETTE.length * 20 + 6}" y="${LEGEND_Y + 12}" fill="#8b949e" font-size="13">more</text>
  </g>
</svg>
`;

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'assets', 'productive-time.svg');
writeFileSync(outPath, svg);

console.log(JSON.stringify({ totalCommits, peak, peakLabel, reposScanned: repos.length, outPath }, null, 2));
