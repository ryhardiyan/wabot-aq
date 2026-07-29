/**
 * @file TikTok Profile Stalker / Music Identifier / Google Translate
 * @module plugins/tools/
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure)
 */

import axios from 'axios';

// ==================== [ SCRAPER FUNCTIONS ] ====================

async function listLanguage() {
    try {
        const res = await axios.get(
            "https://translate.google.com/translate_a/l?client=webapp&sl=auto&tl=en&v=1.0&hl=en&pv=1&tk=&source=bh&ssel=0&tsel=0&kc=1&tk=626515.626515&q="
        );
        const data = res.data.sl;
        return Object.entries(data).map(([code, name]) => ({ code, name }));
    } catch (e) {
        console.error("Gagal mengambil daftar bahasa:", e);
        return [];
    }
}

async function translate(text, lang) {
    const result = await axios.get(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`
    );
    
    // Menggabungkan seluruh array teks (antisipasi kalau inputnya teks panjang/berparagraf)
    return result.data[0].map(x => x[0]).join('');
}

// ==================== [ BOT HANDLER ] ====================

let handler = async (m, { sock, text, usedPrefix, command }) => {
    // Jika tidak ada teks atau tidak menyertakan kode bahasa
    if (!text) {
        await global.loading(m, sock);
        const langList = await listLanguage();
        
        let menuLang = langList.length > 0 
            ? langList.map(l => `• *${l.code}* → ${l.name}`).join('\n')
            : `id (Indonesian), en (English), jv (Javanese), ar (Arabic), ja (Japanese), ko (Korean)`;

        return m.reply(
            `🌐 *GOOGLE TRANSLATE*\n\n` +
            `*Gunakan:* ${usedPrefix + command} [kode_bahasa] [teks]\n` +
            `*Contoh:* ${usedPrefix + command} en selamat pagi\n` +
            `*Contoh Balas/Reply:* Balas pesan lalu ketik: ${usedPrefix + command} ja\n\n` +
            `📌 *Daftar Kode Bahasa yang Tersedia:* \n${menuLang}`
        );
    }

    // Pemisahan argumen (Mendukung reply chat maupun teks langsung)
    let lang = text.split(' ')[0].toLowerCase();
    let textToTranslate = m.quoted ? m.quoted.text : text.replace(new RegExp(`^${lang}\\s*`, 'i'), '');

    // Validasi jika user lupa memasukkan teks saat tidak merely pesan
    if (!textToTranslate && !m.quoted) {
        return m.reply(`⚠️ *Teksnya mana?* Masukkan teks setelah kode bahasa.\nContoh: \`${usedPrefix + command} en apa kabar\``);
    }

    await global.loading(m, sock);

    try {
        const translation = await translate(textToTranslate, lang);

        let caption = `🔠 *GOOGLE TRANSLATION*\n` +
            `═══════════════════\n\n` +
            `🎯 *Target Bahasa:* \`${lang}\`\n\n` +
            `📝 *Teks Asal:*\n_${textToTranslate}_\n\n` +
            `✨ *Hasil Terjemahan:*\n*${translation}*\n\n` +
            `═══════════════════\n` +
            `🕒 _Processed at: ${new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}_`;

        await sock.sendMessage(m.chat, { text: caption }, { quoted: m });

    } catch (e) {
        console.error(e);
        m.reply(`❌ *Gagal menerjemahkan.* Pastikan kode bahasa \`${lang}\` yang kamu masukkan valid/benar.`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ['translate'];
handler.tags = ['internet'];
handler.command = /^(translate|tr|terjemah|terjemahkan)$/i;

export default handler;
