/**
 * @file 小红书 / RedNote 媒体 html 下载器 (标准命令版)
 * @module plugins/tools/rednote
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure Integration)
 */

import axios from 'axios';

// ==================== [ CORE FUNCTIONS BY RYHARDEV ] ====================

const generateRandomIP = () => 
    `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

async function getRedNoteData(xhsUrl) {
    const apiUrl = 'https://rednote.savevideodown.com/api/download';
    const fakeIP = generateRandomIP();
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Referer': 'https://rednote.savevideodown.com/',
        'Origin': 'https://rednote.savevideodown.com',
        'X-Forwarded-For': fakeIP, 
        'X-Real-IP': fakeIP, 
        'Client-IP': fakeIP
    };

    const response = await axios.post(apiUrl, { url: xhsUrl }, { headers, timeout: 20000 });
    const resData = response.data;

    if (!resData.success) {
        throw new Error(resData.error || "Gagal mengambil data dari server api.");
    }

    return {
        title: resData.title || "Untitled",
        author: resData.author || "Unknown",
        type: resData.type, // 'video' atau 'image'
        results: resData.type === 'video' 
            ? [resData.directVideoUrl || resData.downloadUrl] 
            : resData.directImages || []
    };
}

// ==================== [ BOT HANDLER ] ====================

let handler = async (m, { sock, text, usedPrefix, command }) => {
    let urlTarget = m.quoted ? m.quoted.text : text;
    
    if (!urlTarget || !/(xiaohongshu\.com|xhslink\.com|rednote\.com)/i.test(urlTarget)) {
        return m.reply(
            `📦 *红红书/小红书下载器*\n\n` +
            `*如何使用:* ${usedPrefix + command} [RedNote/小红书链接]\n` +
            `*例子:* ${usedPrefix + command} https://www.xiaohongshu.com/explore/xxxxxxxxnn` +
            `📌 _尖端: 您也可以回复包含目标链接的消息，然后键入 *${usedPrefix + command}*._`
        );
    }

    const matchUrl = urlTarget.match(/https?:\/\/[^\s]+/i);
    if (!matchUrl) return m.reply("❌ 无效的网址。请确保网址以 http:// 或 https:// 开头。");

    await global.loading(m, sock);

    try {
        const media = await getRedNoteData(matchUrl[0]);
        
        let caption = `📥 *Rednote 下载器下载成功*\n` +
            `════════════════════════\n\n` +
            `👤 *作者:* ${media.author}\n` +
            `📝 *标题:* ${media.title}\n` +
            `🗂️ *类型:* ${media.type === 'video' ? 'Video 🎥' : 'Image / Slider 🖼️'}\n\n` +
            `════════════════════════\n` +
            `🕒 _时间: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB_`;

        if (media.type === 'video') {
            if (!media.results[0]) throw new Error('URL video tidak ditemukan');
            
            await sock.sendMessage(m.chat, { 
                video: { url: media.results[0] }, 
                caption: caption,
                mimetype: 'video/mp4'
            }, { quoted: m });
            m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`)
            
        } else if (media.type === 'image' && media.results.length > 0) {
            await m.reply(`${caption}\n\n🖼️ 发送 *${media.results.length}* 图片正在显示，请稍候……`);
            
            for (let i = 0; i < media.results.length; i++) {
                const imgUrl = typeof media.results[i] === 'string' ? media.results[i] : media.results[i].url;
                if (!imgUrl) continue;

                await sock.sendMessage(m.chat, { 
                    image: { url: imgUrl },
                    caption: `🖼️ 图片 (${i + 1}/${media.results.length})`
                }, { quoted: m });

                if (i < media.results.length - 1) await new Promise(r => setTimeout(r, 800));
            }
        }

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *错误:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ["xiaohongshu"];
handler.tags = ["downloader"];
handler.command = /^(rednote|xhs|xiaohongshu)$/i;

export default handler;
