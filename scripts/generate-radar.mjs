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
const max = Math.max(pct.commits, pct.issues, pct.prs, pct.reviews);

const W = 1200, H = 420;
const CX = 600, CY = 215, R_MAX = 135;
const radius = (p) => (p / max) * R_MAX;
const round = (n) => Math.round(n * 10) / 10;
const fmt = (p) => Math.round(p);

const topY    = round(CY - radius(pct.reviews));
const leftX   = round(CX - radius(pct.commits));
const rightX  = round(CX + radius(pct.issues));
const bottomY = round(CY + radius(pct.prs));

const AXIS_EXT = R_MAX + 20;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Contribution breakdown radar for ${USERNAME}">
  <title>${USERNAME} — contribution breakdown (last year)</title>
  <desc>Commits ${fmt(pct.commits)}% · PRs ${fmt(pct.prs)}% · Code review ${fmt(pct.reviews)}% · Issues ${fmt(pct.issues)}%</desc>
  <rect width="${W}" height="${H}" fill="#0d1117"/>
  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" text-anchor="middle">
    <line x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - AXIS_EXT}" stroke="#40c463" stroke-width="2"/>
    <line x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY + AXIS_EXT}" stroke="#40c463" stroke-width="2"/>
    <line x1="${CX}" y1="${CY}" x2="${CX - AXIS_EXT}" y2="${CY}" stroke="#40c463" stroke-width="2"/>
    <line x1="${CX}" y1="${CY}" x2="${CX + AXIS_EXT}" y2="${CY}" stroke="#40c463" stroke-width="2"/>

    <polygon points="${CX},${topY} ${rightX},${CY} ${CX},${bottomY} ${leftX},${CY}"
             fill="#40c463" fill-opacity="0.55" stroke="#40c463" stroke-width="2"/>

    <circle cx="${CX}"     cy="${topY}"    r="5" fill="#0d1117" stroke="#40c463" stroke-width="2"/>
    <circle cx="${rightX}" cy="${CY}"      r="5" fill="#0d1117" stroke="#40c463" stroke-width="2"/>
    <circle cx="${CX}"     cy="${bottomY}" r="5" fill="#0d1117" stroke="#40c463" stroke-width="2"/>
    <circle cx="${leftX}"  cy="${CY}"      r="5" fill="#0d1117" stroke="#40c463" stroke-width="2"/>
    <circle cx="${CX}"     cy="${CY}"      r="4" fill="#0d1117" stroke="#40c463" stroke-width="2"/>

    <text x="${CX}" y="${CY - AXIS_EXT - 22}" fill="#c9d1d9" font-size="22" font-weight="600">${fmt(pct.reviews)}%</text>
    <text x="${CX}" y="${CY - AXIS_EXT - 2}"  fill="#8b949e" font-size="16">Code review</text>

    <text x="${CX - AXIS_EXT - 70}" y="${CY - 6}" fill="#c9d1d9" font-size="22" font-weight="600">${fmt(pct.commits)}%</text>
    <text x="${CX - AXIS_EXT - 70}" y="${CY + 18}" fill="#8b949e" font-size="16">Commits</text>

    <text x="${CX + AXIS_EXT + 70}" y="${CY - 6}" fill="#c9d1d9" font-size="22" font-weight="600">${fmt(pct.issues)}%</text>
    <text x="${CX + AXIS_EXT + 70}" y="${CY + 18}" fill="#8b949e" font-size="16">Issues</text>

    <text x="${CX}" y="${CY + AXIS_EXT + 28}" fill="#c9d1d9" font-size="22" font-weight="600">${fmt(pct.prs)}%</text>
    <text x="${CX}" y="${CY + AXIS_EXT + 48}" fill="#8b949e" font-size="16">Pull requests</text>
  </g>
</svg>
`;

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'assets', 'contribution-radar.svg');
writeFileSync(outPath, svg);

console.log(JSON.stringify({ counts, pct: Object.fromEntries(Object.entries(pct).map(([k, v]) => [k, +v.toFixed(2)])), total, outPath }, null, 2));
