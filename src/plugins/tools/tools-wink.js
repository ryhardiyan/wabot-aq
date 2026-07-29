/**
 * @file Wink AI Video Enhancer (Ultra HD)
 * @module plugins/tools/wink-hd
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure Integration)
 */

import axios from "axios";
import FormData from "form-data";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";

const BASE_URL = "https://wink.ai";
const STRATEGY_URL = "https://strategy.app.meitudata.com";
const CLIENT_ID = "1189857605";
const VERSION = "5.1.2";
const COUNTRY_CODE = "ID";
const CLIENT_LANGUAGE = "en_US";
const CLIENT_TIMEZONE = "Asia/Jakarta";
const TASK_TYPE = "11";
const CONTENT_TYPE = "2";
const UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";

// Buat wrapper Axios dengan dukungan CookieJar global per instansiasi runtime jika diperlukan
const createWinkSession = () => {
    const gnum = crypto.randomUUID();
    const jar = new CookieJar();
    
    jar.setCookieSync(`_sm=${gnum}; Path=/; Domain=wink.ai`, BASE_URL);
    jar.setCookieSync(`meitustat=${encodeURIComponent(JSON.stringify({ wgid: gnum }))}; Path=/; Domain=wink.ai`, BASE_URL);

    const api = wrapper(axios.create({
        baseURL: BASE_URL,
        jar,
        withCredentials: true,
        validateStatus: () => true,
        headers: {
            accept: "*/*",
            origin: BASE_URL,
            referer: `${BASE_URL}/video-enhancer/upload`,
            "user-agent": UA,
            ab_info: JSON.stringify({ ab_codes: [], version: "1.4.4" })
        }
    }));

    return { api, gnum };
};

function makeTrace() {
    return `${crypto.randomBytes(16).toString("hex")}-${crypto.randomBytes(8).toString("hex")}-1`;
}

function traceHeaders() {
    const trace = makeTrace();
    return {
        "sentry-trace": trace,
        baggage: [
            "sentry-environment=release",
            "sentry-release=5.1.2%20(b60d25c477f43c6dfac4107810f26d442320f4f1)",
            "sentry-public_key=e1bf914f3448d9bc8a10c7e499d17d54",
            `sentry-trace_id=${trace.split("-")[0]}`,
            "sentry-sampled=true"
        ].join(",")
    };
}

function baseParams(gnum, extra = {}) {
    return new URLSearchParams({
        client_id: CLIENT_ID,
        version: VERSION,
        country_code: COUNTRY_CODE,
        gnum: gnum,
        client_language: CLIENT_LANGUAGE,
        client_channel_id: "",
        client_timezone: CLIENT_TIMEZONE,
        ...extra
    });
}

let handler = async (m, { sock, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || '';
    
    // Validasi input media video
    if (!/video\/(mp4|quicktime|webm)/.test(mime)) {
        return m.reply(`*🎬 Wink AI Video Enhancer (Ultra HD)*\n\n*Gunakan:* Kirim atau balas video dengan caption:\n${usedPrefix + command}`);
    }

    await global.loading(m, sock);
    
    // Inisialisasi Sesi Enkripsi & Cookie Wink AI
    const { api, gnum } = createWinkSession();

    try {
        // Download biner video WhatsApp langsung ke memori RAM
        const videoBuffer = await q.download();
        if (!videoBuffer) throw new Error("Gagal mengunduh berkas video dari WhatsApp.");

        // Step 1: Dapatkan Tanda Tangan Kebijakan (Maat Sign)
        const signParams = baseParams(gnum, { suffix: ".mp4", type: "temp", count: "1" });
        const signRes = await api.get(`/api/file/get_maat_sign.json?${signParams.toString()}`, { headers: traceHeaders() });
        if (signRes.data?.code !== 0) throw new Error("Gagal mendapatkan otorisasi tanda tangan enkripsi.");
        const sign = signRes.data.data;

        // Step 2: Dapatkan Kebijakan Unggah Qiniu
        const policyParams = new URLSearchParams({
            app: sign.app, count: String(sign.count), sig: sign.sig,
            sigTime: sign.sig_time, sigVersion: sign.sig_version, suffix: sign.suffix, type: sign.type
        });
        const policyRes = await axios.get(`${STRATEGY_URL}/upload/policy?${policyParams.toString()}`, {
            headers: { accept: "*/*", origin: BASE_URL, referer: `${BASE_URL}/`, "user-agent": UA },
            validateStatus: () => true
        });
        if (!Array.isArray(policyRes.data) || !policyRes.data[0]?.qiniu) throw new Error("Gagal mendapatkan kebijakan server penyimpanan.");
        const policy = policyRes.data[0].qiniu;

        // Step 3: Alirkan Buffer RAM langsung ke Qiniu Cloud Storage via Stream
        const form = new FormData();
        form.append("file", Readable.from(videoBuffer), { filename: `${Date.now()}.mp4`, contentType: "video/mp4" });
        form.append("token", policy.token);
        form.append("key", policy.key);
        form.append("fname", `${Date.now()}.mp4`);

        const uploadRes = await axios.post(policy.url, form, {
            headers: form.getHeaders({ origin: BASE_URL, referer: `${BASE_URL}/`, "user-agent": UA, accept: "*/*" }),
            maxBodyLength: Infinity, maxContentLength: Infinity, validateStatus: () => true
        });
        if (uploadRes.status >= 400) throw new Error("Gagal mengunggah biner video ke CDN storage.");
        const fileKey = policy.key;
        const sourceUrl = uploadRes.data.url || uploadRes.data.data || policy.data;

        // Step 4: Ambil Metadata Cover & Daftarkan Transcode
        const infoBody = baseParams(gnum, { file_key: fileKey });
        await api.post("/api/file/video_cover_and_display_info_ext.json", infoBody.toString(), {
            headers: { ...traceHeaders(), "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }
        });

        const transRes = await api.post("/api/file/video_trans_start.json", infoBody.toString(), {
            headers: { ...traceHeaders(), "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }
        });
        const transId = transRes.data?.data?.id;
        if (!transId) throw new Error("Gagal menginisialisasi prapemrosesan video.");

        // Step 5: Tunggu Proses Transcoding Selesai (Polling Cepat)
        let videoTranscoded = sourceUrl;
        const queryParams = baseParams(gnum, { id: transId });
        
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            const checkTrans = await api.get(`/api/file/video_trans_query.json?${queryParams.toString()}`, { headers: traceHeaders() });
            const transUrl = checkTrans.data?.data?.video_transcoded || checkTrans.data?.data?.transcoded_url;
            if (transUrl) {
                videoTranscoded = transUrl;
                break;
            }
        }

        // Step 6: Trigger Pengiriman Tugas Rendering AI Ultra HD
        const taskName = `Enhancer-Ultra HD-${Date.now()}`;
        const deliveryBody = baseParams(gnum, {
            type: TASK_TYPE,
            content_type: CONTENT_TYPE,
            source_url: sourceUrl,
            type_params: JSON.stringify({ is_mirror: 0, orientation_tag: 1, j_420_trans: "1", return_ext: "2" }),
            right_detail: JSON.stringify({ source: "1", touch_type: "4", function_id: "630", material_id: "63011", url: "https://wink.ai/video-enhancer/upload" }),
            ext_params: JSON.stringify({ task_name: taskName, records: TASK_TYPE, video_transcoded: videoTranscoded }),
            with_prepare: "1"
        });

        const deliveryRes = await api.post("/api/meitu_ai/delivery.json", deliveryBody.toString(), {
            headers: { ...traceHeaders(), "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }
        });
        let msgId = deliveryRes.data?.data?.msg_id || deliveryRes.data?.data?.prepare_msg_id;
        if (!msgId) throw new Error("Gagal mendaftarkan antrean pemrosesan Wink AI.");

        await m.reply("⏳ Video berhasil diantrekan. Wink AI sedang memproses peningkatan kualitas ke Ultra HD (Membutuhkan 1-3 menit)...");

        // Step 7: Polling Hasil Akhir Batch Pemrosesan AI
        let resultUrl = "";
        const maxTry = 50;

        for (let i = 0; i < maxTry; i++) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const batchParams = baseParams(gnum, { msg_ids: msgId });
            const checkBatch = await api.get(`/api/meitu_ai/query_batch.json?${batchParams.toString()}`, {
                headers: { ...traceHeaders(), referer: `${BASE_URL}/video-enhancer/upload` }
            });

            const item = checkBatch.data?.data?.item_list?.[0];
            const nextMsgId = item?.result?.result || item?.result?.msg_id || item?.msg_id;
            
            // Mengatasi rantai pengalihan ID tugas (Tugas Berantai AI Meitu)
            if (nextMsgId && nextMsgId !== msgId && !nextMsgId.startsWith("http") && !nextMsgId.startsWith("wpr_")) {
                msgId = nextMsgId;
                continue;
            }

            const mediaUrl = item?.result?.media_info_list?.[0]?.media_data || item?.result?.result_url || item?.result?.url;
            const errorCode = item?.result?.error_code;

            if (mediaUrl && mediaUrl.startsWith("http") && errorCode === 0) {
                resultUrl = mediaUrl;
                break;
            }
            if (errorCode && errorCode !== 29901 && errorCode !== 0) {
                throw new Error(`Pemrosesan AI Gagal: Kode Kesalahan ${errorCode}`);
            }
        }

        if (!resultUrl) throw new Error("Waktu tunggu pemrosesan Ultra HD habis (Timeout).");

        // Step 8: Kirim kembali Video Ultra HD yang sudah jernih ke WhatsApp
        await sock.sendMessage(m.chat, {
            video: { url: resultUrl },
            caption: `🎬 *Wink AI Video Enhancer Berhasil!*\n• *Kualitas:* Ultra HD Restoration\n• *Engine:* Wink Meitu AI App`,
            mimetype: "video/mp4"
        }, { quoted: m });

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ['wink'];
handler.tags = ['tools'];
handler.command = /^(wink)$/i;

handler.onwer = true

export default handler;
