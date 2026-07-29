/**
 * @file Music Identifier / Find Song Plugin
 * @module plugins/tools/whatmusic
 * @license Apache-2.0
 * @author Scraper (User) & Gemini (Structure)
 */

import FormData from 'form-data';
import fetch from 'node-fetch'; // Sesuaikan jika bot Anda menggunakan global.fetch bawaan Node.js
import acrcloud from 'acrcloud';

// ==================== [ SCRAPER FUNCTIONS ] ====================

// 1. Menggunakan Doreso API (Aha Music)
async function whatmusic(buffer) {
    const form = new FormData();
    form.append("file", buffer, {
        filename: "lagu.mp3",
        contentType: "audio/mpeg"
    });

    try {
        const headers = {
            ...form.getHeaders(),
            "Origin": "https://www.aha-music.com",
            "Referer": "https://www.aha-music.com/",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
        };

        const up = await fetch("https://api.doreso.com/upload", {
            method: "POST",
            headers,
            body: form
        });

        const upJson = await up.json();
        if (!upJson?.data?.id) return null;

        // Tunggu proses identifikasi server
        await new Promise(r => setTimeout(r, 6000)); // Diturunkan ke 6 detik agar respon bot tidak terlalu lama (awalnya 15s)

        const get = await fetch(`https://api.doreso.com/file/${upJson.data.id}`);
        const getJson = await get.json();

        const music = getJson?.data?.[0]?.results?.music?.[0]?.result;
        if (!music) return null;

        return {
            method: "Doreso (Aha Music)",
            title: music.title || "Tidak Diketahui",
            album: music.album?.name || "-",
            artists: music.artists?.map(a => a.name).join(", ") || "-",
            genres: music.genres?.map(g => g.name).join(", ") || "-",
            label: music.label || "-",
            release_date: music.release_date || "-",
            duration: toTime(music.duration_ms),
            score: music.score || 0,
            urls: [
                music.external_metadata?.youtube ? `https://www.youtube.com/watch?v=${music.external_metadata.youtube.vid}` : null,
                music.external_metadata?.spotify ? `https://open.spotify.com/track/${music.external_metadata.spotify.track.id}` : null,
                music.external_metadata?.deezer ? `https://www.deezer.com/track/${music.external_metadata.deezer.track.id}` : null
            ].filter(Boolean)
        };
    } catch (e) {
        console.error("Error di whatmusic (Doreso):", e);
        return null;
    }
}

// 2. Menggunakan ACRCloud API
const acr = new acrcloud({
    host: "identify-us-west-2.acrcloud.com",
    access_key: "a0b3ae6fdd41810d0679925a50cdc9d6",
    access_secret: "vK2Zr1NpFZbS7yENJTW2oyGMBznyXlkVdqIq8BrB",
});

async function whatmusic2(buffer) {
    try {
        let response = await acr.identify(buffer);
        let metadata = response?.metadata;
        if (!metadata || !metadata.music || metadata.music.length === 0) return null;

        let song = metadata.music[0]; // Ambil hasil pertama terakurat

        return {
            method: "ACRCloud",
            title: song.title || "Tidak Diketahui",
            album: song.album?.name || "-",
            artists: song.artists?.map((a) => a.name).join(", ") || "-",
            genres: song.genres?.map((g) => g.name).join(", ") || "-",
            label: song.label || "-",
            release_date: song.release_date ? new Date(song.release_date).toLocaleDateString("id-ID", { dateStyle: 'medium' }) : "-",
            duration: toTime(song.duration_ms),
            score: song.score || 0,
            urls: Object.keys(song.external_metadata || {})
                .map((key) =>
                    key === "youtube"
                        ? "https://youtu.be/" + song.external_metadata[key].vid
                        : key === "deezer"
                        ? "https://www.deezer.com/us/track/" + song.external_metadata[key].track.id
                        : key === "spotify"
                        ? "https://open.spotify.com/track/" + song.external_metadata[key].track.id
                        : ""
                )
                .filter(Boolean)
        };
    } catch (e) {
        console.error("Error di whatmusic2 (ACRCloud):", e);
        return null;
    }
}

function toTime(ms) {
    if (!ms) return "00:00";
    let minutes = Math.floor(ms / 60000) % 60;
    let seconds = Math.floor(ms / 1000) % 60;
    return [minutes, seconds].map((v) => v.toString().padStart(2, "0")).join(":");
}

// ==================== [ BOT HANDLER ] ====================

let handler = async (m, { sock, usedPrefix, command }) => {
    // Validasi apakah user mereply audio / video atau mengirim audio langsung
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || '';

    if (!/audio|video/.test(mime)) {
        return m.reply(
            `🎵 *Music Identifier / Pencari Judul Lagu*\n\n` +
            `Kirim atau balas/reply file audio/vn/video dengan perintah:\n` +
            `👉 *${usedPrefix + command}*`
        );
    }

    await global.loading(m, sock);

    try {
        // Download media menjadi buffer
        let buffer = await q.download();
        if (!buffer) throw new Error("Gagal mengunduh media/audio.");

        // Mencoba metode 1 (Doreso)
        let result = await whatmusic(buffer);

        // Jika metode 1 gagal/null, otomatis fallback ke metode 2 (ACRCloud)
        if (!result) {
            result = await whatmusic2(buffer);
        }

        if (!result) {
            throw new Error("Lagu tidak berhasil diidentifikasi. Pastikan suara lagu terdengar jelas.");
        }

        let caption = `🔍 *MUSIC IDENTIFIED*\n` +
            `═══════════════════\n\n` +
            `🎵 *Judul:* ${result.title}\n` +
            `👤 *Artis:* ${result.artists}\n` +
            `💿 *Album:* ${result.album}\n` +
            `🏷️ *Label:* ${result.label}\n` +
            `🎼 *Genre:* ${result.genres}\n` +
            `📆 *Rilis:* ${result.release_date}\n` +
            `⏱️ *Durasi:* ${result.duration}\n` +
            `🎯 *Akurasi:* ${result.score}%\n\n` +
            `🤖 *Engine:* ${result.method}\n\n`;

        if (result.urls.length > 0) {
            caption += `🌐 *STREAMING LINKS:*\n`;
            result.urls.forEach((url, i) => {
                caption += `🔗 [${i + 1}] ${url}\n`;
            });
        }

        caption += `\n═══════════════════\n` +
            `🕒 _Update: ${new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}_`;

        await sock.sendMessage(m.chat, { text: caption }, { quoted: m });

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ['whatmusic'];
handler.tags = ['tools'];
handler.command = /^(whatmusic|findsong|judul|judullagu|cek-lagu)$/i;

export default handler;
