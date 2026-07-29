/**
 * @file Roblox Profile Stalker / Scraper (Clean & Formatted)
 * @module plugins/tools/robloxstalk
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure)
 */

import axios from 'axios';

const ROBLOX_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
};

const safeGetRequest = async (url) => { 
    try { 
        const response = await axios.get(url, { headers: ROBLOX_HEADERS }); 
        return response.data; 
    } catch { 
        return null; 
    } 
};

const safePostRequest = async (url, requestBody) => { 
    try { 
        const response = await axios.post(url, requestBody, { headers: ROBLOX_HEADERS }); 
        return response.data; 
    } catch { 
        return null; 
    } 
};

const getRobloxUserId = async (robloxUsername) => { 
    const resultData = await safePostRequest('https://users.roblox.com/v1/usernames/users', { 
        usernames: [robloxUsername], 
        excludeBannedUsers: false 
    }); 
    return resultData?.data?.[0] || null; 
};

const getRobloxUserDetails = (userId) => safeGetRequest(`https://users.roblox.com/v1/users/${userId}`);

const getRobloxAvatar = async (userId) => { 
    const responseData = await safeGetRequest(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`); 
    return responseData?.data?.[0]?.imageUrl || null; 
};

const getRobloxUserPresence = async (userId) => { 
    const responseData = await safePostRequest('https://presence.roblox.com/v1/presence/users', { userIds: [userId] }); 
    const rawPresence = responseData?.userPresences?.[0] || {}; 
    
    const presenceStatusMapping = { 
        0: 'Offline', 
        1: 'Online (Website)', 
        2: 'Playing Game', 
        3: 'In Studio' 
    }; 
    
    return { 
        status: presenceStatusMapping[rawPresence.userPresenceType] || 'Offline', 
        isOnline: rawPresence.userPresenceType !== 0, 
        lastOnline: rawPresence.lastOnline ? new Date(rawPresence.lastOnline).toLocaleString('id-ID') : 'Tersembunyi/Tidak Diketahui', 
        placeId: rawPresence.placeId || null, 
        gameName: rawPresence.lastLocation || 'Tidak sedang bermain game' 
    }; 
};

const getRobloxSocialCounts = async (userId) => { 
    const [friendsData, followersData, followingData] = await Promise.all([ 
        safeGetRequest(`https://friends.roblox.com/v1/users/${userId}/friends/count`), 
        safeGetRequest(`https://friends.roblox.com/v1/users/${userId}/followers/count`), 
        safeGetRequest(`https://friends.roblox.com/v1/users/${userId}/followings/count`) 
    ]); 
    return { 
        friendsCount: friendsData?.count || 0, 
        followersCount: followersData?.count || 0, 
        followingCount: followingData?.count || 0 
    }; 
};

const getRobloxBadges = async (userId) => { 
    const badgesData = await safeGetRequest(`https://badges.roblox.com/v1/users/${userId}/badges?limit=10&sortOrder=Desc`); 
    if (!badgesData?.data?.length) return []; 
    
    const badgeIdsList = badgesData.data.map(badge => badge.id); 
    const thumbnailData = await safeGetRequest(`https://thumbnails.roblox.com/v1/badges/icons?badgeIds=${badgeIdsList.join(',')}&size=150x150&format=Png`); 
    
    const badgeImageCache = {}; 
    thumbnailData?.data?.forEach(image => { 
        badgeImageCache[image.targetId] = image.imageUrl; 
    }); 
    
    return badgesData.data.map(badge => ({ 
        id: badge.id, 
        name: badge.name, 
        description: badge.description, 
        imageUrl: badgeImageCache[badge.id] || null, 
        awardedDate: new Date(badge.awardedDate).toLocaleDateString('id-ID') 
    })); 
};

const getRobloxFriendList = async (userId) => { 
    const friendsData = await safeGetRequest(`https://friends.roblox.com/v1/users/${userId}/friends?sortOrder=Desc&limit=10`); 
    if (!friendsData?.data?.length) return []; 
    
    const friendIdsList = friendsData.data.map(friend => friend.id); 
    const headshotData = await safeGetRequest(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${friendIdsList.join(',')}&size=150x150&format=Png&isCircular=true`); 
    
    const headshotImageCache = {}; 
    headshotData?.data?.forEach(image => { 
        headshotImageCache[image.targetId] = image.imageUrl; 
    }); 
    
    return Promise.all(friendsData.data.map(async friend => { 
        const detailInfo = await safeGetRequest(`https://users.roblox.com/v1/users/${friend.id}`); 
        return { 
            id: friend.id, 
            username: detailInfo?.name || friend.name, 
            displayName: detailInfo?.displayName || friend.displayName, 
            isOnline: friend.isOnline, 
            avatarUrl: headshotImageCache[friend.id] || null 
        }; 
    })); 
};

const getRobloxGroups = async (userId) => { 
    const groupsData = await safeGetRequest(`https://groups.roblox.com/v1/users/${userId}/groups/roles`); 
    if (!groupsData?.data) return []; 
    return groupsData.data.map(groupRole => ({ 
        id: groupRole.group.id, 
        name: groupRole.group.name, 
        memberCount: groupRole.group.memberCount, 
        rank: groupRole.role.name, 
        rankId: groupRole.role.rank 
    })); 
};

const getRobloxGames = async (userId) => { 
    const gamesData = await safeGetRequest(`https://games.roblox.com/v2/users/${userId}/games?accessFilter=Public&limit=10&sortOrder=Asc`); 
    if (!gamesData?.data?.length) return []; 
    return gamesData.data.map(game => ({ 
        id: game.id, 
        name: game.name, 
        description: game.description || '-', 
        placeVisits: game.placeVisits || 0, 
        createdDate: game.created ? new Date(game.created).toLocaleDateString('id-ID') : '-', 
        updatedDate: game.updated ? new Date(game.updated).toLocaleDateString('id-ID') : '-' 
    })); 
};

let handler = async (m, { sock, text, usedPrefix, command }) => {
    let targetUsername = text ? text.replace(/@\d+/g, '').trim() : '';
    
    if (!targetUsername && m.quoted) {
        targetUsername = m.quoted.text ? m.quoted.text.trim() : '';
    }

    if (!targetUsername) {
        return m.reply(
            `🎮 *Roblox Profile Stalker*\n\n` +
            `Mendapatkan informasi detail akun pemain Roblox.\n\n` +
            `*Gunakan:* ${usedPrefix + command} [username_roblox]\n` +
            `📌 *Contoh:* ${usedPrefix + command} Builderman`
        );
    }

    if (typeof global.loading === 'function') {
        await global.loading(m, sock);
    } else {
        await m.reply('⏳ _Stalking Roblox user profile..._');
    }

    try {
        const userBasicInfo = await getRobloxUserId(targetUsername);
        if (!userBasicInfo) return m.reply('❌ *Error:* Username Roblox tidak ditemukan.');

        const userId = userBasicInfo.id;

        const [details, avatarUrl, presence, socialCounts, groups] = await Promise.all([
            getRobloxUserDetails(userId),
            getRobloxAvatar(userId),
            getRobloxUserPresence(userId),
            getRobloxSocialCounts(userId),
            getRobloxGroups(userId)
        ]);


        const groupListText = groups.slice(0, 3).map(g => `• *${g.name}* (${g.rank})`).join('\n') || '-';

        let captionResult = `🎮 *ROBLOX ACCOUNT STALK*\n\n` +
            `👤 *Nama Asli:* ${details?.name || '-'}\n` +
            `🏷️ *Display Name:* ${details?.displayName || '-'}\n` +
            `🆔 *User ID:* ${userId}\n` +
            `📆 *Dibuat Pada:* ${details?.created ? new Date(details.created).toLocaleDateString('id-ID') : '-'}\n` +
            `🛡️ *Status Akun:* ${details?.isBanned ? '❌ Banned' : '✅ Aktif'}\n` +
            `✨ *Verified Badge:* ${details?.hasVerifiedBadge ? 'Sudah Centang' : 'Tidak'}\n` +
            `📝 *Deskripsi/Bio:* _${details?.description || 'Tidak ada bio.'}_\n\n` +
            `🌐 *STATUS SEKARANG:*\n` +
            `• Aktivitas: *${presence.status}*\n` +
            `• Terakhir Online: ${presence.lastOnline}\n` +
            `• Lokasi Game: _${presence.gameName}_\n\n` +
            `?? *STATISTIK SOSIAL:*\n` +
            `• Teman (Friends): ${socialCounts.friendsCount}\n` +
            `• Pengikut (Followers): ${socialCounts.followersCount}\n` +
            `• Mengikuti (Following): ${socialCounts.followingCount}\n\n` +
            `👥 *GRUP TERKAI (Top 3):*\n${groupListText}\n\n` +
            `🔗 *Link Profil:* https://www.roblox.com/users/${userId}/profile`;

        if (avatarUrl) {
            await sock.sendMessage(m.chat, { 
                image: { url: avatarUrl }, 
                caption: captionResult 
            }, { quoted: m });
        } else {
            await sock.sendMessage(m.chat, { text: captionResult }, { quoted: m });
        }

        await m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`);

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* Gagal memproses pencarian akun Roblox (${e.message})`);
    } finally {
        if (typeof global.loading === 'function') {
            await global.loading(m, sock, true);
        }
    }
};

handler.help = ['stalkroblox'];
handler.tags = ['stalk'];
handler.command = /^(robloxstalk|stalkroblox)$/i;

export default handler;
