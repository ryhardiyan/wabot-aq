/**
 * @file Spotify Music Downloader via Spotmate - Fixed Bug Regex
 * @module plugins/downloader/spotify
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure Integration)
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

class SpotifyScraper {
    constructor() {
        this.axiosInstance = axios.create({
            maxRedirects: 5,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });
    }

    async spotifydl(url) {
        const html = await this.axiosInstance.get('https://spotmate.online/en1', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });      
        const $ = cheerio.load(html.data);     
        
        const csrfToken = $('meta[name="csrf-token"]').attr('content');
        if (!csrfToken) throw new Error('CSRF token tidak ditemukan pada Spotmate.');
        
        const cookies = html.headers['set-cookie'] || [];
        const cookieString = cookies.map(c => c.split(';')[0]).join('; ');
        
        const getTrack = await this.axiosInstance.post(
            'https://spotmate.online/getTrackData',
            { spotify_url: url },
            {
                headers: {
                    'Cookie': cookieString,
                    'Origin': 'https://spotmate.online',
                    'Referer': 'https://spotmate.online/en1',
                    'X-CSRF-TOKEN': csrfToken,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                }
            }
        );      
        
        const convert = await this.axiosInstance.post(
            "https://spotmate.online/convert",
            { urls: getTrack.data.external_urls.spotify },
            {
                headers: {
                    "content-type": "application/json",
                    "origin": "https://spotmate.online",
                    "referer": "https://spotmate.online/en1",
                    "x-csrf-token": csrfToken,
                    "cookie": cookieString,
                },
            }
        );

        return {
            title: getTrack.data.name || 'Unknown Track',
            artist: getTrack.data.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
            album: getTrack.data.album?.name || 'Unknown Album',
            thumbnail: getTrack.data.album?.images?.[0]?.url || '',
            download_url: convert.data.url
        };
    }
}

const scraper = new SpotifyScraper();

let handler = async (m, { sock, args, usedPrefix, command }) => {
    let url = args[0] || (m.quoted && m.quoted.text ? m.quoted.text.trim() : "");
    
    // --- PERBAIKAN DI SINI ---
    // Regex dipermudah agar asal ada kata "spotify.com" di dalam link, bot akan langsung gas proses
    const isSpotifyUrl = url.match(/spotify\.com/i);
    
    if (!url || !isSpotifyUrl) {
        return m.reply(`*🎵 Spotify Downloader*\n\n*Gunakan:* ${usedPrefix + command} <link lagu spotify>\n*Contoh:* ${usedPrefix + command} https://open.spotify.com/track/4PTG3Z6ehGkBF3zI7YgGgu`);
    }

    await global.loading(m, sock);

    try {
        const trackInfo = await scraper.spotifydl(url);
        if (!trackInfo.download_url) throw new Error("Gagal mengonversi link download musik.");

        let caption = `🎵 *SPOTIFY DOWNLOADER*\n` +
            `══════════════════════\n\n` +
            `📌 *Judul:* ${trackInfo.title}\n` +
            `👤 *Artis:* ${trackInfo.artist}\n` +
            `💿 *Album:* ${trackInfo.album}\n\n` +
            `⏳ _Mengunduh biner audio langsung dari server CDN..._`;

        if (trackInfo.thumbnail) {
            await sock.sendMessage(m.chat, { image: { url: trackInfo.thumbnail }, caption }, { quoted: m });
        } else {
            await m.reply(caption);
        }

        const audioRes = await axios.get(trackInfo.download_url, { responseType: 'arraybuffer' });
        const audioBuffer = Buffer.from(audioRes.data);

        await sock.sendMessage(m.chat, {
            audio: audioBuffer,
            mimetype: 'audio/mp4',
            ptt: false 
        }, { quoted: m });
        m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`)

    } catch (e) {
        console.error(e);
        const msg = e.response?.data?.message || e.message;
        m.reply(`⚠️ *Error:* ${msg}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ['spotify'];
handler.tags = ['downloader'];
handler.command = /^(spotify)$/i;

export default handler;
