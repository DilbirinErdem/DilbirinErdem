import { readFile, writeFile } from "node:fs/promises";

const username = process.env.GITHUB_USERNAME || "DilbirinErdem";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const readmePath = "README.md";

if (!token) {
  throw new Error("GITHUB_TOKEN or GH_TOKEN is required.");
}

const query = `
  query($login: String!) {
    user(login: $login) {
      login
      name
      followers { totalCount }
      repositories(first: 20, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: { field: UPDATED_AT, direction: DESC }) {
        totalCount
        nodes {
          name
          url
          description
          isFork
          stargazerCount
          updatedAt
          primaryLanguage {
            name
          }
        }
      }
      contributionsCollection {
        contributionCalendar {
          totalContributions
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
    "user-agent": "DilbirinErdem-profile-refresh",
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
const repositories = user.repositories.nodes.filter(
  (repo) => !repo.isFork && repo.name !== username
);

const featured = repositories[0] || user.repositories.nodes[0];
const topLanguage =
  repositories.find((repo) => repo.primaryLanguage)?.primaryLanguage?.name ||
  "AI/Product";

const focusItems = [
  "AI-assisted ERP and pre-accounting product workflows",
  "contract-safe backend APIs and admin panels",
  "React/Vite interfaces and React Native mobile flows",
  "production diagnosis, deployment checks, and operational recovery",
  "LLM orchestration for practical business automation",
];

const now = new Date();
const dayOfYear = Math.floor(
  (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
    Date.UTC(now.getUTCFullYear(), 0, 0)) /
    86_400_000
);
const focus = focusItems[dayOfYear % focusItems.length];

const date = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Europe/Istanbul",
}).format(now);

const featuredLine = featured
  ? `[${featured.name}](${featured.url})${
      featured.description
        ? ` - ${featured.description.replace(/[.。]+$/u, "")}`
        : ""
    }`
  : `[repositories](https://github.com/${username}?tab=repositories)`;

const block = `<!-- DAILY_SIGNAL_START -->
## Daily Signal

Updated: ${date}

- Focus: ${focus}.
- Public profile signals: ${user.repositories.totalCount} public repositories, ${user.followers.totalCount} followers, ${user.contributionsCollection.contributionCalendar.totalContributions} contributions in the last year.
- Top visible language: ${topLanguage}.
- Start here: ${featuredLine}.
<!-- DAILY_SIGNAL_END -->`;

const readme = await readFile(readmePath, "utf8");
const updated = readme.replace(
  /<!-- DAILY_SIGNAL_START -->[\s\S]*?<!-- DAILY_SIGNAL_END -->/,
  block
);

if (readme === updated) {
  console.log("README is already up to date.");
} else {
  await writeFile(readmePath, updated, "utf8");
  console.log("README daily signal refreshed.");
}
