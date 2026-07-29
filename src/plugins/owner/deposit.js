/**
 * @file Deposit QRIS handler (Paymentku)
 */

import fetch from "node-fetch"
import qrcode from "qrcode"

const API_KEY = "tw_3028572409059fdcd97cb56792152274"

let handler = async (m, { sock, text }) => {

    if (!text) {
        return m.reply(`❌ Format salah!

Gunakan:
*/depo nominal*

Contoh:
*/depo 10000*`)
    }

    let nominal = parseInt(text.replace(/[^\d]/g, ""))

    if (isNaN(nominal)) {
        return m.reply("❌ Nominal tidak valid.")
    }

    if (nominal < 1000) {
        return m.reply("❌ Minimal deposit Rp1.000")
    }

    if (nominal > 499000) {
        return m.reply("❌ Maksimal deposit Rp499.000")
    }

    try {

        /* ========================= */
        /* CREATE PAYMENT */
        /* ========================= */
        const res = await fetch("https://tools.techwiz.id/api/paymentku/create", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": API_KEY
            },
            body: JSON.stringify({
                nominal,
                apiKey: API_KEY
            })
        })

        const data = await res.json()

        if (!data.success) {
            return m.reply("❌ Gagal membuat pembayaran.")
        }

        const pay = data.payment

        /* ========================= */
        /* QR GENERATE */
        /* ========================= */
        let qr = await qrcode.toDataURL(pay.qrisString, { scale: 8 })

        /* ========================= */
        /* MESSAGE */
        /* ========================= */
        let msg = `💳 *DEPOSIT QRIS*

━━━━━━━━━━━━━━━
🆔 ${pay.id}
💰 Nominal: Rp${Number(pay.nominal).toLocaleString()}
🔢 Kode Unik: ${pay.uniqueCode}

💵 Total Bayar:
Rp${Number(pay.finalAmount).toLocaleString()}

━━━━━━━━━━━━━━━
📊 Status: ${pay.status.toUpperCase()}

⏰ Dibuat: ${pay.createdAt}
⌛ Expired: ${pay.expiresAt}

━━━━━━━━━━━━━━━
📌 *Cara Bayar:*
1. Buka E-Wallet / M-Banking
2. Scan QRIS di atas
3. Pastikan nominal sesuai
4. Selesaikan pembayaran

━━━━━━━━━━━━━━━
⏳ Menunggu pembayaran (10 menit)
`

        const sent = await sock.sendMessage(m.chat, {
            image: { url: qr },
            caption: msg
        }, { quoted: m })

        /* ========================= */
        /* CHECK STATUS LOOP */
        /* ========================= */
        const start = Date.now()
        let success = false

        while (Date.now() - start < 600000) { // 10 menit
            await delay(5000)

            try {
                const cek = await fetch(`https://tools.techwiz.id/api/paymentku/status?paymentId=${pay.id}&apiKey=${API_KEY}`, {
                    headers: {
                        "X-API-Key": API_KEY
                    }
                })

                const stat = await cek.json()

                if (!stat.success) continue

                const invoice = stat.payment

                if (invoice.status === "success") {
                    success = true

                    let doneMsg = `🎉 *PEMBAYARAN BERHASIL*

━━━━━━━━━━━━━━━
🆔 ${invoice.id}
💰 Nominal: Rp${Number(invoice.amount).toLocaleString()}
💵 Total Bayar: Rp${Number(invoice.finalAmount).toLocaleString()}

📊 Status: ${invoice.status.toUpperCase()}

━━━━━━━━━━━━━━━
✅ Saldo akan segera diproses.
Terima kasih telah melakukan deposit 🙏`

                    await sock.sendMessage(m.chat, {
                        text: doneMsg
                    }, { quoted: m })

                    break
                }

            } catch (e) {
                console.log("cek error:", e.message)
            }
        }

        /* ========================= */
        /* TIMEOUT */
        /* ========================= */
        if (!success) {
            await sock.sendMessage(m.chat, {
                text: `❌ Deposit ${pay.id} dibatalkan (expired 10 menit).`
            }, { quoted: m })
        }

        /* ========================= */
        /* DELETE QR */
        /* ========================= */
        await sock.sendMessage(m.chat, {
            delete: sent.key
        })

    } catch (e) {
        console.log(e)
        m.reply("❌ Terjadi kesalahan saat membuat deposit.")
    }
}

handler.command = /^depo$/i

export default handler

/* ========================= */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}