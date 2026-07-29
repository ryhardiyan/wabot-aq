/**
 * @file Tracking Couriers (Cek Resi)
 * @module plugins/tools/resi
 * @license Apache-2.0
 * @author Nazir (Scraper) & Gemini (Structure)
 */

const VALID_KURIR = {
    anteraja: "AnterAja", ems: "EMS", dse: "DSE", first: "First Logistics",
    gtl: "GoTo Logistics", ide: "ID Express", idl: "IDL Cargo", indah: "Indah Logistik",
    jnt: "J&T Express", jtcargo: "J&T Cargo", jet: "JET Express", jne: "JNE",
    jtl: "JTL Express", kgx: "KGXpress", lex: "Lazada Express", lion: "Lion Parcel",
    ninja: "Ninja Xpress", paxel: "Paxel", pcp: "PCP", pos: "Pos Indonesia",
    rex: "REX Express", rpx: "RPX", rosalia: "Rosalia Express", sap: "SAP Express",
    sentral: "Sentral Cargo", sicepat: "SiCepat", spx: "Shopee Express", star: "Star Cargo",
    tiki: "Tiki", tokopedia: "Tokopedia", troben: "Troben", wahana: "Wahana", yatama: "Yatama Air"
};

/**
 * Scraper Logic
 */
const parseTracking = (html) => {
    html = html.replace(/\r?\n|\r/g, "");
    const courierMatch = html.match(/panel-heading'>(.*?)<\/div>/);
    const courier = courierMatch ? courierMatch[1].trim() : "Unknown Courier";
    const resiMatch = html.match(/<td>No\. Resi<\/td>\s*<td>(.*?)<\/td>/);
    const resi = resiMatch ? resiMatch[1].trim() : "-";

    const history = [];
    const regex = /<tr><td>(.*?)<\/td><\/tr>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        history.push(match[1].trim());
    }

    if (history.length === 0) return null;

    let text = `📦 *TRACKING DETAILS*\n\n`;
    text += `*Kurir:* ${courier}\n`;
    text += `*No Resi:* ${resi}\n\n`;
    text += `*Riwayat Pengiriman:*\n`;
    history.forEach((h, i) => {
        text += `\n${i + 1}. ${h.replace(/<[^>]*>/g, '')}`; // Bersihkan tag HTML jika ada
    });
    return text;
};

async function cekResi(resi, kurir) {
    const pageUrl = `https://www.cekpengiriman.com/cek-resi?resi=${resi}&kurir=${kurir}`;
    const pageRes = await fetch(pageUrl, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/145.0.0.0 Safari/537.36" }
    });

    const html = await pageRes.text();
    const cookie = pageRes.headers.get("set-cookie");
    const tokenMatch = html.match(/formData\.append\("token",\s*"([^"]+)"\)/);

    if (!tokenMatch) throw new Error("Gagal mengambil token keamanan.");

    const formData = new URLSearchParams();
    formData.append("token", tokenMatch[1]);
    formData.append("resi", resi);
    formData.append("kurir", kurir);

    const res = await fetch("https://www.cekpengiriman.com/wp-content/themes/simple/includes/widget/resultResi.php", {
        method: "POST",
        body: formData,
        headers: {
            "referer": pageUrl,
            "cookie": cookie,
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/145.0.0.0 Safari/537.36"
        }
    });

    const resultHtml = await res.text();
    return parseTracking(resultHtml);
}

let handler = async (m, { sock, args, usedPrefix, command }) => {
    if (!args[0]) {
        return m.reply(
            `*Cek Resi Pengiriman*\n\n` +
            `*Gunakan:* ${usedPrefix + command} <resi> <kurir>\n` +
            `*Contoh:* ${usedPrefix + command} SPXID0123456789 spx\n\n` +
            `*List Kurir:* ${Object.keys(VALID_KURIR).join(", ")}`
        );
    }

    let resi = args[0].trim();
    let kurir = args[1]?.toLowerCase().trim();

    // Auto-detect kurir sederhana jika tidak diisi
    if (!kurir) {
        if (resi.toUpperCase().startsWith("SPX")) kurir = "spx";
        else if (resi.toUpperCase().startsWith("JP")) kurir = "jnt";
        else if (resi.toUpperCase().startsWith("TKP")) kurir = "tokopedia";
        else return m.reply("Mohon masukkan nama kurir (contoh: jne, jnt, spx, sicepat)");
    }

    if (!VALID_KURIR[kurir]) {
        return m.reply(`Kurir *${kurir}* tidak didukung.\n\n*Pilih dari:* ${Object.keys(VALID_KURIR).join(", ")}`);
    }

    await global.loading(m, sock);

    try {
        const hasil = await cekResi(resi, kurir);
        if (!hasil) throw new Error("Data tidak ditemukan. Pastikan nomor resi benar.");
        
        await m.reply(hasil);
    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ["resi"];
handler.tags = ["internet"];
handler.command = /^(resi|cekresi|track)$/i;

export default handler;
