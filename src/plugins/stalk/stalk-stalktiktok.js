/**
 * @file TikTok Profile Stalker
 * @module plugins/tools/tiktokstalk
 * @license Apache-2.0
 * @author Scraper (User) & Gemini (Structure)
 */

import fetch from 'node-fetch';

async function stalkTikTok(username) {
    username = username.replace(/^@/, "").trim();
    const html = await fetch(`https://www.tiktok.com/@${encodeURIComponent(username)}`, {
        headers: {
            "authority": "www.tiktok.com",
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": "Android",
            "user-agent": "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
        }
    }).then(a => a.text());

    const match =
        html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/) ||
        html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return null;

    const json = JSON.parse(match[1]);
    const scope = json.__DEFAULT_SCOPE__ || json.DEFAULT_SCOPE;
    const detail = scope?.["webapp.user-detail"] || scope?.["webapp.reflow.profile.initial"];
    const userInfo = detail?.userInfo;

    let u, s;
    if (userInfo?.user) {
        u = userInfo.user;
        s = userInfo.stats || userInfo.statsV2 || {};
    } else if (json.UserModule?.users) {
        const id = Object.keys(json.UserModule.users)[0];
        u = json.UserModule.users[id];
        s = json.UserModule.stats?.[id] || {};
    } else {
        return null;
    }

    return {
        username: u.uniqueId || username,
        nickname: u.nickname || "",
        userId: u.id || null,
        secUid: u.secUid || null,
        verified: !!u.verified,
        privateAccount: !!u.privateAccount,
        region: u.region || null,
        language: u.language || null,
        ttSeller: !!u.ttSeller,
        createdAt: u.createTime ? new Date(u.createTime * 1000).toISOString() : null,
        signature: u.signature || "",
        bioLink: u.bioLink?.link || null,
        avatar: u.avatarLarger || u.avatarMedium || u.avatarThumb || null,
        stats: {
            followers: Number(s.followerCount) || 0,
            following: Number(s.followingCount) || 0,
            hearts: Number(s.heartCount ?? s.heart) || 0,
            videos: Number(s.videoCount) || 0,
            friends: Number(s.friendCount) || 0,
            diggs: Number(s.diggCount) || 0
        },
        profileUrl: `https://www.tiktok.com/@${u.uniqueId || username}`
    };
}

let handler = async (m, { sock, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*TikTok Profile Stalker*\n\n` +
            `*Gunakan:* ${usedPrefix + command} [username]\n` +
            `*Contoh:* ${usedPrefix + command} luislenaa`
        );
    }

    await global.loading(m, sock);

    try {
        const user = await stalkTikTok(text);

        if (!user) {
            throw new Error("Username tidak ditemukan atau akun di-private ketat.");
        }

        // Helper angka ribuan (format ribuan pake titik)
        const formatNum = (num) => num.toLocaleString('id-ID');

        let caption = `👤 *TIKTOK PROFILE STALK*\n` +
            `═══════════════════\n\n` +
            `📛 *Nama:* ${user.nickname}\n` +
            `🏷️ *Username:* @${user.username} ${user.verified ? '✅' : ''}\n` +
            `🆔 *User ID:* ${user.userId}\n` +
            `🌐 *Region:* ${user.region || '-'} (${user.language || '-'})\n` +
            `🔒 *Akun Privat:* ${user.privateAccount ? 'Ya 🔒' : 'Tidak 🔓'}\n` +
            `🛒 *TikTok Seller:* ${user.ttSeller ? 'Ya 🛍️' : 'Tidak'}\n` +
            `📅 *Dibuat Pada:* ${user.createdAt ? new Date(user.createdAt).toLocaleDateString('id-ID', { dateStyle: 'long' }) : '-'}\n\n` +
            `📊 *STATISTIK AKUN*\n` +
            `👥 *Followers:* ${formatNum(user.stats.followers)}\n` +
            `📉 *Following:* ${formatNum(user.stats.following)}\n` +
            `❤️ *Likes/Hearts:* ${formatNum(user.stats.hearts)}\n` +
            `🎬 *Total Video:* ${formatNum(user.stats.videos)}\n` +
            `🤝 *Teman:* ${formatNum(user.stats.friends)}\n\n` +
            `📝 *BIOGRAFI / BIO*\n` +
            `💬 _"${user.signature || 'Tidak ada bio.'}"_\n` +
            `🔗 *Bio Link:* ${user.bioLink || '-'}\n\n` +
            `🔗 *Link Profil:* ${user.profileUrl}\n` +
            `═══════════════════\n` +
            `🕒 _Update: ${new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}_`;

        // Kirim foto profil beserta detail text caption-nya
        if (user.avatar) {
            await sock.sendMessage(m.chat, { 
                image: { url: user.avatar }, 
                caption: caption 
            }, { quoted: m });
        } else {
            await sock.sendMessage(m.chat, { text: caption }, { quoted: m });
        }

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ['ttstalk'];
handler.tags = ['stalk'];
handler.command = /^(ttstalk|tiktokstalk|ttstalker|stalktt)$/i;

export default handler;
