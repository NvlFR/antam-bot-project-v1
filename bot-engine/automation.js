// bot-engine/automation.js

const puppeteer = require("puppeteer");
const Tesseract = require("tesseract.js");

/**
 * Fungsi utama untuk menjalankan otomatisasi pendaftaran Antam.
 * @param {object} registrationData - Data pendaftaran dari database Laravel.
 * @param {object} api - Instance Axios untuk berkomunikasi kembali dengan Laravel.
 */
async function runAutomation(registrationData, api) {
  const { id, nik, branch_code, date_requested } = registrationData;

  console.log(
    `[WORKER] Menerima Job untuk Reg ID: #${id}. Memulai otomatisasi...`
  );

  // 1. Update status menjadi 'processing'
  try {
    await api.post("/update-result", {
      registration_id: id,
      status: "processing",
      notes: "Memulai proses otomatisasi Puppeteer.",
    });
  } catch (error) {
    console.error(
      `[API ERROR] Gagal update status ke processing untuk Reg ID #${id}.`
    );
    // Lanjutkan, karena update status ini tidak kritis
  }

  let browser;
  let finalStatus = "failed";
  let finalNotes = "Gagal tak terduga sebelum Puppeteer selesai.";
  let queueNumber = null;

  try {
    // --- F3.1: Setup Puppeteer ---
    browser = await puppeteer.launch({
      headless: true, // Ubah ke false jika ingin melihat prosesnya
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        // Nanti, di Phase 4: Tambahkan Mobile Proxy di sini
      ],
      // Jika Anda menggunakan Chromium Path tertentu, tambahkan:
      // executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Simulasikan navigasi ke halaman Antam (Ganti dengan URL Asli Antam)
    console.log(`[PUPPETEER] Navigasi ke halaman pendaftaran...`);
    await page.goto("https://mock-antam-queue-site.com/register", {
      waitUntil: "networkidle0",
      timeout: 60000,
    });

    // --- F3.2: Logika Pengisian Form dan CAPTCHA ---
    // Implementasi Mock/Simulasi pendaftaran sukses

    // Isi NIK
    await page.type("#nik-input", nik, { delay: 50 });

    // Pilih Butik
    await page.select("#branch-select", branch_code);

    // Isi Tanggal
    await page.type("#date-input", date_requested);

    // --- Implementasi CAPTCHA (Simulasi OCR) ---

    // 1. Ambil screenshot CAPTCHA element (simulasi)
    // const captchaElement = await page.$('#captcha-image');
    // const captchaPath = `./captcha_${id}.png`;
    // await captchaElement.screenshot({ path: captchaPath });

    // 2. Decode CAPTCHA (menggunakan Tesseract.js)
    // const { data: { text } } = await Tesseract.recognize(captchaPath, 'eng');
    // const captchaText = text.trim().replace(/\s/g, '');

    const captchaText = "12345"; // MOCK CAPTCHA

    console.log(`[OCR] CAPTCHA Decoded: ${captchaText}`);
    await page.type("#captcha-input", captchaText);

    // Klik Submit
    await page.click("#submit-button");

    // Tunggu hasil (simulasi hasil antrian)
    await page.waitForSelector("#success-message", { timeout: 30000 });

    // Dapatkan nomor antrian (simulasi)
    queueNumber = `A${Math.floor(Math.random() * 90000) + 10000}`;
    finalStatus = "success";
    finalNotes = `Pendaftaran berhasil. Nomor antrian didapat: ${queueNumber}`;

    console.log(
      `[SUCCESS] Reg ID #${id} berhasil. Nomor Antrian: ${queueNumber}`
    );
  } catch (error) {
    finalStatus = "failed";
    finalNotes = `[AUTOMATION ERROR] Gagal saat pendaftaran: ${error.message}`;
    console.error(finalNotes);
  } finally {
    if (browser) {
      await browser.close();
    }

    // --- F3.5: Laporan Hasil ke Laravel ---
    console.log(
      `[API BRIDGE] Melaporkan hasil #${id} (${finalStatus}) ke Laravel...`
    );
    try {
      const response = await api.post("/update-result", {
        registration_id: id,
        status: finalStatus,
        queue_number: queueNumber,
        notes: finalNotes.substring(0, 500), // Batasi panjang notes
      });
      console.log(`[API SUCCESS] Laporan untuk Reg ID #${id} sukses.`);
    } catch (error) {
      // Ini adalah ERROR KRITIS karena Node.js tidak bisa berkomunikasi dengan Laravel
      console.error(
        `[CRITICAL ERROR] Gagal melaporkan hasil #${id} ke Laravel: ${error.message}`
      );
    }
  }
}

module.exports = { runAutomation };
