/**
 * @file Tri SIM Card Status Checker
 * @module plugins/tools/tricheck
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure)
 */

import axios from 'axios';

async function checkTriStatus(msisdn) {
    const { data } = await axios.post("https://tri.co.id/api/v1/information/sim-status", {
        action: "MSISDN_STATUS_WEB",
        input1: "",
        input2: "",
        language: "ID",
        msisdn
    }, {
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36",
            "Origin": "https://tri.co.id",
            "Referer": "https://tri.co.id/"
        }
    });
    return data;
}

let handler = async (m, { sock, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*Tri SIM Checker*\n\n` +
            `*Gunakan:* ${usedPrefix + command} 62897xxxxxxx\n\n` +
            `📌 *Prefix Tri:* 0895, 0896, 0897, 0898, 0899\n` +
            `🌍 *Format:* Harus diawali 62 atau 08`
        );
    }

    // Normalisasi nomor ke format 62
    let msisdn = text.replace(/[^0-9]/g, '');
    if (msisdn.startsWith('08')) {
        msisdn = '62' + msisdn.slice(1);
    }

    // Validasi Prefix Tri
    const triPrefix = /^(6289[5-9])/;
    if (!triPrefix.test(msisdn)) {
        return m.reply(`❌ *Nomor tersebut bukan prefix SIM TRI (0895–0899).*`);
    }

    await global.loading(m, sock);

    try {
        const result = await checkTriStatus(msisdn);

        if (!result?.status || result.data?.responseCode !== "00000") {
            throw new Error("Nomor tidak valid atau tidak terdaftar di database Tri.");
        }

        const data = result.data;

        // Helper Emoji Status
        const getStatusEmoji = (status) => {
            const s = status?.toLowerCase() || '';
            if (s.includes('aktif')) return '✅';
            if (s.includes('non')) return '❌';
            if (s.includes('blok')) return '🔒';
            return '❓';
        };

        // Hitung Sisa Hari
        const now = new Date();
        const endDate = data.actEndDate ? new Date(data.actEndDate) : null;
        const remainingDays = endDate && !isNaN(endDate)
            ? Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)))
            : '-';

        let caption = `📡 *INFORMASI SIM CARD TRI*\n` +
            `═══════════════════\n\n` +
            `📱 *Nomor:* ${data.msisdn}\n` +
            `🆔 *ICCID:* ${data.iccid}\n\n` +
            `📊 *STATUS LAYANAN*\n` +
            `${getStatusEmoji(data.cardStatus)} *Kartu:* ${data.cardStatus}\n` +
            `${getStatusEmoji(data.activationStatus)} *Registrasi:* ${data.activationStatus}\n\n` +
            `📅 *MASA BERLAKU*\n` +
            `🟢 *Aktivasi:* ${data.activationDate || '-'}\n` +
            `🔴 *Berakhir:* ${data.actEndDate || '-'}\n` +
            `⏱️ *Sisa Waktu:* ${remainingDays} Hari\n\n` +
            `📦 *INFO PRODUK*\n` +
            `📦 *Produk:* ${data.prodDesc || '-'}\n` +
            `📍 *Wilayah:* ${data.retDistrict || '-'}\n\n` +
            `═══════════════════\n` +
            `🕒 _Update: ${new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}_`;

        await sock.sendMessage(m.chat, { text: caption }, { quoted: m });

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ['tricheck'];
handler.tags = ['internet'];
handler.command = /^(tricheck|cektri|tri|tricek)$/i;

export default handler;
