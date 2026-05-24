#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('GITHUB_TOKEN env var is required');
  process.exit(1);
}

const DEFAULT_OWNER = process.env.PIN_DEFAULT_OWNER || 'PeterGuy326';
const PINS = (process.env.PIN_REPOS || 'mem,git-skill,ai-ops-auto')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const LANG_COLORS = {
  Go: '#00ADD8',
  TypeScript: '#3178C6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Java: '#b07219',
  Rust: '#dea584',
  C: '#555555',
  'C++': '#f34b7d',
  Ruby: '#701516',
  Vue: '#41b883',
  Svelte: '#ff3e00',
};

const escapeXML = (s) =>
  String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

async function gql(query) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': `${DEFAULT_OWNER}-pin-bot` },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, await res.text());
    process.exit(1);
  }
  const body = await res.json();
  if (body.errors) {
    console.error('GraphQL errors:', JSON.stringify(body.errors));
    process.exit(1);
  }
  return body.data;
}

async function fetchRepo(nwo) {
  const [owner, name] = nwo.includes('/') ? nwo.split('/') : [DEFAULT_OWNER, nwo];
  const data = await gql(`
    { repository(owner: "${owner}", name: "${name}") {
        name
        nameWithOwner
        description
        stargazerCount
        forkCount
        primaryLanguage { name color }
        isFork
      }
    }
  `);
  return data.repository;
}

function wrapText(text, maxChars, maxLines = 2) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let curr = '';
  for (const w of words) {
    const candidate = curr ? `${curr} ${w}` : w;
    if (candidate.length <= maxChars) {
      curr = candidate;
    } else {
      if (curr) lines.push(curr);
      curr = w;
      if (lines.length === maxLines) break;
    }
  }
  if (curr && lines.length < maxLines) lines.push(curr);
  if (lines.length === maxLines) {
    const consumed = lines.join(' ').length;
    if (text.length > consumed + 1) {
      const last = lines[maxLines - 1];
      if (last.length > maxChars - 3) lines[maxLines - 1] = last.slice(0, maxChars - 3) + '…';
      else lines[maxLines - 1] = last + '…';
    }
  }
  return lines;
}

function renderCard(repo) {
  const W = 400, H = 140;
  const PAD = 22;

  const titleY = 36;
  const descY1 = 66;
  const descY2 = 86;
  const footerY = 122;

  const titleMax = 28;
  const title = repo.name.length > titleMax ? repo.name.slice(0, titleMax - 1) + '…' : repo.name;
  const descLines = wrapText(repo.description || '', 52, 2);
  const lang = repo.primaryLanguage;
  const langName = lang?.name || '';
  const langColor = LANG_COLORS[langName] || lang?.color || '#586069';

  const repoIcon = `<path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 1 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 0 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" fill="#fe428e"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Pinned repo: ${escapeXML(repo.nameWithOwner)}">
  <title>${escapeXML(repo.nameWithOwner)} — ${escapeXML(repo.description || '')}</title>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="6" ry="6" fill="#141321" stroke="#e4e2e2" stroke-opacity="0.2"/>
  <g font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">
    <g transform="translate(${PAD}, ${titleY - 14})">${repoIcon}</g>
    <text x="${PAD + 22}" y="${titleY}" fill="#fe428e" font-size="17" font-weight="600">${escapeXML(title)}</text>
    <text x="${PAD}" y="${descY1}" fill="#a9fef7" font-size="12.5">${escapeXML(descLines[0] || '')}</text>
    <text x="${PAD}" y="${descY2}" fill="#a9fef7" font-size="12.5">${escapeXML(descLines[1] || '')}</text>
    <circle cx="${PAD + 6}" cy="${footerY - 4}" r="6" fill="${langColor}"/>
    <text x="${PAD + 18}" y="${footerY}" fill="#a9fef7" font-size="12">${escapeXML(langName)}</text>
    <g transform="translate(${PAD + 145}, ${footerY - 12})">
      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" fill="#f8d847"/>
    </g>
    <text x="${PAD + 165}" y="${footerY}" fill="#a9fef7" font-size="12">${repo.stargazerCount}</text>
    <g transform="translate(${PAD + 205}, ${footerY - 12})">
      <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" fill="#f8d847"/>
    </g>
    <text x="${PAD + 225}" y="${footerY}" fill="#a9fef7" font-size="12">${repo.forkCount}</text>
  </g>
</svg>
`;
}

const here = dirname(fileURLToPath(import.meta.url));
const results = [];
for (const pin of PINS) {
  const repo = await fetchRepo(pin);
  if (!repo) {
    console.error(`Repo ${pin} not found, skipping`);
    continue;
  }
  const svg = renderCard(repo);
  const slug = pin.split('/').pop();
  const outPath = resolve(here, '..', 'assets', `pin-${slug}.svg`);
  writeFileSync(outPath, svg);
  results.push({ slug, name: repo.nameWithOwner, stars: repo.stargazerCount, forks: repo.forkCount, outPath });
}
console.log(JSON.stringify(results, null, 2));
