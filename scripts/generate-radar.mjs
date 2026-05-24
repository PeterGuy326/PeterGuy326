#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const USERNAME = process.env.RADAR_USERNAME || 'PeterGuy326';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('GITHUB_TOKEN env var is required');
  process.exit(1);
}

const query = `
{
  user(login: "${USERNAME}") {
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
    }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': `${USERNAME}-radar-bot`,
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

const c = body.data.user.contributionsCollection;
const counts = {
  commits: c.totalCommitContributions,
  issues: c.totalIssueContributions,
  prs: c.totalPullRequestContributions,
  reviews: c.totalPullRequestReviewContributions,
};
const total = counts.commits + counts.issues + counts.prs + counts.reviews;
if (total === 0) {
  console.error('Zero contributions — refusing to generate empty radar');
  process.exit(1);
}

const pct = {
  commits: (counts.commits / total) * 100,
  issues: (counts.issues / total) * 100,
  prs: (counts.prs / total) * 100,
  reviews: (counts.reviews / total) * 100,
};
const fmt = (p) => Math.round(p);

const W = 1200, H = 420;
const LABEL_X = 220;
const BAR_X = 240;
const BAR_END = 1120;
const BAR_MAX_WIDTH = BAR_END - BAR_X;
const BAR_H = 44;
const Y_START = 110;
const Y_GAP = 22;

const bars = [
  { label: 'Commits',       pct: pct.commits },
  { label: 'Pull requests', pct: pct.prs     },
  { label: 'Code review',   pct: pct.reviews },
  { label: 'Issues',        pct: pct.issues  },
];

const barRows = bars.map((b, i) => {
  const y = Y_START + i * (BAR_H + Y_GAP);
  const w = Math.max(2, Math.round((b.pct / 100) * BAR_MAX_WIDTH));
  const textCy = y + BAR_H / 2 + 6;
  return `    <text x="${LABEL_X}" y="${textCy}" fill="#c9d1d9" font-size="20" text-anchor="end" font-weight="500">${b.label}</text>
    <rect x="${BAR_X}" y="${y}" width="${BAR_MAX_WIDTH}" height="${BAR_H}" rx="6" ry="6" fill="#161b22"/>
    <rect x="${BAR_X}" y="${y}" width="${w}" height="${BAR_H}" rx="6" ry="6" fill="#40c463" fill-opacity="0.9"/>
    <text x="${BAR_X + w + 14}" y="${textCy}" fill="#c9d1d9" font-size="22" font-weight="700">${fmt(b.pct)}%</text>`;
}).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Contribution breakdown for ${USERNAME}">
  <title>${USERNAME} — contribution breakdown (last year)</title>
  <desc>Commits ${fmt(pct.commits)}% · PRs ${fmt(pct.prs)}% · Code review ${fmt(pct.reviews)}% · Issues ${fmt(pct.issues)}%</desc>
  <rect width="${W}" height="${H}" fill="#0d1117"/>
  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">
    <text x="${W / 2}" y="60" fill="#ff6b9a" font-size="26" font-weight="700" text-anchor="middle">Contribution Breakdown</text>
    <text x="${W / 2}" y="88" fill="#8b949e" font-size="14" text-anchor="middle">last year · ${counts.commits + counts.prs + counts.reviews + counts.issues} contributions across commits / PRs / code review / issues</text>
${barRows}
  </g>
</svg>
`;

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'assets', 'contribution-radar.svg');
writeFileSync(outPath, svg);

console.log(JSON.stringify({ counts, pct: Object.fromEntries(Object.entries(pct).map(([k, v]) => [k, +v.toFixed(2)])), total, outPath }, null, 2));
