/**
 * @file Brat Text Generator (All Modes Fixed Auto-Sticker with Premium Fake Quoted)
 * @module plugins/maker/brat
 * @license Apache-2.0
 * @author RyharDev (API Source) & Gemini (Structure Integration)
 */

import axios from 'axios';
import { sticker } from "#lib/sticker.js"; // Mengimpor fungsi stiker internal bawaan struktur bot

// Silakan ganti apikey ini jika kamu punya premium key sendiri
const API_KEY = "freeApikey"; 

let handler = async (m, { sock, args, usedPrefix, command }) => {
    let text = args.join(" ").trim();
    if (!text && m.quoted?.text) text = m.quoted.text.trim();

    if (!text) {
        return m.reply(
            `*🟢 BRAT STICKER GENERATOR*\n\n` +
            `*Cara Penggunaan (Semua otomatis jadi Sticker):*\n` +
            `│ • \`${usedPrefix + command} <teks>\` - Brat Biasa\n` +
            `│ • \`${usedPrefix + command} --anime <teks>\` - Brat Gaya Anime\n` +
            `│ • \`${usedPrefix + command} --video <teks>\` - Brat Video Bergerak\n` +
            `│ • \`${usedPrefix + command} --gif <teks>\` - Brat Animasi GIF\n\n` +
            `*Contoh:* \`${usedPrefix + command} Aku Sayanghhh Admin\``
        );
    }

    await global.loading(m, sock);

    try {
        let apiUrl = "";

        // Deteksi Sub-Command Flag
        if (text.startsWith("--anime ")) {
            let cleanText = text.replace("--anime ", "").trim();
            apiUrl = `https://anabot.my.id/api/maker/bratAnime?text=${encodeURIComponent(cleanText)}&video=false&apikey=${API_KEY}`;
        } else if (text.startsWith("--video ")) {
            let cleanText = text.replace("--video ", "").trim();
            apiUrl = `https://anabot.my.id/api/maker/bratAnime?text=${encodeURIComponent(cleanText)}&video=true&apikey=${API_KEY}`;
        } else if (text.startsWith("--gif ")) {
            let cleanText = text.replace("--gif ", "").trim();
            apiUrl = `https://anabot.my.id/api/maker/bratGif?text=${encodeURIComponent(cleanText)}&apikey=${API_KEY}`;
        } else {
            apiUrl = `https://anabot.my.id/api/maker/brat?text=${encodeURIComponent(text)}&apikey=${API_KEY}`;
        }

        // Ambil data langsung sebagai ArrayBuffer biner media dari API
        const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
        
        if (!response.data) throw new Error("Gagal mengambil data dari server API.");
        const buf = Buffer.from(response.data);

        // Menyiapkan opsi metadata stiker persis seperti bawaan bot kamu
        const opt = {
            quality: 90,
            fps: 30,
            maxDuration: 10,
            packName: global.config?.stickpack || "Brat Pack",
            authorName: global.config?.stickauth || "Nazir Bot",
            emojis: [],
        };

        // Memproses konversi buffer mentah ke WebP menggunakan fungsi internal bot
        let stc = await sticker(buf, opt);
        let step = 0;

        // Kompresi otomatis jika ukuran stiker (terutama video/gif) terlalu besar (> 1MB)
        while (stc.length > 1024 * 1024 && step < 4) {
            step++;
            opt.quality = Math.max(50, opt.quality - 10);
            if (step >= 2) opt.fps = Math.max(8, opt.fps - 2);
            stc = await sticker(buf, opt);
        }

        // ==================== [ INJECT CUSTOM FAKE MSG SENDING ] ====================
        
        const fakeMsg = {
            key: {
                remoteJid: "status@broadcast",
                fromMe: false,
                id: "BAE5C9E3C9A6C8D6",
                participant: "0@s.whatsapp.net",
            },
            message: {
                interactiveMessage: {
                    nativeFlowMessage: {
                        buttons: [{
                            name: "review_and_pay",
                            buttonParamsJson: JSON.stringify({
                                currency: "IDR",
                                total_amount: { value: 10000000, offset: 100 },
                                reference_id: "REF-" + Math.random().toString(36).substring(7).toUpperCase(),
                                type: "physical-goods",
                                order: {
                                    status: "payment_requested",
                                    order_type: "PAYMENT_REQUEST",
                                    subtotal: { value: 0, offset: 100 },
                                    items: [{
                                        retailer_id: "item-" + Date.now(),
                                        name: m.pushName || "User",
                                        amount: { value: 10000000, offset: 100 },
                                        quantity: 1,
                                    }],
                                },
                                additional_note: global.botName || "Bot",
                                native_payment_methods: [],
                                share_payment_status: false,
                            }),
                        }],
                    },
                },
            },
        };

        try {
            // Mengirimkan stiker menggunakan ContextInfo Newsletter & Quoted Fake Invoice
            await sock.sendMessage(m.chat, {
                sticker: stc,
                contextInfo: {
                    isForwarded: true,
                    forwardingScore: 9999,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363416860011598@newsletter",
                        newsletterName: "MyWaSockets Luoyisse",
                        serverMessageId: 100,
                    },
                },
            }, { quoted: fakeMsg });
            m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`)
        } catch (err) {
            console.error("[replySticker] error:", err.message);
            // Fallback pengiriman standar jika objek custom metadata di atas crash/gagal
            await sock.sendMessage(m.chat, { sticker: stc }, { quoted: m });
        }

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ["brat"];
handler.tags = ["maker"];
handler.command = /^(brat)$/i;

export default handler;
