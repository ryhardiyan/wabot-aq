/**
 * @file X (Twitter) Media Downloader via GraphQL API
 * @module plugins/downloader/x
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure Integration)
 */

import { fetch } from "undici";

/**
 * Scraper fungsi untuk membedah data GraphQL X.com
 * @author RyharDev
 */
async function xDownloader(url) {
    const id = url.match(/status\/(\d+)/)?.[1];
    if (!id) throw new Error("Tautan tweet X (Twitter) tidak valid.");
    
    const endpoint = `https://api.x.com/graphql/tmhPpO5sDermwYmq3h034A/TweetResultByRestId?variables=${encodeURIComponent(JSON.stringify({ tweetId: id, withCommunity: false, includePromotedContent: false, withVoice: false }))}&features=${encodeURIComponent(JSON.stringify({ creator_subscriptions_tweet_preview_api_enabled: true, responsive_web_edit_tweet_api_enabled: true, view_counts_everywhere_api_enabled: true, longform_notetweets_consumption_enabled: true }))}&fieldToggles=${encodeURIComponent(JSON.stringify({ withArticleRichContentState: true }))}`;
    
    const res = await fetch(endpoint, {
        headers: {
            authorization: "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
            "content-type": "application/json",
            origin: "https://x.com"
        }
    });
    
    if (!res.ok) throw new Error(`Gagal menghubungi server X. Status: ${res.status}`);
    
    const d = await res.json();
    const t = d?.data?.tweetResult?.result;
    const u = t?.core?.user_results?.result;
    const l = t?.legacy;
    
    if (!l) throw new Error("Data Tweet tidak ditemukan. Tweet mungkin privat atau dihapus.");

    return {
        id: t?.rest_id,
        created_at: l?.created_at,
        title: l?.full_text,
        author: {
            name: u?.core?.name,
            username: u?.core?.screen_name,
            followers: u?.legacy?.followers_count,
            verified: u?.is_blue_verified || u?.verification?.verified
        },
        media: (l?.extended_entities?.media || []).map(m => {
            if (m.type === "photo") return {
                type: "image/jpeg",
                url: m.media_url_https
            };
            if (m.type === "video" || m.type === "animated_gif") {
                const v = (m.video_info?.variants || []).filter(x => x.content_type === "video/mp4").sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                return {
                    type: v?.content_type || "video/mp4",
                    url: v?.url || null,
                    thumbnail: m.media_url_https
                };
            }
        }).filter(Boolean),
        stats: {
            likes: l?.favorite_count || 0,
            retweets: l?.retweet_count || 0,
            replies: l?.reply_count || 0,
            views: Number(t?.views?.count || 0)
        }
    };
}

let handler = async (m, { sock, args, usedPrefix, command }) => {
    // Menyesuaikan parameter variabel koneksi utama bot (sock/conn)
    const client = sock || global.conn; 
    let url = args[0] || (m.quoted && m.quoted.text ? m.quoted.text.trim() : "");

    if (!url || !url.match(/(x|twitter)\.com/i)) {
        return m.reply(`*🐦 X (Twitter) Downloader*\n\n*Gunakan:* ${usedPrefix + command} <link tweet>\n*Contoh:* ${usedPrefix + command} https://x.com/username/status/123456`);
    }

    await global.loading(m, client);

    try {
        const tweet = await xDownloader(url);
        
        let caption = `🐦 *X DOWNLOADER*\n` +
            `══════════════════════\n\n` +
            `👤 *Author:* ${tweet.author.name} (@${tweet.author.username}) ${tweet.author.verified ? '✅' : ''}\n` +
            `📝 *Tweet:* \n_${tweet.title || '-'}_\n\n` +
            `📊 *Statistik:* 👁️ ${tweet.stats.views} | ❤️ ${tweet.stats.likes} | 🔁 ${tweet.stats.retweets}\n` +
            `══════════════════════`;

        if (!tweet.media || tweet.media.length === 0) {
            // Jika hanya teks tweet tanpa media, kirim informasinya saja
            return await m.reply(caption);
        }

        // Pisahkan jenis media
        const images = tweet.media.filter(m => m.type.includes("image"));
        const videos = tweet.media.filter(m => m.type.includes("video"));

        // Proses pengiriman Gambar
        if (images.length > 0) {
            if (images.length > 1 && client.sendAlbumMessage) {
                // Mode Album jika library bot mendukung fungsi sendAlbumMessage
                const album = images.map((img, i) => ({
                    image: { url: img.url },
                    caption: i === 0 ? caption : "" // Teks caption hanya di gambar pertama agar rapi
                }));
                await client.sendAlbumMessage(m.chat, album, { quoted: m, delay: 200 });
            } else {
                // Kirim satu per satu jika album tidak didukung atau gambar cuma 1
                for (let img of images) {
                    await client.sendMessage(m.chat, { image: { url: img.url }, caption }, { quoted: m });
                }
            }
        }

        // Proses pengiriman Video / GIF animasj
        if (videos.length > 0) {
            for (let vid of videos) {
                if (!vid.url) continue;
                await client.sendMessage(m.chat, { 
                    video: { url: vid.url }, 
                    caption: images.length === 0 ? caption : "🎥 *Video Terlampir*", // Cegah duplikasi teks panjang jika ada gambar + video sekaligus
                    mimetype: "video/mp4" 
                }, { quoted: m });
                m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`)
            }
        }

    } catch (e) {
        console.error(e);
        m.reply("❌ Gagal memproses data X. Tweet kemungkinan privat, berumur terlalu tua, atau token otorisasi API sedang limit harian.");
    } finally {
        await global.loading(m, client, true);
    }
};

handler.help = ["twitter"];
handler.tags = ["downloader"];
handler.command = /^(x|twitter)$/i;

export default handler;
