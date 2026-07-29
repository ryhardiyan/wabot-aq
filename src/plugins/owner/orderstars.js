import axios from "axios"

let handler = async (m, { text, sock }) => {
    if (!text || !text.includes(",") || text.split(",").length < 2) {
        return m.reply(`❌ Format salah!

Gunakan:
*/orderstars username,stars*

Contoh:
*/orderstars NhymAgnestye,50*`)
    }

    let [username, amount] = text.split(",").map(v => v.trim())
    amount = parseInt(amount)

    if (!username) {
        return m.reply("❌ Username tidak boleh kosong.")
    }

    if (isNaN(amount) || amount < 50) {
        return m.reply("❌ Minimal pembelian adalah 50 stars.")
    }

    try {
        /* ========================= */
        /* VALIDASI USERNAME */
        /* ========================= */
        const check = await axios.get(
            `https://fund.tg/api/verify-username?username=${username}`,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Referer": "https://fund.tg/"
                },
                timeout: 10000
            }
        )

        if (!check.data.exists) {
            return m.reply("❌ Username tidak ditemukan.")
        }

        /* ========================= */
        /* CREATE PAYMENT */
        /* ========================= */
        const res = await axios.post(
            "https://fund.tg/api/create-payment",
            {
                username,
                amount
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0",
                    "Referer": "https://fund.tg/"
                },
                timeout: 15000
            }
        )

        if (res.data.error) {
            return m.reply(`❌ ${res.data.error}`)
        }

        const data = res.data

        let msg = `✨ *ORDER DIBUAT*

🆔 ${data.externalId}
👤 @${data.username} (${check.data.name})
⭐ ${data.amount} Stars
💰 Rp${data.price.toLocaleString()}

🔗 Pembayaran:
${data.paymentUrl}

━━━━━━━━━━━━━━━
⏳ Menunggu pembayaran (5 menit)
━━━━━━━━━━━━━━━`

        await sock.sendMessage(m.chat, { text: msg }, { quoted: m })

        /* ========================= */
        /* START STATUS CHECK */
        /* ========================= */
        checkStatus(sock, m, data.statusUrl, data.externalId)

    } catch (e) {
        console.log("ERROR ORDER:", e.message)
        m.reply("❌ Terjadi error saat proses order.")
    }
}

handler.command = /^orderstars$/i
export default handler

/* ========================= */
/* STATUS CHECKER */
/* ========================= */
async function checkStatus(sock, m, statusUrl, orderId) {
    const start = Date.now()

    const safeDate = (d) =>
        d ? new Date(d).toLocaleString("id-ID") : "-"

    const interval = setInterval(async () => {
        try {
            // timeout 5 menit
            if (Date.now() - start > 300000) {
                clearInterval(interval)

                return sock.sendMessage(m.chat, {
                    text: `❌ Order ${orderId} dibatalkan (timeout 5 menit).`
                }, { quoted: m })
            }

            const res = await axios.get(statusUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Referer": statusUrl
                },
                timeout: 10000
            })

            if (!res.data || !res.data.invoice) return

            const invoice = res.data.invoice
            const logs = res.data.logs || []

            // kalau belum bayar, lanjut loop
            if (invoice.status !== "TRANSFERRED") return

            clearInterval(interval)

            const logsText = logs.map((l, i) => {
                return `${i + 1}. ${l.status.toUpperCase()}
🕒 ${safeDate(l.createdAt)}`
            }).join("\n\n")

            let msg = `🎉 *PEMBAYARAN BERHASIL*

━━━━━━━━━━━━━━━
🆔 ${invoice.externalId}
👤 @${invoice.userId}
⭐ ${invoice.stars} Stars
💰 Rp${invoice.expectedAmount.toLocaleString()}

📦 ${invoice.itemName}

━━━━━━━━━━━━━━━
📊 STATUS: ${invoice.status}

⏰ Dibuat: ${safeDate(invoice.createdAt)}
💸 Dibayar: ${safeDate(invoice.paidAt)}
🚀 Diproses: ${safeDate(invoice.transferredAt)}

━━━━━━━━━━━━━━━
💳 Metode:
${invoice.paymentMethods.join(", ")}

━━━━━━━━━━━━━━━
📜 LOG:
${logsText || "-"}

━━━━━━━━━━━━━━━
🔗 Status:
${invoice.statusUrl}

✨ Stars sedang dikirim... santai, ini bukan balapan 😏
`

            return sock.sendMessage(m.chat, { text: msg }, { quoted: m })

        } catch (e) {
            console.log("Retry status check:", e.message)
            // jangan stop, biarkan retry
        }
    }, 10000)
}