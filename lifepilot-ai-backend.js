// LifePilot AI - Groq Backend
// Node.js 18+

const http = require("http");

const PORT = Number(process.env.PORT || 8787);
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

function sendJson(res, status, data) {
  const body = JSON.stringify(data);

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });

  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 1000000) {
        req.destroy();
        reject(new Error("Request too large"));
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function askGroq(messages) {
  return new Promise((resolve, reject) => {
    if (!GROQ_API_KEY) {
      reject(new Error("GROQ_API_KEY is missing"));
      return;
    }

    const data = JSON.stringify({
      model: MODEL,
      messages: messages,
      temperature: 0.7,
      max_tokens: 2048
    });

    const request = https.request(
      {
        hostname: "api.groq.com",
        path: "/openai/v1/chat/completions",
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data)
        }
      },
      response => {
        let result = "";

        response.on("data", chunk => {
          result += chunk;
        });

        response.on("end", () => {
          try {
            const json = JSON.parse(result);

            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(
                new Error(
                  json?.error?.message ||
                  `Groq API error: ${response.statusCode}`
                )
              );
              return;
            }

            const reply =
              json?.choices?.[0]?.message?.content ||
              "দুঃখিত, আমি এখন উত্তর দিতে পারছি না।";

            resolve(reply);
          } catch (error) {
            reject(new Error("Invalid response from Groq"));
          }
        });
      }
    );

    request.on("error", reject);
    request.write(data);
    request.end();
  });
}

const https = require("https");

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "LifePilot AI",
      provider: "Groq",
      model: MODEL
    });
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    sendJson(res, 200, {
      ok: true,
      service: "LifePilot AI Backend",
      status: "running"
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    try {
      const raw = await readBody(req);

      let body;

      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, {
          error: "Invalid JSON"
        });
        return;
      }

      const message =
        typeof body.message === "string"
          ? body.message.trim()
          : "";

      if (!message) {
        sendJson(res, 400, {
          error: "Message is required"
        });
        return;
      }

      let history = Array.isArray(body.history)
        ? body.history
        : [];

      history = history
        .filter(item =>
          item &&
          typeof item.role === "string" &&
          typeof item.content === "string"
        )
        .slice(-20);

      const messages = [
        {
          role: "system",
          content:
            "তুমি LifePilot AI-এর ব্যক্তিগত AI assistant। " +
            "ব্যবহারকারীর ভাষায় উত্তর দেবে। ব্যবহারকারী বাংলা লিখলে বাংলায় উত্তর দেবে। " +
            "তুমি সাধারণ প্রশ্নের উত্তর, ব্যাখ্যা, লেখা, পরিকল্পনা, পড়াশোনা, সমস্যা সমাধান, " +
            "আইডিয়া, কোড এবং দৈনন্দিন কাজে সাহায্য করবে। " +
            "উত্তর পরিষ্কার, উপকারী এবং স্বাভাবিক রাখবে। " +
            "তুমি কোনো কাজ বাস্তবে করে ফেলেছ বলে মিথ্যা দাবি করবে না।"
        }
      ];

      for (const item of history) {
        const role =
          item.role === "assistant" ? "assistant" : "user";

        messages.push({
          role,
          content: item.content.slice(0, 10000)
        });
      }

      messages.push({
        role: "user",
        content: message
      });

      const reply = await askGroq(messages);

      sendJson(res, 200, {
        reply,
        sources: []
      });

    } catch (error) {
      console.error("CHAT ERROR:", error);

      sendJson(res, 500, {
        error: "AI server error",
        message: error.message
      });
    }

    return;
  }

  sendJson(res, 404, {
    error: "Not found"
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`LifePilot AI running on port ${PORT}`);
});
