/**
 * @file RyharPedia Webhook & Callback Server
 * @module routers/webhooks
 * @license Apache-2.0
 * @author RyharDev (Logic & Webhook) & Gemini (Structure Integration)
 */

import express from 'express';
import fs from 'fs';
import path from 'path';

// Helper untuk mengambil nominal angka dari teks (Contoh: "Rp 50.000" atau "Total: 10500" -> 50000 / 10500)
function extractAmount(text) {
    if (!text) return 0;
    // Mencari pola angka yang didahului Rp/IDR atau angka berderet panjang
    const match = text.replace(/\./g, '').match(/(?:rp|idr)?\s*(\d+)/i);
    if (match && match[1]) {
        return parseInt(match[1]) * 100; // Dikali 100 untuk offset Baileys (contoh: Rp 10.000 menjadi value: 1000000)
    }
    return 0; // Default jika tidak ada nominal terdeteksi
}

// Helper Pembuat Fake Message Invoice Dinamis
function createFakeInvoice(pushName, amountValue, noteTitle) {
    return {
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
                            total_amount: { value: amountValue || 0, offset: 100 },
                            reference_id: "REF-" + Math.random().toString(36).substring(7).toUpperCase(),
                            type: "physical-goods",
                            order: {
                                status: "payment_requested",
                                order_type: "PAYMENT_REQUEST",
                                subtotal: { value: 0, offset: 100 },
                                items: [{
                                    retailer_id: "item-" + Date.now(),
                                    name: pushName || "Customer RyharPedia",
                                    amount: { value: amountValue || 0, offset: 100 },
                                    quantity: 1,
                                }],
                            },
                            additional_note: noteTitle || "RyharPedia Bot",
                            native_payment_methods: [],
                            share_payment_status: false,
                        }),
                    }],
                },
            },
        },
    };
}

// Konfigurasi Tambahan Context Info Forward Saluran Resmi
const channelContext = {
    isForwarded: true,
    forwardingScore: 9999,
    forwardedNewsletterMessageInfo: {
        newsletterJid: "120363416860011598@newsletter",
        newsletterName: "MyWaSockets Luoyisse",
        serverMessageId: 100,
    }
};

export default function initAllWebhooks(conn) {
    const app = express();
    const PORT = process.env.SERVER_PORT || 6104; // Port 6104 sesuai panel Pterodactyl
    
    // Konfigurasi Folder Database
    const dirPath = './database';
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log('[📂] Folder database berhasil dibuat otomatis.');
    }

    // =========================================================================
    // [1] ROUTE WEBHOOK ORKUT (NOTIFIKASI PEMBAYARAN)
    // =========================================================================
    app.get('/orkut', async (req, res) => {
        const data = req.query.data || '';
        const filePathOrkut = path.join(dirPath, 'orkut_notif.json');

        if (data) {
            const timestamp = new Date().toLocaleString('id-ID');
            let history = [];
            if (fs.existsSync(filePathOrkut)) {
                try { history = JSON.parse(fs.readFileSync(filePathOrkut, 'utf-8')); } catch (e) { history = []; }
            }
            const newEntry = { timestamp, notification: data };
            history.unshift(newEntry); 
            fs.writeFileSync(filePathOrkut, JSON.stringify(history.slice(0, 50), null, 2));

            try {
                const groupId = '6285694770248-1616860328@g.us';
                const msg = `🛒 *PEMBAYARAN BERHASIL*\n\n${data}\n\n> _${timestamp}_`;
                
                // Ambil nominal uang dari parameter data Orkut secara dinamis
                const dynamicAmount = extractAmount(data);
                const fakeInvoice = createFakeInvoice("Customer RyharPedia", dynamicAmount, "Payment Success");

                // Kirim Pesan dengan Fake Invoice + Forward Newsletter
                await sock.sendMessage(groupId, { 
                    text: msg,
                    contextInfo: channelContext
                }, { quoted: fakeInvoice });

                console.log(`[📩] Notifikasi Orkut dengan Fake Invoice Rp${dynamicAmount / 100} berhasil terkirim.`);
            } catch (err) {
                console.error('❌ Gagal kirim WA Orkut:', err);
            }
            return res.json({ success: true, data: newEntry });
        }

        if (fs.existsSync(filePathOrkut)) {
            res.json(JSON.parse(fs.readFileSync(filePathOrkut, 'utf-8')));
        } else {
            res.json({ success: false, message: "Belum ada riwayat Orkut." });
        }
    });

    // =========================================================================
    // [2] ROUTE CALLBACK OKECONNECT (MENANGKAP ?refid=...&message=...)
    // =========================================================================
    app.get('/callback', async (req, res) => {
        const refid = req.query.refid || '';
        const message = req.query.message || '';
        const filePathCallback = path.join(dirPath, 'callback_transaksi.json');

        if (refid || message) {
            const timestamp = new Date().toLocaleString('id-ID');

            let history = [];
            if (fs.existsSync(filePathCallback)) {
                try { history = JSON.parse(fs.readFileSync(filePathCallback, 'utf-8')); } catch (e) { history = []; }
            }
            
            const newEntry = { timestamp, refid, message };
            history.unshift(newEntry); 
            fs.writeFileSync(filePathCallback, JSON.stringify(history.slice(0, 50), null, 2));
            console.log(`[💾] Callback Terbaca! Sukses mencatat RefID: ${refid} ke DB.`);

            // PARSING / MEMOTONG TEKS SECARA OTOMATIS & DINAMIS
            const words = message.split(/\s+/);
            const reffId = words.find(w => w.startsWith('T#')) || '-';
            const code = words.find(w => w.startsWith('R#')) || '-';

            let status = 'PENDING', statusIcon = 'ℹ️', statusTitle = 'INFO TRANSAKSI';
            if (message.toUpperCase().includes('SUKSES')) {
                status = 'SUKSES'; statusIcon = '✅'; statusTitle = 'TRANSAKSI SUKSES';
            } else if (message.toUpperCase().includes('GAGAL')) {
                status = 'GAGAL'; statusIcon = '❌'; statusTitle = 'TRANSAKSI GAGAL';
            }

            let sn = '-';
            const snIndex = words.findIndex(w => w.toUpperCase().startsWith('SN:'));
            if (snIndex !== -1 && words[snIndex + 1]) {
                sn = words[snIndex + 1].replace(/\.$/, '');
            } else {
                const snMatch = message.match(/SN:\s*([^\s]+)/i);
                sn = snMatch ? snMatch[1].replace(/\.$/, '') : '-';
            }

            const dateMatch = message.match(/(@\d{2}\/\d{2}\s+\d{2}:\d{2})/);
            const txDate = dateMatch ? dateMatch[1] : '-';

            let produk = '-';
            let tujuan = '-';
            const codeIndex = words.findIndex(w => w.startsWith('R#'));
            
            if (codeIndex !== -1) {
                const statusIndex = words.findIndex(w => w.toUpperCase().includes('SUKSES') || w.toUpperCase().includes('GAGAL'));
                if (statusIndex !== -1 && statusIndex > codeIndex) {
                    tujuan = words[statusIndex - 1]; 
                    const produkArray = words.slice(codeIndex + 1, statusIndex - 1); 
                    produk = produkArray.join(' '); 
                }
            }

            // OPER / KIRIM KE WHATSAPP GRUP
            try {
                const groupId = '6285694770248-1616860328@g.us';
                
                const msg = `${statusIcon} *${statusTitle}*\n\n` +
                            `📝 *Reff ID:* ${reffId}\n` +
                            `🔑 *Code:* ${code}\n` +
                            `📦 *Produk:* ${produk}\n` +
                            `🎯 *Tujuan:* ${tujuan}\n` +
                            `⚡ *Status:* ${status}\n` +
                            `🧾 *SN:* ${sn}\n` +
                            `📅 *Date:* ${txDate}\n\n` +
                            `Terimakasih telah membeli produk di *RyharPedia*. Silahkan datang kembali ya. 🙏✨\n\n` +
                            `_Hubungi admin jika ada kendala: (0882008211320)_`;

                // Ambil nominal uang secara dinamis dari isi pesan callback OkeConnect
                const dynamicAmount = extractAmount(message);
                const fakeInvoice = createFakeInvoice(`Tujuan: ${tujuan}`, dynamicAmount, `RyharPedia - ${status}`);

                // Kirim Pesan Utama Menggunakan Fake Invoice Terkustomisasi
                await conn.sendMessage(groupId, { 
                    text: msg,
                    contextInfo: channelContext
                }, { quoted: fakeInvoice });

                console.log(`[📩] Notifikasi otomatis dengan Invoice nominal Rp${dynamicAmount / 100} berhasil dikirim ke WhatsApp.`);
            } catch (err) {
                console.error('❌ Gagal oper ke WA:', err);
            }

            return res.json({ 
                refid: refid, 
                message: message.replace(/\\\//g, '/') 
            });
        }

        if (fs.existsSync(filePathCallback)) {
            res.json(JSON.parse(fs.readFileSync(filePathCallback, 'utf-8')));
        } else {
            res.json({ success: false, message: "Belum ada riwayat callback transaksi otomatis." });
        }
    });

    // =========================================================================
    // RUN SERVER EXPRESS (PORT 6104)
    // =========================================================================
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n==================================================`);
        console.log(`✅ SERVER UTAMA RYHARPEDIA RUNNING DI PORT ${PORT}`);
        console.log(`🔗 Webhook Pembayaran Orkut: http://localhost:${PORT}/orkut`);
        console.log(`🔗 Callback OkeConnect     : http://localhost:${PORT}/callback`);
        console.log(`==================================================\n`);
    });
}
