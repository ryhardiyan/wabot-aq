/**
 * @file Pinterest Search Media Scraper & Downloader
 * @module plugins/tools/pinterest
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure)
 */

import fetch from 'node-fetch';

// ==================== [ SCRAPER FUNCTION BY RYHARDEV ] ====================

/**
 * Mengambil session cookie dan CSRF token dari halaman utama Pinterest.
 * @returns {Promise<{cookies: string, csrf: string}>}
 */
async function getSession() {
    const res = await fetch("https://id.pinterest.com/", {
        headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
            "accept-language": "en-US,en;q=0.9"
        }
    });
    
    // Fallback jika getSetCookie tidak tersedia
    const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const cookies = raw.map(c => c.split(";")[0]).join("; ");
    const csrf = raw.find(c => c.startsWith("csrftoken="))?.match(/csrftoken=([^;]+)/)?.[1] || "";
    return { cookies, csrf };
}

/**
 * Mencari pin, gambar, atau video di Pinterest berdasarkan query.
 * @param {string} query - Kata kunci pencarian
 * @param {object} options - Opsi pencarian tambahan
 * @returns {Promise<object>} Hasil pencarian terstruktur
 */
async function pinterestSearch(query, options = {}) {
    const { limit = 5, scope = "pins", bookmark = null } = options;
    const session = await getSession();

    const data = {
        options: {
            query,
            scope,
            page_size: limit,
            refine_search_with_filters: true,
            ...(bookmark ? { bookmarks: [bookmark] } : {})
        },
        context: {}
    };

    const sourceUrl = `/search/${scope}/?q=${encodeURIComponent(query)}`;
    const url = `https://id.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify(data))}&_=${Date.now()}`;

    const res = await fetch(url, {
        headers: {
            "accept": "application/json, text/javascript, */*, q=0.01",
            "accept-language": "en-US,en;q=0.9",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
            "referer": `https://id.pinterest.com${sourceUrl}`,
            "x-requested-with": "XMLHttpRequest",
            "x-app-version": "6d51d5a",
            "x-pinterest-appstate": "active",
            "x-pinterest-pws-handler": "www/search/[scope].js",
            "x-pinterest-source-url": sourceUrl,
            ...(session.csrf ? { "x-csrftoken": session.csrf } : {}),
            ...(session.cookies ? { "cookie": session.cookies } : {})
        }
    });

    if (!res.ok) return { results: [], bookmark: null, error: `HTTP ${res.status}` };

    const json = await res.json().catch(() => null);
    const payload = json?.resource_response?.data;
    if (!payload) return { results: [], bookmark: null, error: "no data" };

    const arr = Array.isArray(payload) ? payload : payload.results || [];

    const mapPin = (pin) => ({
        title: pin.title || pin.grid_title || "Pinterest Image",
        image: pin.images?.orig?.url || pin.images?.["736x"]?.url || null,
        video: pin.videos?.video_list?.V_HLSV4?.url
            || pin.videos?.video_list?.V_EXP7?.url
            || pin.videos?.video_list?.V_720P?.url
            || null,
        username: pin.pinner?.username || null,
        fullName: pin.pinner?.full_name || null,
        pinUrl: `https://id.pinterest.com/pin/${pin.id}/`
    });

    return {
        query,
        count: arr.length,
        bookmark: payload.bookmark || null,
        results: arr.filter(x => x?.id).map(mapPin)
    };
}

// ==================== [ BOT HANDLER ] ====================

let handler = async (m, { sock, text, usedPrefix, command }) => {
    // Mengambil query dari text langsung atau chat yang di-quote/reply
    let query = m.quoted ? m.quoted.text : text;

    if (!query) {
        return m.reply(
            `📌 *Pinterest Search Downloader*\n\n` +
            `Mencari gambar/ide dari Pinterest secara instan.\n\n` +
            `*Gunakan:* ${usedPrefix + command} [kata_kunci]\n` +
            `*Contoh:* ${usedPrefix + command} logo ide`
        );
    }

    await global.loading(m, sock);

    try {
        // Melakukan pencarian (Default limit diset 5 untuk variasi data)
        const searchData = await pinterestSearch(query, { limit: 5 });

        if (!searchData.results || searchData.results.length === 0) {
            throw new Error(`Media tidak ditemukan untuk kata kunci "${query}".`);
        }

        // Mengambil 1 hasil acak dari limit yang sudah didapatkan agar hasil tidak monoton
        const randomIndex = Math.floor(Math.random() * searchData.results.length);
        const pin = searchData.results[randomIndex];

        if (!pin.image && !pin.video) {
            throw new Error("Konten media pada pin ini tidak dapat diakses.");
        }

        // Menyusun teks caption untuk dikirim bersama media
        let caption = `📌 *PINTEREST SEARCH*\n\n` +
                      `📝 *Judul:* ${pin.title}\n` +
                      `👤 *Kreator:* ${pin.fullName || '-'} (@${pin.username || '-'})\n` +
                      `🔗 *Url Pin:* ${pin.pinUrl}\n\n` +
                      `✨ _Hasil pencarian untuk: "${query}"_`;

        // Pengkondisian jika pin berupa Video atau Gambar
        if (pin.video) {
            await sock.sendMessage(m.chat, { 
                video: { url: pin.video }, 
                caption: caption 
            }, { quoted: m });
            m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`)
        } else {
            await sock.sendMessage(m.chat, { 
                image: { url: pin.image }, 
                caption: caption 
            }, { quoted: m });
        }

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ['pinterest'];
handler.tags = ['downloader'];
handler.command = /^(pinterest|pint|pinsearch)$/i;

export default handler;
