/**
 * @file Video Enhancer (Tingkatkan Kualitas Video)
 * @module plugins/tools/video-hd
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure Integration)
 */

import axios from "axios";
import FormData from "form-data";
import crypto from "node:crypto";
import { Readable } from "node:stream";

const API = "https://api.unwatermark.ai";
const WEB = "https://unblurimage.ai";
const UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";
const PRODUCT_CODE = "067003";

// Generate unique session per request
const createSessionContext = () => {
    let out = "";
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 6; i++) {
        out += chars[crypto.randomInt(chars.length)];
    }
    return {
        serial: out,
        uuid: crypto.randomUUID()
    };
};

function baseHeaders(ctx, extra = {}) {
    return {
        accept: "*/*",
        origin: WEB,
        referer: `${WEB}/`,
        "user-agent": UA,
        "product-code": PRODUCT_CODE,
        "product-serial": ctx.serial,
        "x-request-id": ctx.uuid,
        "sec-ch-ua-platform": "\"Android\"",
        "sec-ch-ua-mobile": "?1",
        ...extra
    };
}

async function postForm(endpoint, fields, ctx) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        form.append(key, value);
    }
    const res = await axios.post(`${API}${endpoint}`, form, {
        headers: baseHeaders(ctx, form.getHeaders()),
        validateStatus: () => true
    });
    return res.data;
}

async function putBufferToSignedUrl(uploadUrl, buffer) {
    const stream = Readable.from(buffer);
    const res = await axios.put(uploadUrl, stream, {
        headers: {
            "content-type": "video/mp4",
            "content-length": buffer.length
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true
    });
    return res.status;
}

let handler = async (m, { sock, args, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || '';
    
    // Validasi input media video
    if (!/video\/(mp4|quicktime|webm)/.test(mime)) {
        return m.reply(`*🎥 Video Enhancer (HD)*\n\n*Gunakan:* Kirim atau balas video dengan caption:\n${usedPrefix + command}`);
    }

    await global.loading(m, sock);
    const ctx = createSessionContext();

    try {
        // Download biner video WhatsApp langsung ke memori RAM
        const videoBuffer = await q.download();
        if (!videoBuffer) throw new Error("Gagal mengunduh berkas video dari WhatsApp.");

        // Step 1: Request S3 Upload Signed URL
        const uploadData = await postForm("/api/web/common/upload/video", {
            video_file_name: `${Date.now()}.mp4`
        }, ctx);

        if (uploadData?.code !== 100000 || !uploadData?.result?.url) {
            throw new Error("Gagal mendapatkan alokasi server unggah.");
        }

        const signedUrl = uploadData.result.url;
        const publicUrl = String(signedUrl).split("?")[0];

        // Step 2: Lempar buffer biner langsung ke Signed URL (Cloud Storage)
        const putStatus = await putBufferToSignedUrl(signedUrl, videoBuffer);
        if (putStatus >= 400) throw new Error(`Unggah server gagal dengan kode HTTP ${putStatus}`);

        // Step 3: Trigger Pekerjaan AI Video Enhancer
        const jobData = await postForm("/api/web/unblurimage/v1/video-enhancer/create-job", {
            original_video_url: publicUrl,
            resolution: "2k", // Set default resolusi tinggi 2K
            is_preview: "false"
        }, ctx);

        const jobId = jobData?.result?.job_id;
        if (!jobId) throw new Error("Gagal mendaftarkan antrean pemrosesan video.");

        // Step 4: Polling Status Kerja Antrean AI (Max 3-4 menit untuk proses rendering)
        let resultUrl = "";
        let maxTry = 40;
        
        await m.reply("⏳ Video berhasil diunggah. AI sedang memproses penjernihan kualitas (2K)...");

        for (let i = 0; i < maxTry; i++) {
            await new Promise(resolve => setTimeout(resolve, 6000)); // Cek tiap 6 detik
            
            const check = await axios.get(`${API}/api/web/unblurimage/v1/video-enhancer/get-job/${jobId}`, {
                headers: baseHeaders(ctx, { "content-type": "application/json; charset=UTF-8" }),
                validateStatus: () => true
            });

            const status = check.data?.result?.status;
            const outputUrl = check.data?.result?.output_url;

            if (Array.isArray(outputUrl) && outputUrl.length > 0) {
                resultUrl = outputUrl[0];
                break;
            }
            if (status === 1 && check.data?.result?.download_url) {
                resultUrl = check.data.result.download_url;
                break;
            }
            if (status === 3 || status === "failed") {
                throw new Error("AI gagal memproses penjernihan pada video ini.");
            }
        }

        if (!resultUrl) throw new Error("Proses penjernihan video memakan waktu terlalu lama (Timeout).");

        // Step 5: Kirim balik video hasil HD ke ruang obrolan
        await sock.sendMessage(m.chat, {
            video: { url: resultUrl },
            caption: `✅ *Video HD Berhasil Diproses!*\n• *Resolusi:* 2K Ultra HD\n• *Engine:* UnblurImage AI`,
            mimetype: "video/mp4"
        }, { quoted: m });

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ['hdvideo'];
handler.tags = ['tools'];
handler.command = /^(hdvid|hdvideo)$/i;

handler.onwer = true

export default handler;
