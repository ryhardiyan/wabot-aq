/**
 * @file Minecraft Server Status Checker via mcstatus.io (With Player List)
 * @module plugins/tools/mcstatus
 * @license Apache-2.0
 * @author Nazir (Scraper) & Gemini (Structure)
 */

import axios from 'axios';

/**
 * Scraper Logic untuk mengambil status server MC
 */
async function getMinecraftStatus(ip) {
    const { data } = await axios.get(`https://api.mcstatus.io/v2/status/java/${ip}`, {
        timeout: 10000
    });
    return data;
}

let handler = async (m, { sock }) => {
    // Alamat IP tujuan dikunci secara permanen
    const targetIp = "103.42.116.182:25045"; 

    await global.loading(m, sock);

    try {
        const status = await getMinecraftStatus(targetIp);
        
        // URL Widget Java Image sebagai visual utama
        const widgetImageUrl = `https://api.mcstatus.io/v2/widget/java/${targetIp}`;

        let caption = `🎮 *MINECRAFT SERVER STATUS*\n` +
            `══════════════════════\n\n` +
            `🌐 *IP Address:* ${status.ip_address || targetIp}\n` +
            `📍 *Host/Port:* ${status.host}:${status.port}\n` +
            `🟢 *Status:* ${status.online ? "ONLINE ✅" : "OFFLINE ❌"}\n`;

        if (status.online) {
            const cleanMotd = status.motd?.clean ? status.motd.clean.trim() : "-";
            
            caption += `📝 *MOTD:* \n_${cleanMotd}_\n\n` +
                `📊 *STATISTIK UTAMA*\n` +
                `   • 👥 Players: *${status.players?.online || 0} / ${status.players?.max || 0}*\n` +
                `   • ⚙️ Version: ${status.version?.name_clean || status.version?.name_raw || "-"}\n` +
                `   • 🆔 Protocol: ${status.version?.protocol || "-"}\n`;

            if (status.software) {
                caption += `   • 💻 Software: ${status.software}\n`;
            }

            // --- PERBAIKAN & TAMBAHAN DI SINI ---
            // Mengambil daftar nama player yang sedang online
            if (status.players?.list && status.players.list.length > 0) {
                // Mengambil max 15 player agar teks tidak kepanjangan di WhatsApp
                const playersOnline = status.players.list.slice(0, 15).map(p => p.name_clean || p.name_raw).join(', ');
                caption += `\n👤 *PLAYERS ONLINE:*\n` +
                    `   _${playersOnline}_\n`;
                
                if (status.players.list.length > 15) {
                    caption += `   _(dan ${status.players.list.length - 15} pemain lainnya...)_\n`;
                }
            } else if (status.players?.online > 0) {
                // Jika jumlah player > 0 tapi list kosong, artinya server menyembunyikan "Sample Players"
                caption += `\n👤 *PLAYERS ONLINE:*\n` +
                    `   _(Daftar nama disembunyikan oleh server)_\n`;
            }

            caption += `\n⚙️ *KONFIGURASI & EKSTENSI*\n`;
            caption += `   • 🔐 EULA Blocked: ${status.eula_blocked ? "⚠️ Ya" : "✅ Aman"}\n`;

            if (status.mods && status.mods.length > 0) {
                caption += `   • 📦 Mods loaded: ${status.mods.length} mods\n`;
            }

            if (status.plugins && status.plugins.length > 0) {
                caption += `   • 🔌 Plugins: ${status.plugins.map(p => p.name).join(', ')}\n`;
            }
        } else {
            caption += `\n_Server tidak merespon atau sedang maintenance._\n`;
        }

        const infoTime = status.retrieved_at 
            ? new Date(status.retrieved_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
            : new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

        caption += `\n══════════════════════\n` +
            `🕒 _Data Terakhir: ${infoTime} WIB_`;

        await sock.sendMessage(m.chat, {
            image: { url: widgetImageUrl },
            caption: caption
        }, { quoted: m });

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* Gagal terhubung ke API mcstatus.io atau server sedang down.`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.command = /^(server)$/i;

export default handler;
