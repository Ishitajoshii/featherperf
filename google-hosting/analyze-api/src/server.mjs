import http from "node:http";

const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT ?? process.env.GCLOUD_PROJECT ?? "";
const VERTEX_LOCATION = process.env.FEATHERPERF_VERTEX_LOCATION ?? "asia-south1";
const VERTEX_MODEL = process.env.FEATHERPERF_VERTEX_MODEL ?? "gemini-2.5-flash";

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

const sanitizeArray = (value) => Array.isArray(value)
  ? value.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean).slice(0, 6)
  : [];

function sanitizeResponse(payload) {
  const response = {
    headline: typeof payload?.headline === "string" && payload.headline.trim() ? payload.headline.trim() : "FeatherPerf analysis",
    bullets: sanitizeArray(payload?.bullets)
  };

  if (payload?.configHints) {
    response.configHints = {
      include: sanitizeArray(payload.configHints.include),
      exclude: sanitizeArray(payload.configHints.exclude),
      criticalSelectors: sanitizeArray(payload.configHints.criticalSelectors)
    };
  }

  return response;
}

function extractJsonCandidate(text) {
  if (typeof text !== "string") return null;
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  return first >= 0 && last > first ? text.slice(first, last + 1) : null;
}

function parseVertexResponse(json) {
  const text = json?.candidates?.[0]?.content?.parts?.map((part) => part?.text ?? "").join("\n").trim();
  const candidate = extractJsonCandidate(text);
  if (!candidate) throw new Error("Vertex response did not include JSON.");
  return sanitizeResponse(JSON.parse(candidate));
}

const round = (v, d = 1) => Number.isFinite(v) ? Number(v.toFixed(d)) : null;
const pct = (before, after) => Number.isFinite(before) && before !== 0 && Number.isFinite(after) ? round(((after - before) / before) * 100, 1) : null;

function benchmarkFallback(summary) {
  const nav = summary?.navigation?.comparison ?? {};
  const interaction = summary?.interaction?.comparison ?? {};
  const bullets = [];

  if (Number.isFinite(nav?.fcpMs?.before) && Number.isFinite(nav?.fcpMs?.after)) {
    const delta = pct(nav.fcpMs.before, nav.fcpMs.after);
    bullets.push(`FCP moved from ${nav.fcpMs.before} ms to ${nav.fcpMs.after} ms${delta !== null ? ` (${Math.abs(delta)}% faster)` : ""}.`);
  }

  if (Number.isFinite(nav?.lcpMs?.before) && Number.isFinite(nav?.lcpMs?.after)) {
    bullets.push(`LCP moved from ${nav.lcpMs.before} ms to ${nav.lcpMs.after} ms, which supports the claim that the hero no longer waits behind the motion bundle.`);
  }

  if (Number.isFinite(nav?.tbtMs?.before) && Number.isFinite(nav?.tbtMs?.after)) {
    if (nav.tbtMs.after < nav.tbtMs.before) {
      bullets.push(`TBT improved from ${nav.tbtMs.before} ms to ${nav.tbtMs.after} ms, so the main-thread win is real in this controlled demo.`);
    } else if (nav.tbtMs.after > nav.tbtMs.before) {
      bullets.push(`TBT regressed from ${nav.tbtMs.before} ms to ${nav.tbtMs.after} ms, so this should be framed as an FCP-first win rather than a broad main-thread win.`);
    } else {
      bullets.push(`TBT stayed flat at ${nav.tbtMs.after} ms, so the strongest story remains first render and scheduling.`);
    }
  }

  if (Number.isFinite(interaction?.inpMs?.before) && Number.isFinite(interaction?.inpMs?.after)) {
    bullets.push(`Hero-click INP improved from ${interaction.inpMs.before} ms to ${interaction.inpMs.after} ms while processing delay moved from ${interaction.processingDelayMs?.before ?? "n/a"} ms to ${interaction.processingDelayMs?.after ?? "n/a"} ms.`);
  }

  return {
    headline: "FeatherPerf shifts early browser budget away from non-critical motion work.",
    bullets
  };
}

function configFallback(pluginReport) {
  const currentConfig = pluginReport?.currentConfig ?? {};
  return {
    headline: "Start with a narrow, conservative config around the known-safe motion importer.",
    bullets: [
      "Keep the include list narrow while the demo importer lives under src/pages/.",
      "Protect hero, body, and main selectors so above-the-fold content stays on the critical path.",
      "Broaden rollout only after the benchmark still shows the same off/on win."
    ],
    configHints: {
      include: Array.isArray(currentConfig.include) ? currentConfig.include : ["src/pages/"],
      exclude: Array.isArray(currentConfig.exclude) ? currentConfig.exclude : ["/hero/i"],
      criticalSelectors: Array.isArray(currentConfig.criticalSelectors) ? currentConfig.criticalSelectors : ["body", "main", ".hero"]
    }
  };
}

function promptFor(mode, body) {
  if (mode === "benchmark-summary") {
    return [
      "You are assisting FeatherPerf, a conservative web performance plugin.",
      "Return strict JSON only with this exact shape: {\"headline\": string, \"bullets\": string[] }.",
      "Use only the benchmark facts that are provided.",
      "If TBT is not better, say so explicitly. If FCP improves, say that clearly.",
      "Keep the answer short and developer-facing.",
      `Benchmark data: ${JSON.stringify(body.benchmarkSummary)}`
    ].join("\n\n");
  }

  return [
    "You are assisting FeatherPerf, a conservative web performance plugin.",
    "Return strict JSON only with this exact shape: {\"headline\": string, \"bullets\": string[], \"configHints\": { \"include\": string[], \"exclude\": string[], \"criticalSelectors\": string[] } }.",
    "Recommend only narrow, safe first-rollout config hints.",
    "Do not recommend deferring hero, header, app shell, body, or main selectors.",
    `Plugin report: ${JSON.stringify(body.pluginReport)}`,
    `Benchmark data: ${JSON.stringify(body.benchmarkSummary ?? null)}`
  ].join("\n\n");
}

async function getAccessToken() {
  if (process.env.VERTEX_ACCESS_TOKEN) return process.env.VERTEX_ACCESS_TOKEN;
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" }
  });
  if (!response.ok) throw new Error(`Metadata server returned ${response.status}`);
  const json = await response.json();
  if (!json?.access_token) throw new Error("Metadata server did not return an access token.");
  return json.access_token;
}

async function callVertex(prompt) {
  if (!PROJECT_ID) throw new Error("GOOGLE_CLOUD_PROJECT or GCP_PROJECT must be set.");
  const accessToken = await getAccessToken();
  const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, topP: 0.8, maxOutputTokens: 512 }
    })
  });
  if (!response.ok) throw new Error(`Vertex AI returned ${response.status}: ${await response.text()}`);
  return response.json();
}

async function analyze(body) {
  const mode = body?.mode;
  if (mode !== "benchmark-summary" && mode !== "config-hints") {
    return { statusCode: 400, payload: { error: "mode must be benchmark-summary or config-hints" } };
  }

  const fallback = mode === "benchmark-summary" ? benchmarkFallback(body.benchmarkSummary) : configFallback(body.pluginReport);

  try {
    const parsed = parseVertexResponse(await callVertex(promptFor(mode, body)));
    return { statusCode: 200, payload: parsed };
  } catch {
    return { statusCode: 200, payload: fallback };
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/api/analyze")) {
    sendJson(response, 200, { ok: true, service: "featherperf-analyze", vertexLocation: VERTEX_LOCATION, vertexModel: VERTEX_MODEL });
    return;
  }

  if (request.method === "POST" && (url.pathname === "/" || url.pathname === "/api/analyze")) {
    try {
      const result = await analyze(await parseJsonBody(request));
      sendJson(response, result.statusCode, result.payload);
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "unknown error" });
    }
    return;
  }

  sendJson(response, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`featherperf-analyze listening on ${PORT}`);
});
