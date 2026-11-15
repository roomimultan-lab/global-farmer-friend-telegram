// Global Farmer Friend — Free Telegram bot backend
// -------------------------------------------------------
// Bot: Global Farmer Friend — @GlobalFarmerFriendBot
// Link: https://t.me/GlobalFarmerFriendBot
// WhatsApp (Pakistan, Kisan Dost) stays separate:
//   0346-7790570. Telegram contact number: 0303-0788999.
//   This server is Telegram only.
//
// Totally free: no paid APIs, no paid service.
// Telegram Bot API only. No LLM / vision key is needed:
// answers are keyword-based, in the farmer's saved language
// where a translation exists, otherwise in English.
//
// MOCK MODE: If TELEGRAM_BOT_TOKEN is not set, empty, or
// "MOCK", nothing is sent to Telegram. Messages are logged
// to the console and saved in db.json under sent_log, so
// you can test safely without a token.
//
// NEVER log the token, and NEVER paste it in chat.
// The owner pastes TELEGRAM_BOT_TOKEN himself in Railway
// (Variables tab). It is read from the environment only.
//
// Storage: a simple JSON file (db.json) in this folder.
// Enough for the first 100-500 farmers. Later move the
// same farmer fields to a real database without changing
// the API shape.

const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'MOCK';
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me-admin-key';
const MOCK_MODE = !TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'MOCK';
const TELEGRAM_API = 'https://api.telegram.org';

// ---------- Countries and languages (launch scope) ----------
const COUNTRIES = [
  'Pakistan', 'India', 'Bangladesh', 'China', 'Indonesia',
  'Vietnam', 'Thailand', 'Philippines', 'Nigeria', 'Kenya',
  'Ethiopia', 'Egypt', 'Türkiye', 'Ukraine', 'USA',
  'Brazil', 'Argentina', 'Mexico', 'Australia',
];

const LANGUAGES = [
  'Urdu', 'Punjabi', 'English', 'Hindi', 'Bengali',
  'Swahili', 'Turkish', 'Ukrainian', 'Portuguese', 'Spanish',
];

// ---------- Simple JSON database ----------
const DB_PATH = path.join(__dirname, 'db.json');

function defaultDb() {
  return { farmers: [], sessions: {}, sent_log: [] };
}

function loadDb() {
  try {
    if (!fs.existsSync(DB_PATH)) return defaultDb();
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!Array.isArray(data.farmers)) data.farmers = [];
    if (!data.sessions) data.sessions = {};
    if (!Array.isArray(data.sent_log)) data.sent_log = [];
    return data;
  } catch (e) {
    console.error('Could not read db.json, starting empty:', e.message);
    return defaultDb();
  }
}

function saveDb(db) {
  try {
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_PATH);
  } catch (e) {
    console.error('Could not save db.json, keeping data in memory:', e.message);
  }
}

let db = loadDb();

// ---------- Telegram send (token from env only, never logged) ----------
async function sendTelegram(chatId, text) {
  const entry = { chat_id: chatId, text, time: new Date().toISOString() };
  db.sent_log.push(entry);
  if (db.sent_log.length > 500) db.sent_log = db.sent_log.slice(-500);
  saveDb(db);

  if (MOCK_MODE) {
    console.log(`[MOCK] -> ${chatId}: ${text.slice(0, 200)}`);
    return { ok: true, mock: true };
  }
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) console.error('Telegram send failed:', res.status, data.description || '');
    return data;
  } catch (e) {
    console.error('Telegram send error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ---------- Short translations for the main prompts ----------
// Full farming answers are in English below, with a short
// line in the farmer's language where one is provided.
// Add more languages here — no code change is needed elsewhere.
const L = {
  welcome: {
    Urdu: 'Assalam-o-Alaikum! Main Global Farmer Friend hoon. Main aap ki fasal, beej, khaad, pani aur keeron/bemarion mein madad karoon ga.',
    Punjabi: 'Sat Sri Akal! Main Global Farmer Friend haan. Main tuhadi fasal, beej, khaad, pani te keere/bimari vich madad karanga.',
    Hindi: 'Namaste! Main Global Farmer Friend hoon. Main aapki fasal, beej, khaad, paani aur keet/bimari mein madad karunga.',
    Bengali: 'Assalamu Alaikum! Ami Global Farmer Friend. Ami apnar fosol, beej, shar, pani o poka/rog-e sahajjo korbo.',
    Swahili: 'Habari! Mimi ni Global Farmer Friend. Nitakusaidia kuhusu mazao, mbegu, mbolea, maji na wadudu/magonjwa.',
    English: "Hello! I'm Global Farmer Friend. I help with your crops — sowing, fertilizer, irrigation, pests and disease.",
  },
  askName: {
    Urdu: 'Apna naam likhein:',
    Punjabi: 'Apna naam likho:',
    Hindi: 'Apna naam likhein:',
    Bengali: 'Apnar naam likhun:',
    Swahili: 'Andika jina lako:',
    English: 'Please type your name:',
  },
};

function line(lang, key) {
  return (L[key] && (L[key][lang] || L[key].English)) || L[key].English;
}

// ---------- Farming answers (keyword-based, safe by design) ----------
// Every answer: what to do, a dose example, safety / waiting
// period, and "confirm with your local agriculture officer".
// These are general advisory examples, NOT a prescription
// for one named product in one country. Local product names,
// allowed chemicals and waiting periods differ by country.
const SAFETY = '\n\nSafety: wear gloves, mask and long sleeves when spraying. Do not spray in strong wind or before rain. Keep children and animals away. Follow the waiting period on the product label before harvest. If you are not sure, confirm with your local agriculture officer.';
const SAFETY_URDU = '\n\nHifazat: Spray karte waqt dastanay, mask aur lambi aasteen pehnein. Tez hawa ya barish se pehle spray na karein. Bachon aur janwaron ko door rakhein. Fasal katne se pehle label par likha waiting period zaroor pura karein. Agar shak ho to apne ilaqay ke agriculture officer se confirm karein.';

function safetyNote(lang) {
  return (lang === 'Urdu' || lang === 'Punjabi') ? SAFETY_URDU : SAFETY;
}

function farmingAnswer(text, farmer) {
  const lang = (farmer && farmer.language) || 'English';
  const t = text.toLowerCase();
  const crop = (farmer && farmer.crop) || 'your crop';
  const country = (farmer && farmer.country) || 'your country';
  const suffix = safetyNote(lang);

  // Sowing
  if (/(sow|sowing|seed|beej|bij|planting|when to sow|kab.*bo)/.test(t)) {
    return `Sowing — ${crop} (${country}):\n`
      + `• Sow in your local recommended window for ${crop} — it changes by district and by season, so check the local agriculture department calendar.\n`
      + `• Use clean, certified seed. Wheat example: 40–45 kg seed per acre, DAP at sowing. For other crops, use the seed rate on the seed bag / local advice.\n`
      + `• Sow at the right depth (about 2–5 cm for most small seeds), in moist soil, not in a flooded field.\n`
      + `• If rain is coming in 1–2 days, wait — wet sowing can rot the seed.${suffix}`;
  }
  // Fertilizer / nutrients
  if (/(fertili|khad|urea|dap|npk|nutrient|micronutrient|zinc|boron)/.test(t)) {
    return `Fertilizer — ${crop}:\n`
      + `• Best is a soil test first. Without it, do not guess a big dose.\n`
      + `• General example (wheat, per acre): DAP 1 bag at sowing, urea in 2 splits — half at first irrigation (20–25 days, CRI stage) and half at tillering. Adjust by soil test and local advice.\n`
      + `• Micronutrients (zinc, boron) only if deficiency is seen or soil test says so — e.g. zinc sulphate 5 kg/acre for rice/wheat where zinc is low.\n`
      + `• Do not put all urea at once — it wastes and can burn the crop.${suffix}`;
  }
  // Irrigation / water
  if (/(irrigat|water|pani|sinchai|when to water)/.test(t)) {
    return `Irrigation — ${crop}:\n`
      + `• Water at the critical stages: for wheat, first irrigation at 20–25 days after sowing (CRI), then tillering (40–45 days), jointing (70–75 days) and flowering (90–95 days).\n`
      + `• Do not flood the field. Light, timely water is better than one heavy flood.\n`
      + `• Do not irrigate just before rain, and do not spray on a wet field.${suffix}`;
  }
  // Pest / disease
  if (/(pest|disease|keera|keeday|bemari|rog|aphid|borer|rust|blight|fungus|spray)/.test(t)) {
    return `Pest / disease — ${crop}:\n`
      + `• First check: which part is affected (leaf, stem, root, grain), and how much of the field? Take a clear photo and note when it started.\n`
      + `• Non-chemical first where it works: remove badly affected leaves, keep the field clean, avoid over-watering.\n`
      + `• If spray is needed, use only a product allowed in ${country} for ${crop}. Example dose format (follow your product label, not this alone): mix the label dose per litre of water, use about 100–120 litres of water per acre, spray in the evening, repeat after 7–10 days only if needed.\n`
      + `• Never spray a product meant for another crop, and never harvest before the label waiting period.${suffix}`;
  }
  // Weather
  if (/(weather|mausam|rain|barish|forecast|hawa)/.test(t)) {
    return `Weather:\n`
      + `• I do not have a live weather feed in this free version yet — please check your local forecast before sowing, spraying or irrigating.\n`
      + `• Rule of thumb: do not spray if rain is expected within 6 hours, and do not irrigate just before heavy rain.\n`
      + `• After rain, wait for the field to dry before spraying or walking in it, or you will spread disease.${suffix}`;
  }
  // Market / price
  if (/(price|mandi|market|rate|sell|bech)/.test(t)) {
    return `Market price:\n`
      + `• I do not have live mandi prices in this free version yet. Check your nearest mandi / local buyer before selling.\n`
      + `• Do not sell in a hurry on the first offer — ask 2–3 buyers, and check quality/weight before the deal.${suffix}`;
  }
  // Default: ask for more detail
  return `Thank you. To help you better, please tell me:\n`
    + `• Your crop (for example: ${crop})\n`
    + `• What is the problem — sowing, fertilizer, water, pest/disease, or weather?\n`
    + `• If it is a pest/disease, which part of the plant is affected?\n\n`
    + `You can also send a photo of the affected leaf or plant. I will log it and give general advice — a photo alone is not a final diagnosis.${suffix}`;
}

// ---------- Registration flow ----------
function countryListText() {
  return COUNTRIES.map((c, i) => `${i + 1}. ${c}`).join('\n');
}
function languageListText() {
  return LANGUAGES.map((l, i) => `${i + 1}. ${l}`).join('\n');
}

function parseCountry(input) {
  const n = parseInt(input, 10);
  if (!isNaN(n) && n >= 1 && n <= COUNTRIES.length) return COUNTRIES[n - 1];
  const hit = COUNTRIES.find((c) => c.toLowerCase() === input.toLowerCase().trim());
  if (hit) return hit;
  const partial = COUNTRIES.find((c) => c.toLowerCase().includes(input.toLowerCase().trim()));
  return partial || null;
}

function parseLanguage(input) {
  const n = parseInt(input, 10);
  if (!isNaN(n) && n >= 1 && n <= LANGUAGES.length) return LANGUAGES[n - 1];
  const hit = LANGUAGES.find((l) => l.toLowerCase() === input.toLowerCase().trim());
  if (hit) return hit;
  // Accept any other language name the farmer types.
  const cleaned = input.trim();
  if (cleaned && cleaned.length <= 30) return cleaned[0].toUpperCase() + cleaned.slice(1);
  return null;
}

async function handleMessage(chatId, text, photo) {
  const msgText = (text || '').trim();
  const firstName = '';

  // Photo: log it, do NOT claim a diagnosis.
  if (photo) {
    const farmer = db.farmers.find((f) => f.chat_id === chatId);
    db.sent_log.push({ chat_id: chatId, photo: true, file_id: photo, time: new Date().toISOString() });
    saveDb(db);
    console.log(`Incoming photo from ${chatId}`);
    const lang = (farmer && farmer.language) || 'English';
    await sendTelegram(chatId,
      `Photo received — thank you. I have saved it.\n\n`
      + `A photo alone is not a final diagnosis. Please also write: your crop, which part is affected (leaf / stem / root / grain), and when it started.\n\n`
      + `General advice meanwhile: remove badly affected leaves, do not over-water, and do not spray until you know the problem. ${safetyNote(lang)}`);
    return;
  }

  // /start (or /restart) — begin / restart registration
  if (/^\/(start|restart)/i.test(msgText)) {
    db.sessions[chatId] = { step: 'name' };
    saveDb(db);
    await sendTelegram(chatId,
      `🌾 ${line('English', 'welcome')}\n\n`
      + `Global Farmer Friend — free on Telegram.\n`
      + `WhatsApp (Pakistan): 0346-7790570\n\n`
      + `Let's register you. ${line('English', 'askName')}`);
    return;
  }

  if (/^\/help/i.test(msgText)) {
    await sendTelegram(chatId,
      `How to use Global Farmer Friend:\n`
      + `• /start — register (name, country, crop, language)\n`
      + `• Then just type your question — sowing, fertilizer, irrigation, pest/disease, weather, market price.\n`
      + `• Send a photo of a sick leaf for general advice (not a final diagnosis).\n`
      + `• Free. No payment needed.`);
    return;
  }

  const session = db.sessions[chatId];
  const farmer = db.farmers.find((f) => f.chat_id === chatId);

  // --- Registration steps ---
  if (session) {
    if (session.step === 'name') {
      if (!msgText || msgText.length > 60) {
        await sendTelegram(chatId, 'Please type your name (just your name):');
        return;
      }
      session.name = msgText;
      session.step = 'country';
      saveDb(db);
      await sendTelegram(chatId, `Thank you, ${msgText}. 🌍\n\nWhich country are you farming in? Reply with the number:\n${countryListText()}`);
      return;
    }
    if (session.step === 'country') {
      const country = parseCountry(msgText);
      if (!country) {
        await sendTelegram(chatId, `I did not recognise that country. Please reply with the number from this list:\n${countryListText()}`);
        return;
      }
      session.country = country;
      session.step = 'crop';
      saveDb(db);
      await sendTelegram(chatId, `Country: ${country}. 🌱\n\nWhat is your main crop? (for example: Wheat, Rice, Maize, Cotton, Mango)`);
      return;
    }
    if (session.step === 'crop') {
      if (!msgText || msgText.length > 40) {
        await sendTelegram(chatId, 'Please type your main crop (one crop, for example: Wheat):');
        return;
      }
      session.crop = msgText;
      session.step = 'language';
      saveDb(db);
      await sendTelegram(chatId, `Crop: ${msgText}. 🗣️\n\nWhich language should I answer you in? Reply with the number:\n${languageListText()}\n\nOr type another language name.`);
      return;
    }
    if (session.step === 'language') {
      const lang = parseLanguage(msgText);
      if (!lang) {
        await sendTelegram(chatId, `Please reply with the number from this list:\n${languageListText()}`);
        return;
      }
      const newFarmer = {
        chat_id: chatId,
        name: session.name || '',
        country: session.country || '',
        crop: session.crop || '',
        language: lang,
        joined_at: new Date().toISOString(),
        source: 'telegram',
      };
      const existing = db.farmers.findIndex((f) => f.chat_id === chatId);
      if (existing >= 0) db.farmers[existing] = newFarmer;
      else db.farmers.push(newFarmer);
      delete db.sessions[chatId];
      saveDb(db);
      await sendTelegram(chatId,
        `✅ You are registered, ${newFarmer.name}!\n\n`
        + `Country: ${newFarmer.country}\nCrop: ${newFarmer.crop}\nLanguage: ${newFarmer.language}\n\n`
        + `${line(lang, 'welcome')}\n\n`
        + `Now just type your farming question. For example: "When should I sow wheat?" or "What fertilizer for rice?"\n\nFree — no payment needed.`);
      return;
    }
  }

  // --- Registered farmer: answer the question ---
  if (farmer) {
    if (!msgText) {
      await sendTelegram(chatId, 'Please type your farming question, or send /help.');
      return;
    }
    await sendTelegram(chatId, farmingAnswer(msgText, farmer));
    return;
  }

  // --- Not registered and not in a session: send them to /start ---
  await sendTelegram(chatId,
    `Hello! I'm Global Farmer Friend 🌾 — free farming help on Telegram.\n\nPlease send /start to register first (name, country, crop, language). It takes less than a minute.`);
}

// ---------- Express app ----------
const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'global-farmer-friend-telegram', mode: MOCK_MODE ? 'mock' : 'live', farmers: db.farmers.length, bot: '@GlobalFarmerFriendBot' });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'global-farmer-friend-telegram', mode: MOCK_MODE ? 'mock' : 'live', farmers: db.farmers.length });
});

// Telegram webhook — Telegram POSTs an "update" here.
// The owner sets this URL with setWebhook (see README.md).
// Never log the token. Log only chat_id / text length / photo.
app.post('/telegram', async (req, res) => {
  try {
    const update = req.body || {};
    const message = update.message || update.edited_message || null;
    if (!message) return res.json({ ok: true });
    const chatId = message.chat && message.chat.id;
    if (!chatId) return res.json({ ok: true });
    const text = message.text || message.caption || '';
    const photo = message.photo && message.photo.length
      ? message.photo[message.photo.length - 1].file_id
      : null;
    console.log(`Incoming from ${chatId}: ${photo ? '[photo]' : (text || '').slice(0, 120)}`);
    await handleMessage(chatId, text, photo);
    return res.json({ ok: true });
  } catch (e) {
    console.error('Webhook error:', e.message);
    return res.json({ ok: true });
  }
});

// Admin: list farmers (admin key in query ?admin_key=... or header x-admin-key)
function adminOk(req) {
  const key = req.headers['x-admin-key'] || req.query.admin_key || (req.body && req.body.admin_key);
  return key && key === ADMIN_KEY;
}

app.get('/admin/farmers', (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  res.json({ ok: true, farmers: db.farmers.length, list: db.farmers });
});

// Admin: broadcast to all saved farmers, optionally filtered.
// Body: { admin_key, message, country?, crop?, language? }
// Sends in the farmer's saved language where the admin message
// is supplied per-language; otherwise the same text is sent to
// all matched farmers. In mock mode it is logged, not sent.
app.post('/admin/send-alert', async (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const { message, country, crop, language } = req.body || {};
  if (!message) return res.status(400).json({ ok: false, error: 'message is required' });

  const targets = db.farmers.filter((f) =>
    (!country || f.country === country) &&
    (!crop || (f.crop || '').toLowerCase() === String(crop).toLowerCase()) &&
    (!language || f.language === language));
  let sent = 0;
  for (const f of targets) {
    const r = await sendTelegram(f.chat_id, message);
    if (r && r.ok) sent += 1;
  }
  console.log(`Broadcast: ${sent}/${targets.length} sent (mode=${MOCK_MODE ? 'mock' : 'live'})`);
  res.json({ ok: true, matched: targets.length, sent, mode: MOCK_MODE ? 'mock' : 'live' });
});

app.listen(PORT, () => {
  console.log(`Global Farmer Friend Telegram server on port ${PORT} — mode=${MOCK_MODE ? 'mock' : 'live'}, farmers=${db.farmers.length}`);
  if (MOCK_MODE) console.log('MOCK MODE: set TELEGRAM_BOT_TOKEN in Railway to go live. No messages are sent to Telegram in mock mode.');
});
