import { mkdir, writeFile } from "node:fs/promises";

const username = process.env.GITHUB_USERNAME || "DilbirinErdem";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!token) {
  throw new Error("GITHUB_TOKEN or GH_TOKEN is required.");
}

const query = `
  query($login: String!) {
    user(login: $login) {
      login
      name
      createdAt
      followers { totalCount }
      following { totalCount }
      repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC) {
        totalCount
        nodes {
          stargazerCount
          forkCount
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges {
              size
              node {
                name
                color
              }
            }
          }
        }
      }
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              color
              weekday
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "DilbirinErdem-profile-assets",
  },
  body: JSON.stringify({ query, variables: { login: username } }),
});

if (!response.ok) {
  throw new Error(`GitHub API request failed: ${response.status}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join("; "));
}

const user = payload.data.user;
const weeks = user.contributionsCollection.contributionCalendar.weeks;
const days = weeks.flatMap((week, weekIndex) =>
  week.contributionDays.map((day) => ({ ...day, weekIndex }))
);

const languageTotals = new Map();
let stars = 0;
let forks = 0;

for (const repo of user.repositories.nodes) {
  stars += repo.stargazerCount;
  forks += repo.forkCount;

  for (const edge of repo.languages.edges) {
    const language = edge.node.name;
    const existing = languageTotals.get(language) || {
      color: edge.node.color || "#6e7681",
      size: 0,
    };
    existing.size += edge.size;
    languageTotals.set(language, existing);
  }
}

const topLanguage =
  [...languageTotals.entries()].sort((a, b) => b[1].size - a[1].size)[0]?.[0] ||
  "Markdown";

const totalContributions =
  user.contributionsCollection.contributionCalendar.totalContributions;
const activeDays = days.filter((day) => day.contributionCount > 0).length;
const bestDay = days.reduce((best, day) =>
  day.contributionCount > best.contributionCount ? day : best
);

await mkdir("assets", { recursive: true });

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statBlock(x, y, label, value, accent = "#0969da") {
  return `
    <g>
      <rect x="${x}" y="${y}" width="246" height="68" rx="8" fill="#f6f8fa" stroke="#d0d7de"/>
      <text x="${x + 18}" y="${y + 27}" fill="#57606a" font-size="13">${escapeXml(label)}</text>
      <text x="${x + 18}" y="${y + 53}" fill="${accent}" font-size="24" font-weight="700">${escapeXml(value)}</text>
    </g>`;
}

function buildStatsSvg() {
  const createdYear = new Date(user.createdAt).getFullYear();

  return `<svg width="860" height="280" viewBox="0 0 860 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">GitHub Stats for ${escapeXml(user.name || user.login)}</title>
  <desc id="desc">Public GitHub profile statistics generated from GitHub data.</desc>
  <rect width="860" height="280" rx="8" fill="#ffffff" stroke="#d0d7de"/>
  <text x="32" y="44" fill="#24292f" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">GitHub Stats</text>
  <text x="32" y="70" fill="#57606a" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="14">${escapeXml(user.login)} · public profile signals</text>
  ${statBlock(32, 96, "Contributions, last year", totalContributions, "#1a7f37")}
  ${statBlock(307, 96, "Public repositories", user.repositories.totalCount, "#0969da")}
  ${statBlock(582, 96, "Followers", user.followers.totalCount, "#8250df")}
  ${statBlock(32, 174, "Top language", topLanguage, "#bf8700")}
  ${statBlock(307, 174, "Active contribution days", activeDays, "#1a7f37")}
  ${statBlock(582, 174, "Since", createdYear, "#0969da")}
  <text x="32" y="262" fill="#57606a" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="13">Stars ${stars} · Forks ${forks} · Best day ${bestDay.contributionCount} contributions · Generated from GitHub public data</text>
</svg>
`;
}

function contributionColor(day) {
  return day.color || "#ebedf0";
}

function buildSnakeSvg() {
  const cell = 10;
  const gap = 4;
  const startX = 64;
  const startY = 58;
  const step = cell + gap;
  const gridWidth = weeks.length * step;
  const gridHeight = 7 * step;

  const cells = days
    .map((day) => {
      const x = startX + day.weekIndex * step;
      const y = startY + day.weekday * step;
      return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${contributionColor(day)}"><title>${day.date}: ${day.contributionCount} contributions</title></rect>`;
    })
    .join("\n  ");

  const snakeWeeks = weeks.slice(Math.max(0, weeks.length - 18));
  const snakePoints = [];
  snakeWeeks.forEach((week, localIndex) => {
    const weekIndex = weeks.length - snakeWeeks.length + localIndex;
    const rows = localIndex % 2 === 0 ? [6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6];
    for (const row of rows) {
      snakePoints.push({
        x: startX + weekIndex * step + cell / 2,
        y: startY + row * step + cell / 2,
      });
    }
  });

  const path = snakePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const head = snakePoints.at(-1);
  const eyeY = head.y - 3;

  return `<svg width="860" height="190" viewBox="0 0 860 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">GitHub Snake Graph for ${escapeXml(user.name || user.login)}</title>
  <desc id="desc">Contribution grid with a static snake path generated from GitHub data.</desc>
  <rect width="860" height="190" rx="8" fill="#ffffff" stroke="#d0d7de"/>
  <text x="32" y="38" fill="#24292f" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="24" font-weight="700">GitHub Snake Graph</text>
  <text x="646" y="38" fill="#57606a" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="13">${totalContributions} contributions</text>
  <g aria-hidden="true">
  ${cells}
  </g>
  <path d="${path}" fill="none" stroke="#39d353" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.88"/>
  <circle cx="${head.x}" cy="${head.y}" r="8" fill="#238636" stroke="#116329" stroke-width="2"/>
  <circle cx="${head.x - 3}" cy="${eyeY}" r="1.4" fill="#ffffff"/>
  <circle cx="${head.x + 3}" cy="${eyeY}" r="1.4" fill="#ffffff"/>
  <text x="32" y="172" fill="#57606a" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="12">Generated from the public contribution calendar for ${escapeXml(user.login)}.</text>
</svg>
`;
}

await writeFile("assets/github-stats.svg", buildStatsSvg(), "utf8");
await writeFile("assets/github-snake.svg", buildSnakeSvg(), "utf8");
