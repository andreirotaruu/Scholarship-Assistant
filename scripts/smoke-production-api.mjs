const apiBase = process.env.SCHOLARSAFE_API_BASE?.replace(/\/$/, "");
const apiToken = process.env.SCHOLARSAFE_API_TOKEN;

if (!apiBase || !apiToken) {
  console.error("Set SCHOLARSAFE_API_BASE and SCHOLARSAFE_API_TOKEN before running the production smoke test.");
  process.exit(2);
}

async function request(path, authenticated = false) {
  const headers = authenticated ? { Authorization: `Bearer ${apiToken}` } : {};
  const response = await fetch(`${apiBase}${path}`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

try {
  const health = await request("/health");
  const readiness = await request("/ready");
  const profile = await request("/api/profile", true);
  if (health.submission_enabled !== false || readiness.database !== "available" || !Array.isArray(profile.fields)) {
    throw new Error("Production API returned an unexpected safety or profile response.");
  }
  console.log(`ScholarSafe API is ready at ${apiBase}; authenticated profile access passed.`);
} catch (error) {
  console.error(`ScholarSafe production smoke test failed: ${error.message}`);
  process.exit(1);
}
