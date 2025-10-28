// bot-engine/index.js

const { Boom } = require("@hapi/boom");
const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const axios = require("axios");
const express = require("express");
const dotenv = require("dotenv");
const { runAutomation } = require("./automation"); // Import Automation Script
const qrcode = require("qrcode-terminal");

dotenv.config();

// --- Konfigurasi ---
const API_BASE_URL = process.env.LARAVEL_API_BASE_URL;
const API_TOKEN = process.env.API_TOKEN;
const WORKER_PORT = 3000;

// --- 1. INISIALISASI AXIOS (API Bridge ke Laravel) ---
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Authorization: `Bearer ${API_TOKEN}`,
    "Content-Type": "application/json",
  },
});

// EXPORT 'api' untuk digunakan di automation.js
module.exports = { api };

// --- 2. WORKER API (Menerima Job dari Laravel Queue) ---
const app = express();
app.use(express.json());

// Endpoint: Menerima Job dari Laravel Queue
app.post("/start-automation", async (req, res) => {
  const registrationData = req.body;

  if (!registrationData || !registrationData.id || !registrationData.nik) {
    console.error("[WORKER API] Data pendaftaran tidak valid.");
    return res.status(400).json({ message: "Data pendaftaran tidak valid." });
  }

  console.log(
    `[API RECEIVED] Menerima Job untuk Reg ID: #${registrationData.id}`
  );

  // Jalankan Otomatisasi di latar belakang (tanpa menunggu)
  try {
    runAutomation(registrationData, api)
      .then(() =>
        console.log(
          `[JOB END] Automation untuk #${registrationData.id} selesai.`
        )
      )
      .catch((err) =>
        console.error(
          `[JOB FAIL] Automation untuk #${registrationData.id} gagal total:`,
          err
        )
      );

    // Respon cepat ke Laravel: Job berhasil diantrikan
    return res.status(200).json({
      message: `Permintaan #${registrationData.id} berhasil diantrikan.`,
    });
  } catch (e) {
    console.error(
      `[WORKER ERROR] Gagal mengantrikan Job ke function: ${e.message}`
    );
    return res
      .status(500)
      .json({ message: "Gagal mengantrikan job otomatisasi." });
  }
});

// Endpoint: Health check
app.get("/status", (req, res) => {
  res.json({
    status: "Node.js Worker API Running",
    time: new Date(),
    env: process.env.NODE_ENV,
  });
});

app.listen(WORKER_PORT, () => {
  console.log(`[WORKER] Node.js Worker Engine berjalan di port ${WORKER_PORT}`);
  // Cek koneksi API ke Laravel saat startup
  api
    .get("/status")
    .then((response) =>
      console.log(
        `[API CHECK] Koneksi ke Laravel API berhasil. Status: ${response.data.status}`
      )
    )
    .catch((err) =>
      console.error(
        `[API CHECK FAILED] Gagal koneksi ke Laravel: ${err.message}. Pastikan Laravel berjalan di :8000.`
      )
    );
});

// --- 3. HELPER & STATE UNTUK BAILEYS ---

// State sementara untuk pendaftaran (Key: jid, Value: { step: '...' })
const registrationState = new Map();

/**
 * Mengirim pesan teks ke JID tertentu.
 */
async function sendTextMessage(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text: text });
  } catch (e) {
    console.error(`[WA ERROR] Gagal mengirim pesan ke ${jid}: ${e.message}`);
  }
}

/**
 * Mengirim data pendaftaran yang sudah divalidasi ke Laravel API Queue.
 */
async function sendToLaravelQueue(sock, jid, data) {
  try {
    await api.post("/queue-registration", data);

    await sendTextMessage(
      sock,
      jid,
      "✅ **Pendaftaran Anda berhasil diantrikan!**\n" +
        "Kami akan mulai memproses antrian Anda pada jam 08:00 WIB menggunakan data ini:\n\n" +
        `Nama: ${data.name}\nNIK: ${data.nik}\nButik: ${data.branch_code}\nTanggal: ${data.date_requested}\n\n` +
        "Kami akan menghubungi Anda kembali dengan Nomor Antrian setelah proses selesai."
    );
  } catch (error) {
    console.error(
      "[API FAILED] Gagal mengirim pendaftaran ke Laravel:",
      error.response?.data || error.message
    );
    await sendTextMessage(
      sock,
      jid,
      "❌ **Maaf, pendaftaran gagal diantrikan.**\n" +
        "Server backend sedang bermasalah. Silakan coba lagi sebentar atau hubungi admin."
    );
  }
}

// --- 4. BAILEYS INTEGRATION (WhatsApp Bot) ---

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
  const sock = makeWASocket({
    auth: state,
    browser: ["AntamBot", "Chrome", "1.0"],
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update; // ✅ tambahkan qr di sini

    if (qr) {
      console.log("\n===============================");
      console.log("🔗 Scan QR berikut untuk login WhatsApp:");
      qrcode.generate(qr, { small: true });
      console.log("===============================\n");
    }

    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== 401;
      console.log("Koneksi ditutup. Perlu reconnect:", shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === "open") {
      console.log("✅ WhatsApp Bot siap! Connected.");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // F2.1: Handler Pesan Masuk (Logika Ringkas 1-Baris Input)
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    // Abaikan pesan dari diri sendiri dan pesan yang bukan notifikasi
    if (!msg.key.fromMe && m.type === "notify") {
      const jid = msg.key.remoteJid;
      const userWaId = jid.split("@")[0];
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";
      const lowerText = text.toLowerCase().trim();

      let userState = registrationState.get(jid) || { step: "start" };

      // --- FSM (Finite State Machine) Logic ---

      // STEP 1: Mulai Pendaftaran
      if (lowerText === "daftar" && userState.step === "start") {
        registrationState.set(jid, { step: "wait_data" });
        await sendTextMessage(
          sock,
          jid,
          "✅ **MODE PENDAFTARAN AKTIF.**\n\n" +
            "Silakan balas dengan format ini (pisahkan data dengan tanda **|**):\n\n" +
            "**Nama Lengkap|NIK (16 Digit)|Butik Tujuan|Tanggal (YYYY-MM-DD)**\n\n" +
            "Contoh:\n" +
            "**Noval FTR|3603192309880004|BINTARO|2025-11-01**"
        );
        return;
      }

      // STEP 2: Menerima dan Memproses Data 1-Baris
      if (userState.step === "wait_data") {
        const parts = text.split("|").map((p) => p.trim());

        if (parts.length !== 4) {
          await sendTextMessage(
            sock,
            jid,
            "❌ **Format Salah.** Pastikan Anda memisahkan data dengan tanda **|** (pipe) dan ada 4 bagian. Silakan ulangi input Anda."
          );
          return;
        }

        const [name, nik, branchCode, dateRequested] = parts;

        // Validasi data penting
        if (nik.length !== 16 || isNaN(nik)) {
          await sendTextMessage(
            sock,
            jid,
            "❌ **NIK Salah.** NIK harus 16 digit angka. Silakan ulangi input Anda."
          );
          return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRequested)) {
          await sendTextMessage(
            sock,
            jid,
            "❌ **Format Tanggal Salah.** Gunakan format YYYY-MM-DD (Contoh: 2025-11-01). Silakan ulangi input Anda."
          );
          return;
        }

        // Data Valid: Kirim ke Laravel Queue
        const registrationData = {
          whatsapp_id: userWaId,
          name: name,
          nik: nik,
          branch_code: branchCode.toUpperCase(),
          date_requested: dateRequested,
        };

        await sendToLaravelQueue(sock, jid, registrationData);

        // Reset State ke Start
        registrationState.delete(jid);
        return;
      }

      // Pesan Default
      if (
        lowerText !== "daftar" &&
        lowerText !== "cekstatus" &&
        userState.step === "start"
      ) {
        await sendTextMessage(
          sock,
          jid,
          "Selamat datang di Bot Antam Queue. Ketik **'daftar'** untuk memulai pendaftaran antrian."
        );
      }
    }
  });

  return sock;
}

// AKTIVASI: Jalankan Baileys Bot setelah Worker API diinisialisasi
connectToWhatsApp();
