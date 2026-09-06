require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const {
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  VERIFY_TOKEN,
  API_KEY,
  PORT = 3000,
} = process.env;

const GRAPH_API_VERSION = "v21.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    return res.status(200).send(challenge);
  }
  console.log("Webhook verification failed");
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const messages = value?.messages;
    if (messages && messages.length > 0) {
      for (const msg of messages) {
        const from = msg.from;
        const text = msg.text?.body;
        const type = msg.type;
        console.log(`New message from ${from} [${type}]:`, text || msg);
        if (type === "text") {
          await sendTextMessage(from, `Tumcha message milala: "${text}"`);
        }
      }
    }

    const statuses = value?.statuses;
    if (statuses && statuses.length > 0) {
      for (const s of statuses) {
        console.log(`Status update: message ${s.id} -> ${s.status}`);
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err.response?.data || err.message);
  }
});

async function sendTextMessage(to, body) {
  try {
    const resp = await axios.post(
      GRAPH_URL,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`Message sent to ${to}`);
    return { to, success: true, data: resp.data };
  } catch (err) {
    console.error(`Send failed to ${to}:`, err.response?.data || err.message);
    return { to, success: false, error: err.response?.data || err.message };
  }
}

function checkApiKey(req, res) {
  if (!API_KEY) return true;
  const key = req.headers["x-api-key"];
  if (key !== API_KEY) {
    res.status(401).json({ error: "Invalid or missing x-api-key header" });
    return false;
  }
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.post("/send-message", async (req, res) => {
  if (!checkApiKey(req, res)) return;
  const { to, message } = req.body;
  if (!to || !message) {
    return res.status(400).json({ error: "`to` and `message` are required" });
  }
  const result = await sendTextMessage(to, message);
  if (result.success) {
    res.json({ success: true, data: result.data });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

app.post("/send-bulk", async (req, res) => {
  if (!checkApiKey(req, res)) return;
  const { numbers, message, delayMs = 1000 } = req.body;
  if (!Array.isArray(numbers) || numbers.length === 0 || !message) {
    return res.status(400).json({
      error: "`numbers` (non-empty array) and `message` are required",
    });
  }
  const results = [];
  for (const to of numbers) {
    const result = await sendTextMessage(to, message);
    results.push(result);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
  const sent = results.filter((r) => r.success).length;
  const failed = results.length - sent;
  res.json({ total: results.length, sent, failed, results });
});

app.get("/", (_req, res) => {
  res.send("WhatsApp Cloud API bot is running");
});

app.listen(PORT, () => {
  console.log(`Server chalu zhala on port ${PORT}`);
});

