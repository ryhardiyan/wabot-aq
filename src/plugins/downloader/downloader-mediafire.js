/**
 * @file MediaFire Downloader (Smart Size-Limit Handling)
 * @module plugins/downloader/mediafire
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure Integration)
 */

const MEDIAFIRE_URL_RE = /^https?:\/\/(?:www\.)?mediafire\.com\/(?:file|file_premium|download|\?)/i;
const DIRECT_URL_RE = /href="(https?:\/\/download\d*\.mediafire\.com\/[^"]+)"\s*[\r\n]*\s*id="downloadButton"/i;
const FILENAME_RE = /<div class="filename">([^<]+)<\/div>/i;
const FILETYPE_RE = /<div class="filetype">[\s\S]*?\(\.([A-Z0-9]+)<span/i;
const SIZE_LABEL_RE = /id="downloadButton"[^>]*>[\s\S]*?Download\s*\(([^)]+)\)/i;

const FETCH_TIMEOUT_MS = 30_000;
const FETCH_RETRIES = 2;
const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504, 520, 522, 524]);
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

const MIME_BY_EXT = {
    zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar', gz: 'application/gzip', pdf: 'application/pdf',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain', csv: 'text/csv', json: 'application/json', mp3: 'audio/mpeg',
    m4a: 'audio/mp4', wav: 'audio/wav', mp4: 'video/mp4', mkv: 'video/x-matroska',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    apk: 'application/vnd.android.package-archive', exe: 'application/vnd.microsoft.portable-executable'
};

function isMediafireUrl(value) {
    return MEDIAFIRE_URL_RE.test(String(value || '').trim());
}

function inferMimeType(extension) {
    const ext = String(extension || '').toLowerCase();
    return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function parseSizeLabel(label) {
    const match = String(label || '').trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
    if (!match) return null;
    const value = Number(match[1]);
    const unit = match[2].toUpperCase();
    const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
    return Math.round(value * mult[unit]);
}

async function fetchHtmlWithRetry(url) {
    let lastError = null;
    for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
            if (!res.ok) {
                if (RETRYABLE_HTTP.has(res.status) && attempt < FETCH_RETRIES) {
                    lastError = new Error(`HTTP ${res.status}`);
                    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
                    continue;
                }
                throw new Error(`HTTP ${res.status}`);
            }
            return await res.text();
        } catch (error) {
            lastError = error;
            const networkRetry = error?.name === 'AbortError' ||
                ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(error?.code);
            if (!networkRetry || attempt === FETCH_RETRIES) throw error;
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastError || new Error('Gagal mengambil halaman MediaFire');
}

async function fetchMediafireFile(rawUrl) {
    const url = String(rawUrl || '').trim();
    if (!isMediafireUrl(url)) throw new Error('Link MediaFire tidak valid');

    const html = await fetchHtmlWithRetry(url);
    const directMatch = html.match(DIRECT_URL_RE);
    if (!directMatch) throw new Error('Tombol download tidak ditemukan. File mungkin sudah dihapus atau diproteksi.');

    const directUrl = directMatch[1].trim();
    const filename = (html.match(FILENAME_RE)?.[1] || '').trim() || directUrl.split('/').pop() || 'mediafire-file';
    const sizeLabel = (html.match(SIZE_LABEL_RE)?.[1] || '').trim();
    const filesize = parseSizeLabel(sizeLabel);
    const extension = (html.match(FILETYPE_RE)?.[1] || filename.split('.').pop() || '').toLowerCase();

    return {
        url: directUrl,
        filename,
        sizeLabel: sizeLabel || '-',
        filesize: filesize || 0,
        extension,
        mimeType: inferMimeType(extension),
    };
}

let handler = async (m, { sock, args, usedPrefix, command }) => {
    let inputUrl = args[0] || (m.quoted && m.quoted.text ? m.quoted.text.trim() : "");

    if (!inputUrl || !isMediafireUrl(inputUrl)) {
        return m.reply(`*📂 MediaFire Downloader*\n\n*Gunakan:* ${usedPrefix + command} <link mediafire>\n*Contoh:* ${usedPrefix + command} https://www.mediafire.com/file/...`);
    }

    await global.loading(m, sock);

    try {
        // Panggil fungsi scraper bawaan RyharDev
        const fileData = await fetchMediafireFile(inputUrl);

        let caption = `📝 *MEDIAFIRE DOWNLOADER*\n` +
            `══════════════════════\n\n` +
            `📛 *Nama File:* ${fileData.filename}\n` +
            `📦 *Ekstensi:* .${fileData.extension.toUpperCase()}\n` +
            `⚖️ *Ukuran:* ${fileData.sizeLabel}\n\n`;

        // Batas maksimal upload WhatsApp otomatis (100 MB dalam biner byte)
        const MAX_SIZE_BYTES = 100 * 1024 * 1024;

        if (fileData.filesize > MAX_SIZE_BYTES) {
            // JALUR 1: Jika file terlalu besar, kirim link direct akselerasi cloud agar hemat RAM panel
            caption += `⚠️ *File Terlalu Besar (> 100MB)*\n` +
                `Unduh secara mandiri menggunakan link tautan langsung di bawah ini:\n\n` +
                `🔗 *Direct Link:* ${fileData.url}\n\n` +
                `══════════════════════`;
            
            await m.reply(caption);
            m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`)
        } else {
            // JALUR 2: Di bawah 100 MB, unduh otomatis dan kirim sebagai dokumen
            caption += `⏳ _File berada di bawah 100 MB, mengunduh file secara otomatis untuk dikirim ke chat..._`;
            await m.reply(caption);

            const fileRes = await fetch(fileData.url);
            if (!fileRes.ok) throw new Error("Gagal menarik biner berkas dari CDN MediaFire.");
            const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

            await sock.sendMessage(m.chat, {
                document: fileBuffer,
                fileName: fileData.filename,
                mimetype: fileData.mimeType,
                caption: `✅ *MediaFire Sukses Diunduh!*`
            }, { quoted: m });
            m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`)
        }

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ['mediafire'];
handler.tags = ['downloader'];
handler.command = /^(mediafire)$/i;

export default handler;
