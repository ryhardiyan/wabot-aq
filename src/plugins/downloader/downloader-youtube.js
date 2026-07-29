/**
 * @file YouTube Downloader (MP3 & MP4) via app.ytdown.to
 * @module plugins/downloader/ytdl
 * @license Apache-2.0
 * @author RyharDev (Original) & Gemini (Structure)
 */

import axios from 'axios';

/**
 * Helper function untuk request ke proxy ytdown
 */
async function requestProxy(mediaUrl) {
    const { data } = await axios.post('https://app.ytdown.to/proxy.php', 
        `url=${encodeURIComponent(mediaUrl)}`, 
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://app.ytdown.to',
                'Referer': 'https://app.ytdown.to/id2/'
            }
        }
    );
    return data;
}

let handler = async (m, { sock, args, usedPrefix, command }) => {
    const url = args[0];
    if (!url) return m.reply(`*YouTube Downloader*\n\n*Gunakan:* ${usedPrefix + command} <url>\n*Contoh:* ${usedPrefix + command} https://youtu.be/mXU1kZAwMmw?si=q_O2uab3XS6v-_9E`);

    await global.loading(m, sock);

    try {
        // Step 1: Ambil Info Video
        const videoInfo = await requestProxy(url);
        if (!videoInfo.api || videoInfo.api.status !== 'ok') throw new Error('Gagal mengambil info video.');

        const { title, userInfo, mediaStats, mediaItems, permanentLink } = videoInfo.api;
        
        // Filter kualitas terbaik untuk Video dan Audio
        const bestVideo = mediaItems.find(item => item.type === 'Video');
        
        // Logika Audio: Utamakan M4A, jika tidak ada baru ambil MP3
        const bestAudio = mediaItems.find(item => item.type === 'Audio' && item.mediaExtension?.toLowerCase() === 'm4a') 
                       || mediaItems.find(item => item.type === 'Audio' && item.mediaExtension?.toLowerCase() === 'mp3');

        // Fungsi Internal untuk Polling Download
        const processDownload = async (item) => {
            let res = await requestProxy(item.mediaUrl);
            let attempts = 0;
            const maxAttempts = 50; // Sekitar 100 detik maks
            
            while (res?.api?.status === 'queued' && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                res = await requestProxy(item.mediaUrl);
                attempts++;
                console.log(`[YTDown] Antrean ${item.type}: Percobaan ke-${attempts}`);
            }
            
            if (res?.api?.status !== 'completed') {
                throw new Error(`Server sedang sibuk. Status terakhir: ${res?.api?.status || 'unknown'}. Silakan coba lagi nanti.`);
            }
            
            const file = await axios.get(res.api.fileUrl, { 
                responseType: 'arraybuffer',
                timeout: 120000 // Timeout 2 menit untuk file besar
            });

            return {
                buffer: Buffer.from(file.data),
                fileName: res.api.fileName,
                fileSize: res.api.fileSize
            };
        };

        // Step 2: Conditional Download berdasarkan Command (Biar hemat bandwidth server)
        let videoResult = null;
        let audioResult = null;

        if (command === 'ytmp4') {
            if (!bestVideo) throw new Error('Video tidak tersedia untuk link ini.');
            videoResult = await processDownload(bestVideo);
        } else if (command === 'ytmp3') {
            if (!bestAudio) throw new Error('Audio tidak tersedia untuk link ini.');
            audioResult = await processDownload(bestAudio);
        }

        // Info teks dasar untuk Caption / Pesan
        const selectedMedia = command === 'ytmp4' ? bestVideo : bestAudio;
        const currentSize = command === 'ytmp4' ? videoResult?.fileSize : audioResult?.fileSize;

        let caption = `🎬 *YOUTUBE DOWNLOADER*\n\n` +
            `📌 *Title:* ${title}\n` +
            `👤 *Channel:* ${userInfo.name} (@${userInfo.username})\n` +
            `📊 *Stats:* ${mediaStats.followersCount} Subs • ${mediaStats.viewsCount} Views\n` +
            `━━━━━━━━━━━━━━━\n` +
            `🎵 *Type:* ${command === 'ytmp4' ? 'Video' : 'Audio'}\n` +
            `📹 *Format/Quality:* ${selectedMedia.mediaExtension} (${selectedMedia.mediaQuality || selectedMedia.mediaRes})\n` +
            `⏱️ *Duration:* ${selectedMedia.mediaDuration}\n` +
            `📦 *Size:* ${currentSize}\n` +
            `🔗 *Link:* ${permanentLink}`;

        // Step 3: Kirim Media ke WhatsApp
        
        // 1. Kirim jika perintahnya ytmp4
        if (command === 'ytmp4' && videoResult) {
            await sock.sendMessage(m.chat, {
                video: videoResult.buffer,
                caption: caption,
                mimetype: 'video/mp4',
                fileName: videoResult.fileName
            }, { quoted: m });
            m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`)
        }

        // 2. Kirim jika perintahnya ytmp3
        if (command === 'ytmp3' && audioResult) {
            const ext = bestAudio.mediaExtension?.toLowerCase();
            // Mimetype dinamis: m4a -> audio/mp4, mp3 -> audio/mpeg
            const mimeType = ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg';

            await sock.sendMessage(m.chat, {
                audio: audioResult.buffer,
                mimetype: mimeType,
                ptt: true,
                fileName: audioResult.fileName || `audio.${ext}`
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

handler.help = ['ytmp4', 'ytmp3'];
handler.tags = ['downloader'];
handler.command = /^(ytmp4|ytmp3)$/i;

export default handler;
