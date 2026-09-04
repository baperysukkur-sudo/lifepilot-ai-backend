const http = require("http");

const PORT = process.env.PORT || 8787;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(data));
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1000000) req.destroy();
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function extractSources(obj, result = []) {
  if (!obj || typeof obj !== "object") return result;

  if (Array.isArray(obj)) {
    for (const item of obj) extractSources(item, result);
    return result;
  }

  if (obj.url && typeof obj.url === "string") {
    result.push({
      title: obj.title || obj.url,
      url: obj.url
    });
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      extractSources(value, result);
    }
  }

  return result;
}

async function chat(message, history, useWeb) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const input = [];

  input.push({
    role: "system",
    content:
      "You are LifePilot AI, a highly capable personal AI assistant. " +
      "Answer naturally and helpfully in the same language as the user. " +
      "You can explain, write, plan, compare, analyze and solve problems. " +
      "Use conversation history when useful. " +
      "Never claim that you performed an action unless you actually did it. " +
      "When web search is available and current, recent, changing, " +
      "location-specific or Internet information is requested, use web search."
  });

  if (Array.isArray(history)) {
    for (const item of history.slice(-12)) {
      if (!item || !item.role || !item.content) continue;

      input.push({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content).slice(0, 10000)
      });
    }
  }

  input.push({
    role: "user",
    content: String(message).slice(0, 20000)
  });

  const requestBody = {
    model: OPENAI_MODEL,
    input
  };

  if (useWeb) {
    requestBody.tools = [
      {
        type: "web_search"
      }
    ];
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "OpenAI API request failed."
    );
  }

  const reply =
    data.output_text ||
    data.output
      ?.filter(x => x.type === "message")
      ?.flatMap(x => x.content || [])
      ?.filter(x => x.type === "output_text")
      ?.map(x => x.text)
      ?.join("\n") ||
    "দুঃখিত, কোনো উত্তর পাওয়া যায়নি।";

  const rawSources = extractSources(data);
  const seen = new Set();

  const sources = rawSources.filter(source => {
    if (!source.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, 10);

  return { reply, sources };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, {});
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, {
      ok: true,
      service: "LifePilot AI Backend"
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    try {
      const body = await getBody(req);

      if (!body.message || !String(body.message).trim()) {
        send(res, 400, {
          error: "Message is required."
        });
        return;
      }

      const result = await chat(
        String(body.message).trim(),
        Array.isArray(body.history) ? body.history : [],
        body.use_web === true
      );

      send(res, 200, result);
    } catch (error) {
      console.error(error);

      send(res, 500, {
        error: error.message || "Server error."
      });
    }

    return;
  }

  send(res, 404, {
    error: "Not found."
  });
});

server.listen(PORT, () => {
  console.log(`LifePilot AI Backend running on port ${PORT}`);
});
