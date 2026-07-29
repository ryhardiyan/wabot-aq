import axios from 'axios';
import * as cheerio from 'cheerio';

async function scrapeEnkaProfile(uid) {
    const url = `https://enka.network/u/${uid}/`;
    const { data: html } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    const $ = cheerio.load(html);
    
    const result = {
        uid,
        playerInfo: {
            nickname: $('h1.svelte-ea8b6b').first().text().trim() || 'Unknown',
            level: parseInt($('.ar.svelte-ea8b6b').text().match(/AR (\d+)/)?.[1]) || 0,
            worldLevel: parseInt($('.ar.svelte-ea8b6b').text().match(/WL (\d+)/)?.[1]) || 0,
            signature: $('.signature.svelte-ea8b6b').text().trim() || '-',
            achievements: 0,
            avatar: $('.avatar-icon img').attr('src')
        },
        characters: []
    };

    // Scrape Stats Dasar
    $('.stat.svelte-1dtsens').each((i, el) => {
        const value = $(el).find('td').first().text().trim();
        const label = $(el).find('td').last().text().trim();
        if (label.includes('Total Achievement')) result.playerInfo.achievements = value;
    });

    // Scrape Karakter di Showcase
    $('.avatar.live').each((i, el) => {
        const level = $(el).find('.level').text().trim();
        const nameMatch = $(el).find('.chara').attr('style')?.match(/Side[._]([^.]+)/);
        if (nameMatch) {
            result.characters.push({
                name: nameMatch[1].replace(/_/g, ' '),
                level: level || '?'
            });
        }
    });

    return result;
}

let handler = async (m, { sock, args, usedPrefix, command }) => {
    const uid = args[0];
    if (!uid || isNaN(uid)) {
        return m.reply(`*Genshin Impact Profile*\n\n*Gunakan:* ${usedPrefix + command} <uid>\n*Contoh:* ${usedPrefix + command} 886567006`);
    }

    await global.loading(m, sock);

    try {
        const data = await scrapeEnkaProfile(uid);
        
        let caption = `🌟 *GENSHIN IMPACT PROFILE*\n` +
            `══════════════════════\n\n` +
            `👤 *Nickname:* ${data.playerInfo.nickname}\n` +
            `🆔 *UID:* ${data.uid}\n` +
            `🌍 *Level:* AR ${data.playerInfo.level} (WL ${data.playerInfo.worldLevel})\n` +
            `🏆 *Achievements:* ${data.playerInfo.achievements}\n` +
            `📝 *Signature:* _${data.playerInfo.signature}_\n\n` +
            `🎭 *CHARACTER SHOWCASE*\n`;

        if (data.characters.length > 0) {
            data.characters.forEach((char, i) => {
                caption += `${i + 1}. ${char.name} (Lv. ${char.level})\n`;
            });
        } else {
            caption += `_(Tidak ada karakter yang dipajang)_\n`;
        }

        caption += `\n══════════════════════\n` +
            `🔗 _https://enka.network/u/${uid}/_`;

        // Kirim dengan avatar jika tersedia
        if (data.playerInfo.avatar) {
            const avatarUrl = data.playerInfo.avatar.startsWith('http') 
                ? data.playerInfo.avatar 
                : `https://enka.network${data.playerInfo.avatar}`;
                
            await sock.sendMessage(m.chat, { 
                image: { url: avatarUrl }, 
                caption: caption 
            }, { quoted: m });
            m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`)
        } else {
            await m.reply(caption);
            m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`)
        }

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* Gagal mengambil data. Pastikan UID benar dan profil tidak di-private.`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ['enka'];
handler.tags = ['info'];
handler.command = /^(enka|genshin|gi)$/i;

export default handler;
