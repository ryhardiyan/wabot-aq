/**
 * @file TikTok Downloader (Video & Slide)
 * @module plugins/downloader/tiktok
 * @license Apache-2.0
 * @author RyharDev (Scraper)
 */

const TT_REGEX = /https?:\/\/(www\.|v[tm]\.)?tiktok\.com\/[\S]+/i;

async function tiktokDownload(url) {
    const html = await fetch(url, {
        headers: {
            "authority": "www.tiktok.com",
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": `"Android"`,
            "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36"
        }
    }).then(a => a.text());

    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return null;

    const json = JSON.parse(match[1]);
    const data = json.__DEFAULT_SCOPE__?.["webapp.reflow.video.detail"]?.itemInfo?.itemStruct;
    if (!data) return null;

    let download = data.imagePost
        ? data.imagePost.images.map(img => img.imageURL.urlList[0])
        : await fetch(`https://www.tiktok.com/player/api/v1/items?item_ids=${data.id}`)
              .then(a => a.json())
              .then(b => b.items[0]?.video_info?.url_list[0]);

    return {
        id: data.id,
        description: data.desc || "TikTok Video",
        isVideo: !data.imagePost,
        statistics: {
            like: data.stats.diggCount,
            comment: data.stats.commentCount,
            share: data.stats.shareCount,
            views: data.stats.playCount
        },
        author: {
            username: data.author.uniqueId,
            nickname: data.author.nickname,
            avatar: data.author.avatarThumb
        },
        download: download
    };
}

let handler = async (m, { sock, args, usedPrefix, command }) => {
    let text = args.join(" ").trim();

    // Input handling: from args or quoted message
    if (!text && m.quoted?.text) text = m.quoted.text.trim();
    
    const url = text.match(TT_REGEX)?.[0];
    if (!url) {
        return m.reply(`*Tiktok Downloader*\n\n*Gunakan:* ${usedPrefix + command} <url>\n*Contoh:* ${usedPrefix + command} https://vm.tiktok.com/ZS9FGkVqAk61T-DUM4J/`);
    }

    await global.loading(m, sock);

    try {
        const result = await tiktokDownload(url);
        if (!result) throw new Error("Gagal mengambil data. Pastikan URL valid.");

        const caption = `*TIKTOK DOWNLOADER*\n\n` +
            `📝 *Caption:* ${result.description}\n` +
            `👤 *Author:* ${result.author.nickname} (@${result.author.username})\n` +
            `📊 *Stats:* ${result.statistics.like} Like, ${result.statistics.comment} Komentar`;

        if (result.isVideo) {
            // Kirim Video
            await sock.sendMessage(m.chat, {
                video: { url: result.download },
                caption: caption,
                mimetype: "video/mp4"
            }, { quoted: m });
            m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`)
            
        } else {
            // Kirim Slide Foto (Carousel)
            await m.reply(`Ditemukan ${result.download.length} foto. Mengirim gambar...`);
            for (let imgUrl of result.download) {
                await sock.sendMessage(m.chat, { image: { url: imgUrl } }, { quoted: m });
            }
        }

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ["tiktok"];
handler.tags = ["downloader"];
handler.command = /^(tt|tiktok)$/i;

export default handler;
