import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";

async function cfGraphQL(token: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CF GraphQL error: ${res.status} ${text}`);
  }
  return res.json();
}

const NEON_PROJECT_ID = "red-heart-96250839";
const CF_PAGES_PROJECT = "kb-chatbot-dashboard";
const AI_GATEWAY_ID = "kb-chatbot";

function clampDays(raw: string | undefined): number {
  return Math.min(Math.max(Number(raw) || 7, 1), 90);
}

const monitoring = new Hono<AppEnv>();

// GET /api/monitoring/neon?days=7
monitoring.get("/neon", async (c) => {
  const env = c.env;
  const days = clampDays(c.req.query("days"));

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const [projectRes, consumptionRes] = await Promise.all([
    fetch(`https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}`, {
      headers: { Authorization: `Bearer ${env.NEON_API_KEY}` },
    }),
    fetch(
      `https://console.neon.tech/api/v2/consumption_history/v2/projects?` +
        new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
          granularity: "daily",
          project_ids: NEON_PROJECT_ID,
          limit: "1",
        }),
      { headers: { Authorization: `Bearer ${env.NEON_API_KEY}` } },
    ),
  ]);

  if (!projectRes.ok || !consumptionRes.ok) {
    const errText = !projectRes.ok
      ? await projectRes.text()
      : await consumptionRes.text();
    return c.json({ error: "Neon API error", details: errText }, 502);
  }

  const project = await projectRes.json();
  const consumption = await consumptionRes.json();

  return c.json({ project, consumption });
});

// GET /api/monitoring/cf-workers?days=7
monitoring.get("/cf-workers", async (c) => {
  const env = c.env;
  const days = clampDays(c.req.query("days"));

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const query = `query ($accountTag: String!, $from: Date!, $to: Date!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersOverviewRequestsAdaptiveGroups(
          limit: 1000
          filter: { date_geq: $from, date_leq: $to }
          orderBy: [date_ASC]
        ) {
          sum { requests errors subrequests }
          dimensions { date scriptName }
        }
      }
    }
  }`;

  try {
    const data = await cfGraphQL(env.CF_API_TOKEN, query, {
      accountTag: env.CF_ACCOUNT_ID,
      from: from.toISOString().split("T")[0],
      to: to.toISOString().split("T")[0],
    });
    return c.json(data);
  } catch (e) {
    return c.json({ error: "CF Workers API error", details: String(e) }, 502);
  }
});

// GET /api/monitoring/cf-pages?limit=20
monitoring.get("/cf-pages", async (c) => {
  const env = c.env;
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 50);

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${CF_PAGES_PROJECT}/deployments?per_page=${limit}`,
    { headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` } },
  );

  if (!res.ok) {
    const text = await res.text();
    return c.json({ error: "CF Pages API error", details: text }, 502);
  }

  const data = await res.json();
  return c.json(data);
});

// GET /api/monitoring/cf-ai-gateway?days=7
monitoring.get("/cf-ai-gateway", async (c) => {
  const env = c.env;
  const days = clampDays(c.req.query("days"));

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const query = `query ($accountTag: String!, $from: String!, $to: String!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        aiGatewayRequestsAdaptiveGroups(
          limit: 1000
          filter: {
            datetime_geq: $from
            datetime_leq: $to
            gateway: "${AI_GATEWAY_ID}"
          }
          orderBy: [datetimeHour_ASC]
        ) {
          count
          sum {
            cachedRequests
            erroredRequests
            cost
            cachedTokensIn
            cachedTokensOut
            uncachedTokensIn
            uncachedTokensOut
          }
          dimensions {
            datetimeHour
            model
            provider
          }
        }
      }
    }
  }`;

  try {
    const data = await cfGraphQL(env.CF_API_TOKEN, query, {
      accountTag: env.CF_ACCOUNT_ID,
      from: from.toISOString(),
      to: to.toISOString(),
    });
    return c.json(data);
  } catch (e) {
    return c.json({ error: "CF AI Gateway API error", details: String(e) }, 502);
  }
});

export { monitoring };
