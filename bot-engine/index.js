// bot-engine/index.js

const { Boom } = require("@hapi/boom");
const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const express = require("express");
const dotenv = require("dotenv");
const { runAutomation } = require("./automation"); // Import Automation Script

dotenv.config();

const API_BASE_URL = process.env.LARAVEL_API_BASE_URL;
const API_TOKEN = process.env.API_TOKEN;
const NODE_WORKER_URL = "http://127.0.0.1:3000"; // Default port worker Node.js
const WORKER_PORT = 3000;

// --- 1. INISIALISASI AXIOS & EXPORT ---
// Instance Axios untuk komunikasi dengan Laravel API (dengan otorisasi)
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Authorization: `Bearer ${API_TOKEN}`,
    "Content-Type": "application/json",
  },
});

// EXPORT 'api' PERTAMA KALI UNTUK MENGHINDARI 'UNDEFINED' DI automation.js
module.exports = { api };

// --- 2. INISIALISASI EXPRESS WORKER API ---
const app = express();
app.use(express.json());

// Endpoint untuk menerima Job dari Laravel Queue
app.post("/start-automation", async (req, res) => {
  const registrationData = req.body;

  // F2.2: Validasi Data Masuk dari Laravel
  if (!registrationData || !registrationData.id || !registrationData.nik) {
    console.error("[WORKER API] Data pendaftaran tidak valid.");
    return res.status(400).json({ message: "Data pendaftaran tidak valid." });
  }

  console.log(
    `[API RECEIVED] Menerima Job untuk Reg ID: #${registrationData.id}`
  );

  // F2.4: Dispatch Job Otomatisasi
  // Kita jalankan runAutomation di latar belakang tanpa menunggu hasilnya
  // agar server Express bisa segera merespons 200 ke Laravel.
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

    // Beri respons cepat ke Laravel: Job berhasil diantrikan.
    return res
      .status(200)
      .json({
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

// Health check endpoint
app.get("/status", (req, res) => {
  res.json({
    status: "Node.js Worker API Running",
    time: new Date(),
    env: process.env.NODE_ENV,
  });
});

app.listen(WORKER_PORT, () => {
  console.log(`[WORKER] Node.js Worker Engine berjalan di port ${WORKER_PORT}`);
  // Cek koneksi API ke Laravel
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

// --- 3. F2.1: INISIALISASI BAILEYS (WhatsApp Bot) ---

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ["AntamBot", "Chrome", "1.0"],
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== 401;
      console.log("Koneksi ditutup. Perlu reconnect:", shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === "open") {
      console.log("WhatsApp Bot siap! Connected.");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // F2.1: Handler Pesan Masuk
  sock.ev.on("messages.upsert", async (m) => {
    // Logika WA Bot untuk menerima command 'daftar' dan mengirim ke Laravel API /api/queue-registration
    // (Akan diimplementasikan penuh di langkah selanjutnya)
    // Untuk saat ini, kita hanya fokus pada API Bridge

    if (process.env.NODE_ENV === "testing") {
      console.log(
        "[BOT-TESTING] Menerima pesan, tapi WA Bot dinonaktifkan di mode testing."
      );
    }
  });

  return sock;
}

// connectToWhatsApp();
// BAILEYS DINONAKTIFKAN di mode testing agar fokus pada WORKER API

// Kita tidak meng-*export* apa pun lagi selain `api`, jadi hapus duplikasi.
// Jika Anda ingin meng-*export* `sock` untuk keperluan notifikasi nanti:
// module.exports.sock = sock;
