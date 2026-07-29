/**
 * @file Advanced HTTP Client / cURL-like Fetch Tool
 * @module plugins/tools/fetch
 * @license Apache-2.0
 * @author RyharDev (Scraper/Logic) & Gemini (Structure)
 */

import { fileTypeFromBuffer } from 'file-type';

// ==================== [ HELPER FUNCTIONS BY RYHARDEV ] ====================

function parseFlags(text) {
    const parts = text.trim().split(/\s+/);
    const url = parts[0];
    const flags = {
        verbose: false,
        debug: false,
        headers: false,
        redirect: "follow",
        timeout: 30000,
        stream: false,
        method: "GET",
        body: null,
        contentType: null,
        sendHeaders: {},
    };

    for (let i = 1; i < parts.length; i++) {
        const flag = parts[i].toLowerCase();

        if (flag === "--verbose" || flag === "-v") flags.verbose = true;
        if (flag === "--debug" || flag === "-d") flags.debug = true;
        if (flag === "--headers" || flag === "-h") flags.headers = true;
        if (flag === "--no-redirect") flags.redirect = "manual";
        if (flag === "--stream" || flag === "-s") flags.stream = true;

        if (flag.startsWith("--timeout=")) flags.timeout = parseInt(parts[i].split("=")[1]) || 30000;
        if (flag.startsWith("--method=")) flags.method = parts[i].split("=")[1].toUpperCase();
        if (flag.startsWith("--body=")) flags.body = parts[i].substring(7);
        if (flag.startsWith("--data=")) flags.body = parts[i].substring(7);
        if (flag.startsWith("--json=")) {
            flags.body = parts[i].substring(7);
            flags.contentType = "application/json";
        }
        if (flag.startsWith("--content-type=")) flags.contentType = parts[i].split("=")[1];

        if (flag.startsWith("--header=")) {
            const header = parts[i].substring(9);
            const [key, ...values] = header.split(":");
            if (key && values.length > 0) {
                flags.sendHeaders[key.trim()] = values.join(":").trim();
            }
        }
    }
    return { url, flags };
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatHeaders(headers) {
    let result = "═══ [ RESPONSE HEADERS ] ═══\n";
    headers.forEach((value, key) => {
        result += `▪️ *${key}:* ${value}\n`;
    });
    return result.trim();
}

// ==================== [ BOT HANDLER ] ====================

let handler = async (m, { sock, text, usedPrefix, command }) => {
    const startTime = Date.now();
    let debugLog = [];

    // Validasi URL Input
    if (!text || !/^https?:\/\//i.test(text.trim().split(/\s+/)[0])) {
        return m.reply(
            `❌ *Format URL Salah atau Kosong*\n\n` +
            `*Gunakan:* ${usedPrefix + command} <url> [flags]\n\n` +
            `💡 *Contoh:* \n` +
            `• ${usedPrefix + command} https://example.com --verbose\n` +
            `• ${usedPrefix + command} https://api.com/users --method=POST --json={"name":"RyharDev"}\n\n` +
            `════════════════════════\n\n` +
            `🛠️ *Daftar Flags yang Tersedia:*\n\n` +
            `*--verbose, -v* \n• Menampilkan detail eksekusi lengkap\n\n` +
            `*--debug, -d* \n• Mengaktifkan log debug developer\n\n` +
            `*--headers, -h* \n• Menampilkan data response headers\n\n` +
            `*--no-redirect* \n• Jangan ikuti URL pengalihan (redirect)\n\n` +
            `*--stream, -s* \n• Alirkan respon alih-alih buffer penuh\n\n` +
            `*--timeout=<ms>* \n• Default: 30000 (30 detik)\n\n` +
            `*--method=<HTTP_METHOD>* \n• Metode: POST, PUT, PATCH, DELETE\n\n` +
            `*--body=<data> / --data=<data>* \n• Mengirim data body mentah\n\n` +
            `*--json=<object>* \n• Otomatis set Content-Type JSON\n\n` +
            `*--content-type=<mime>* \n• Memaksa tipe konten kustom\n\n` +
            `*--header=<key:value>* \n• Menambahkan header permintaan kustom`
        );
    }

    const { url, flags } = parseFlags(text);
    debugLog.push(`[INIT] Target URL: ${url}`);
    debugLog.push(`[INIT] Flags Parsed: ${JSON.stringify(flags)}`);

    // Ganti status kehadiran bot menjadi sedang mengetik (composing)
    await sock.sendPresenceUpdate("composing", m.chat);
    if (global.loading) await global.loading(m, sock);

    try {
        const fetchOptions = {
            method: flags.method,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
                "Accept": "*/*",
                ...flags.sendHeaders,
            },
            redirect: flags.redirect,
            signal: AbortSignal.timeout(flags.timeout),
        };

        if (flags.body && ["POST", "PUT", "PATCH", "DELETE"].includes(flags.method)) {
            if (flags.contentType) {
                fetchOptions.headers["Content-Type"] = flags.contentType;
            }
            fetchOptions.body = flags.body;
            debugLog.push(`[REQUEST] Payload Body Attached`);
        }

        debugLog.push(`[FETCH] Sending HTTP ${flags.method} request...`);
        const response = await fetch(url, fetchOptions);
        const fetchTime = Date.now() - startTime;
        debugLog.push(`[FETCH] Received Response in ${fetchTime}ms`);

        if (!response.ok) {
            debugLog.push(`[HTTP_ERROR] Status: ${response.status} ${response.statusText}`);
            return m.reply(
                `🚫 *HTTP ERROR ${response.status}*\n` +
                `*Status:* ${response.statusText}\n` +
                `*URL:* ${url}\n` +
                `*Waktu:* ${fetchTime}ms`
            );
        }

        const contentType = response.headers.get("content-type") || "application/octet-stream";
        let buffer;

        if (!flags.stream) {
            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
        } else {
            debugLog.push(`[PROCESSING] Streaming Mode Enabled (Content-Type: ${contentType})`);
            if (contentType.includes("json")) {
                buffer = Buffer.from(JSON.stringify(await response.json(), null, 2));
            } else if (contentType.startsWith("text/")) {
                buffer = Buffer.from(await response.text());
            } else {
                buffer = Buffer.from(await response.arrayBuffer());
            }
        }

        // Deteksi berkas mentah sesungguhnya
        let detected = await fileTypeFromBuffer(buffer);
        let mime = detected?.mime || contentType.split(";")[0].trim();
        let ext = detected?.ext || mime.split("/")[1] || "bin";
        
        debugLog.push(`[MIME_DETECT] Result MIME: ${mime} | Extension: ${ext}`);

        let caption = `📡 *FETCH REQUEST SUCCESS*\n` +
            `════════════════════════\n\n` +
            `🔗 *URL:* ${url}\n` +
            `🟢 *Status:* ${response.status} (${response.statusText})\n` +
            `📦 *Ukuran Data:* ${formatBytes(buffer.length)}\n` +
            `📑 *MIME Type:* \`${mime}\`\n\n` +
            `════════════════════════\n` +
            `🕒 _Speed: ${fetchTime}ms_`;

        let msg;
        if (mime.includes("image")) {
            msg = { image: buffer, caption };
        } else if (mime.includes("video")) {
            msg = { video: buffer, caption };
        } else if (mime.includes("audio")) {
            msg = { audio: buffer, mimetype: mime, caption };
        } else {
            // Mengirim sebagai file dokumen jika berupa JSON, Text, PDF, Zip, dll.
            msg = {
                document: buffer,
                mimetype: mime,
                fileName: `fetch_result.${ext}`,
                caption,
            };
        }

        // Kirim Media Hasil Terkait
        await sock.sendMessage(m.chat, msg, { quoted: m });

        // Jika user meminta info headers (-h)
        if (flags.headers) {
            await sock.sendMessage(m.chat, { text: formatHeaders(response.headers) }, { quoted: m });
        }

        // Jika opsi verbose atau debug aktif
        if (flags.verbose || flags.debug) {
            let logCaption = `🛠️ *FETCH DEBUG LOG*\n` +
                `════════════════════════\n\n` +
                debugLog.map((log, i) => `${i + 1}. ${log}`).join("\n");
            await sock.sendMessage(m.chat, { text: logCaption }, { quoted: m });
        }

    } catch (e) {
        debugLog.push(`[CRASH_ERROR] ${e.message}`);
        console.error(e);
        return m.reply(`⚠️ *Fetch Execution Failed:* ${e.message}`);
    } finally {
        // Kembalikan status kehadiran bot menjadi tersedia (online/idle)
        await sock.sendPresenceUpdate("available", m.chat);
        if (global.loading) await global.loading(m, sock, true);
    }
};

handler.help = ["fetch"];
handler.tags = ["tools"];
handler.command = /^(fetch|get)$/i;
handler.limit = true;

export default handler;
