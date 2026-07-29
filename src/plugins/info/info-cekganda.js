import axios from "axios";

async function fetchMobapayData(uid, zone) {
    const res = await axios.get("https://api.mobapay.com/api/app_shop", {
        headers: {
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0 (Linux; Android 10; K)"
        },
        params: {
            app_id: 100000,
            game_user_key: uid,
            game_server_key: zone,
            country: "ID",
            language: "id", // Menggunakan Bahasa Indonesia
            shop_id: 1001
        },
        timeout: 15000
    });
    return res.data;
}

let handler = async (m, { sock, args, usedPrefix, command }) => {
    if (args.length < 2) {
        return m.reply(
            `*Mobapay Checker*\n\n` +
            `*Gunakan:* ${usedPrefix + command} <uid> <zone>\n` +
            `*Contoh:* ${usedPrefix + command} 437824919 9995`
        );
    }

    const [uid, zone] = args;
    await global.loading(m, sock);

    try {
        const data = await fetchMobapayData(uid, zone);

        const shop = data?.data?.shop_info;
        const user = data?.data?.user_info;

        if (!shop || !user) {
            throw new Error("Data tidak ditemukan. Pastikan UID dan Zone benar.");
        }

        // Fungsi untuk menyaring item "First Recharge"
        const parseGoods = (goods) => {
            return (goods || [])
                .filter(item => item.label && item.label.caption === "首充商品角标")
                .map(item => ({
                    title: item.title,
                    available: !item.goods_limit?.reached_limit
                }));
        };

        const firstRecharge = [
            ...parseGoods(shop.good_list),
            ...parseGoods(shop.shelf_location?.[0]?.goods)
        ];

        if (!firstRecharge.length) {
            return m.reply("❌ Tidak ditemukan data First Recharge untuk akun ini.");
        }

        let caption = `🎮 *MOBAPAY CHECKER*\n` +
            `══════════════════════\n\n` +
            `👤 *Username:* ${user.user_name}\n` +
            `🆔 *UID:* ${uid}\n` +
            `🌐 *Zone:* ${zone}\n\n` +
            `💎 *FIRST RECHARGE STATUS:*\n`;

        firstRecharge.forEach((v, i) => {
            caption += `\n${i + 1}. ${v.title}\n`;
            caption += `   Status: ${v.available ? "✅ Tersedia" : "❌ Sudah diklaim"}\n`;
        });

        caption += `\n══════════════════════\n` +
            `🕒 _Update: ${new Date().toLocaleString('id-ID')}_`;

        await m.reply(caption);
        m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`)

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ["cekganda"];
handler.tags = ["info"];
handler.command = /^(cekganda)$/i; // Command diubah sesuai permintaan

export default handler;
