/**
 * @file Credit Card Generator
 * @module plugins/tools/ccgen
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure)
 */

import axios from 'axios';

/**
 * Scraper Logic
 */
async function creditGenerator(type, amount) {
    const config = {
        method: 'GET',
        url: `https://backend.lambdatest.com/api/dev-tools/credit-card-generator?type=${encodeURIComponent(type)}&no-of-cards=${amount}`,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
            'Accept': 'application/json',
            'Origin': 'https://www.lambdatest.com',
            'Referer': 'https://www.lambdatest.com/free-online-tools/credit-card-number-generator'
        }
    };

    const res = await axios.request(config);
    return res.data; 
}

let handler = async (m, { sock, args, usedPrefix, command }) => {
    const allowedTypes = ["Visa", "American Express", "MasterCard", "JCB"];
    
    // Default values
    let type = "Visa";
    let amount = 5;

    // Parsing input
    if (args[0]) {
        // Cek jika input pertama adalah angka (berarti user cuma input jumlah)
        if (!isNaN(args[0])) {
            amount = parseInt(args[0]);
        } else {
            // Jika bukan angka, anggap sebagai type
            // Cari type yang mirip dari input user
            const inputType = args.join(" ").toLowerCase();
            const foundType = allowedTypes.find(t => t.toLowerCase().includes(inputType) || inputType.includes(t.toLowerCase()));
            if (foundType) type = foundType;
            
            // Cek angka di arg terakhir
            const lastArg = args[args.length - 1];
            if (!isNaN(lastArg)) amount = parseInt(lastArg);
        }
    }

    // Limit jumlah biar gak spam
    if (amount > 20) amount = 20;

    await global.loading(m, sock);

    try {
        const data = await creditGenerator(type, amount);
        
        if (!data || !Array.isArray(data)) {
            throw new Error("Gagal mendapatkan data dari server.");
        }

        let caption = `*💳 CC GENERATOR*\n\n`;
        caption += `*Type:* ${type}\n`;
        caption += `*Amount:* ${amount}\n`;
        caption += `---`.repeat(5) + `\n\n`;

        let resultText = data.map(cc => {
            // Kita pastikan data ada atau beri fallback string kosong jika undefined
            // Serta paksa jadi String sebelum menggunakan .padStart()
            const month = String(cc.expiryMonth || cc.month || "").padStart(2, '0');
            const year = cc.expiryYear || cc.year || "";
            const number = cc.cardNumber || cc.number || "";
            const cvv = cc.cvv || "";

            return `\`${number}|${month}|${year}|${cvv}\``;
        }).join("\n");

        caption += resultText;
        caption += `\n\n*Note:* Gunakan untuk keperluan testing/edukasi saja.`;

        await m.reply(caption);

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}\n\n*Tersedia:* ${allowedTypes.join(", ")}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ["ccgen"];
handler.tags = ["maker"];
handler.command = /^(ccgen|cardgen)$/i;

export default handler;
