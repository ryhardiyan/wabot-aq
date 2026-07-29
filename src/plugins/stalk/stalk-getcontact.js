/**
 * @file Getcontact Paid Stalker with QRIS Payment Tracking
 * @module plugins/tools/gtcpay
 * @license Apache-2.0
 * @author RyharDev (Scraper & Gateway) & Gemini (Structure)
 */

import axios from 'axios';

const GTC_BASE_URL = 'https://gtc.topupcuy.com/api/v1';
const QRIS_BASE_URL = 'https://qris.topupcuy.com';

global.gtcSession = global.gtcSession || {};

const COMMON_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

/**
 * Memeriksa status pembayaran QRIS ke server internal
 * @param {number|string} nominal 
 * @returns {Promise<string>} status ('belum_bayar' atau 'sukses')
 */
async function checkQrisPaymentStatus(nominal) {
    try {
        const response = await axios.get(`${QRIS_BASE_URL}/api/deposit-status?nominal=${nominal}`, { headers: COMMON_HEADERS });
        return response.data?.status || 'belum_bayar';
    } catch {
        return 'belum_bayar';
    }
}

async function initiateGtcCheck(phoneNumber, apiKey) {
    const response = await axios.post(`${GTC_BASE_URL}/check`, {
        number: phoneNumber,
        strategy: 'smart',
        wait: false
    }, {
        headers: { ...COMMON_HEADERS, 'x-api-key': apiKey }
    });
    return response.data?.transaction_id || response.data?.trx_id;
}

async function pollGtcStatus(transactionId, apiKey) {
    const response = await axios.get(`${GTC_BASE_URL}/status/${transactionId}`, {
        headers: { 'x-api-key': apiKey }
    });
    return response.data;
}

let handler = async (m, { sock, text, usedPrefix, command }) => {
    const userId = m.sender;
    const getContactApiKey = "gtc_bacbe486dbbee12d368c1bb734536b72ff2099ce94713b43cbd900b1da54";

    if (!getContactApiKey) {
        return m.reply('⚠️ *Error:* API Key Getcontact (`GETCONTACT_API_KEY`) belum diatur di file .env bot.');
    }

    // ---------------- [ ALUR 2: VERIFIKASI PEMBAYARAN ("udah pay") ] ----------------
    if (command === 'paygtc') {
        const userSession = global.gtcSession[userId];
        if (!userSession) {
            return m.reply(`❌ *Tidak Ada Sesi:* Kamu tidak memiliki antrean pembayaran aktif. Silakan ketik *${usedPrefix}gtc [nomor]* terlebih dahulu.`);
        }

        if (typeof global.loading === 'function') await global.loading(m, sock);

        try {
            // Cek real-time ke gateway QRIS
            const paymentStatus = await checkQrisPaymentStatus(userSession.amount);

            if (paymentStatus === 'sukses' || paymentStatus === 'success') {
                await m.reply('✅ *Pembayaran Diterima!* Memulai pemrosesan pencarian nomor Getcontact, mohon tunggu...');
                
                const targetNumber = userSession.targetNumber;
                // Hapus sesi agar tidak disalahgunakan ulang
                delete global.gtcSession[userId];

                // Jalankan Core Getcontact Stalker (Sama seperti fitur sebelumnya)
                const transactionId = await initiateGtcCheck(targetNumber, getContactApiKey);
                if (!transactionId) return m.reply('❌ *Server Error:* Gagal mendapatkan ID Transaksi dari Getcontact.');

                let isSuccess = false;
                let finalData = null;

                for (let i = 0; i < 20; i++) {
                    await new Promise(res => setTimeout(res, 3000));
                    const statusData = await pollGtcStatus(transactionId, getContactApiKey);
                    if (statusData.status?.toLowerCase() === 'sukses') {
                        finalData = statusData.data;
                        isSuccess = true;
                        break;
                    } else if (statusData.status?.toLowerCase() === 'gagal') {
                        return m.reply('❌ *Scraping Gagal:* Getcontact gagal memecahkan captcha untuk nomor ini.');
                    }
                }

                if (!isSuccess || !finalData) return m.reply('⏳ *Timeout:* Proses pencarian memakan waktu terlalu lama.');

                // Tampilkan Hasil
                const totalTags = finalData.tags?.length || 0;
                const profile = finalData.profile || {};
                const tagsList = finalData.tags?.slice(0, 100).map((t, idx) => `${idx + 1}. ${t}`).join('\n') || '-';

                let reportText = `🔍 *GETCONTACT PREMIUM REPORT*\n\n` +
                    `👤 *Nama:* ${profile.name || 'Tidak Diketahui'}\n` +
                    `📱 *Nomor:* ${targetNumber}\n` +
                    `📊 *Total Tag:* ${totalTags}\n\n` +
                    `📌 *DAFTAR TAGAR (Top 100):*\n${tagsList}`;

                await sock.sendMessage(m.chat, { text: reportText }, { quoted: m });
                
                // Donasi Statis
                return await m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`);

            } else {
                return m.reply('❌ *Pembayaran Belum Masuk:* Saldo untuk nominal ini belum terdeteksi. Silakan transfer terlebih dahulu sesuai QRIS.');
            }
        } catch (e) {
            return m.reply(`⚠️ *Error:* Gagal mengecek status (${e.message})`);
        } finally {
            if (typeof global.loading === 'function') await global.loading(m, sock, true);
        }
    }

    // ---------------- [ ALUR 1: GENERATE ORDER & QRIS ] ----------------
    let inputNumber = text ? text.replace(/\D/g, '') : '';
    if (!inputNumber && m.quoted) inputNumber = m.quoted.text ? m.quoted.text.replace(/\D/g, '') : '';
    if (inputNumber.startsWith('62')) inputNumber = '0' + inputNumber.slice(2);

    if (!inputNumber || !/^08\d{8,13}$/.test(inputNumber)) {
        return m.reply(`🔍 *Getcontact Premium (Bayar otomatis)*\n\n*Gunakan:* ${usedPrefix + command} [nomor_hp]\n📌 *Contoh:* ${usedPrefix + command} 08123456789`);
    }

    const fixedAmount = 700; // Dikunci wajib 700 rupiah
    const qrisUrl = `${QRIS_BASE_URL}/qris/dana/${fixedAmount}`;

    // Simpan data ke session temporary
    global.gtcSession[userId] = {
        targetNumber: inputNumber,
        amount: fixedAmount,
        createdAt: Date.now()
    };

    let paymentInstruction = `💳 *GETCONTACT PAYMENT ORDER*\n\n` +
        `Untuk mencari nomor *${inputNumber}*, silahkan lakukan pembayaran terlebih dahulu.\n\n` +
        `💵 *Nominal Wajib:* Rp ${fixedAmount} (Pas)\n` +
        `⏳ *Masa Berlaku:* 5 Menit\n\n` +
        `📌 *Langkah Pembayaran:*\n` +
        `1. Scan QRIS yang dikirimkan bot menggunakan E-Wallet pilihanmu.\n` +
        `2. Jika sudah sukses membayar, ketik perintah: *${usedPrefix}paygtc*\n\n` +
        `⚠️ _Pesanan otomatis hangus dalam 5 menit jika tidak dibayar._`;

    // Kirim QRIS berupa gambar langsung dari URL server via Baileys
    await sock.sendMessage(m.chat, {
        image: { url: qrisUrl },
        caption: paymentInstruction
    }, { quoted: m });

    // ---------------- [ ALUR 3: EXPIRY TIMER (5 MENIT) ] ----------------
    setTimeout(() => {
        // Cek apakah sesinya masih ada atau sudah dihapus karena sukses/sudah bayar
        if (global.gtcSession[userId] && global.gtcSession[userId].targetNumber === inputNumber) {
            delete global.gtcSession[userId];
            sock.sendMessage(userId, { text: `⏰ *Waktu Habis:* Sesi pembayaran Getcontact untuk nomor ${inputNumber} telah kedaluwarsa (Lebih dari 5 menit).` });
        }
    }, 5 * 60 * 1000); // 5 menit dalam milidetik
};

handler.help = ['getcontact'];
handler.tags = ['stalk'];
//handler.command = /^(gtc|getcontact)$/i;

export default handler;
