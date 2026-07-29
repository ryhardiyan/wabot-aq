/**
 * @file Carbon Code Image Generator (Formatted)
 * @module plugins/tools/carbon
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure)
 */

import fetch from 'node-fetch';

// ==================== [ SCRAPER FUNCTION BY RYHARDEV ] ====================

async function carbon(input) {
    // Memastikan baris baru (\n) dan tab terformat dengan benar sebelum dikirim ke JSON body
    const formattedCode = input
        .replace(/\r\n/g, '\n') // Normalisasi baris baru Windows ke Unix
        .trim();

    let res = await fetch("https://carbonara.solopov.dev/api/cook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            code: formattedCode,
            backgroundColor: "#1F1F1F" // Opsi tambahan: warna latar belakang frame luar
        })
    });
    
    if (!res.ok) throw new Error("Gagal memasak kode di server Carbonara.");
    
    let blob = await res.blob();
    let arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

// ==================== [ BOT HANDLER ] ====================

let handler = async (m, { sock, text, usedPrefix, command }) => {
    // Mengambil teks asli dari chat raw (mencakup spasi/enter enter asli dari pengirim)
    let codeText = m.quoted ? m.quoted.text : text;

    if (!codeText) {
        return m.reply(
            `💻 *Carbon Code Generator (Multi-line Fixed)*\n\n` +
            `Mengubah potongan kode menjadi gambar terstruktur.\n\n` +
            `*Gunakan:* ${usedPrefix + command} [kode_kamu]\n` +
            `📌 Atau balas (*reply*) teks kode pemrograman dengan ketik *${usedPrefix + command}*`
        );
    }

    await global.loading(m, sock);

    try {
        // Memanggil fungsi carbon dengan teks yang sudah di-normalisasi barisnya
        const imageBuffer = await carbon(codeText);

        // Mengirimkan hasil gambar buffer ke chat WhatsApp
        await sock.sendMessage(m.chat, { 
            image: imageBuffer, 
            caption: `✨ _Sukses membuat gambar kode terstruktur_` 
        }, { quoted: m });

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ['carbon'];
handler.tags = ['internet'];
handler.command = /^(carbon|carbonara|codeimg|toviewcode)$/i;

export default handler;
