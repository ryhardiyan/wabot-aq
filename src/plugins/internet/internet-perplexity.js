/**
 * @file Perplexity AI Pro/Turbo Search Web Scraper
 * @module plugins/tools/perplexity
 * @license Apache-2.0
 * @author RyharDev (Scraper/Bypass) & Gemini (Structure Integration)
 */

import crypto from "crypto";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0";

// ==================== [ CORE FUNCTIONS BY RAFLIXYZ ] ====================

async function bootstrap() {
    const visitorId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const edgeVid = crypto.randomUUID();
    const edgeSid = crypto.randomUUID();
    const captured = [];

    try {
        const res = await fetch("https://www.perplexity.ai/", {
            headers: {
                "user-agent": UA,
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "accept-language": "en-US,en;q=0.9",
                "sec-ch-ua": '"Chromium";v="148", "Microsoft Edge";v="148", "Not/A)Brand";v="99"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "none",
                "upgrade-insecure-requests": "1"
            },
            redirect: "follow"
        });
        const setCookies = res.headers.getSetCookie?.() || [];
        for (const c of setCookies) captured.push(c.split(";")[0]);
    } catch {}

    const cookieParts = [
        `pplx.visitor-id=${visitorId}`,
        `pplx.session-id=${sessionId}`,
        `pplx.edge-vid=${edgeVid}`,
        `pplx.edge-sid=${edgeSid}`,
        "pplx.trackingAllowed=true",
        ...captured
    ];
    return { visitorId, sessionId, cookie: cookieParts.join("; ") };
}

async function readSSE(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastChunk = null;
    const allChunks = [];

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";

        for (const ev of events) {
            if (!ev.trim()) continue;
            let dataStr = "";
            for (const ln of ev.split(/\r?\n/)) {
                if (ln.startsWith("data: ")) dataStr += ln.slice(6);
                else if (ln.startsWith("data:")) dataStr += ln.slice(5).trim();
            }
            if (!dataStr || dataStr === "{}") continue;
            try {
                const obj = JSON.parse(dataStr);
                if (obj && typeof obj === "object" && Object.keys(obj).length > 0) {
                    lastChunk = obj;
                    allChunks.push(obj);
                }
            } catch {}
        }
    }
    return { lastChunk, allChunks };
}

function extractAnswerFromChunk(chunk) {
    const empty = { answer: "", chunks: [], structured: [], extra_web_results: [] };
    if (!chunk?.text) return empty;
    let steps;
    try { steps = JSON.parse(chunk.text); } catch { return empty; }
    if (!Array.isArray(steps)) return empty;
    const finalStep = steps.find(s => s.step_type === "FINAL");
    if (!finalStep?.content?.answer) return empty;
    try {
        const inner = JSON.parse(finalStep.content.answer);
        return {
            answer: inner.answer || "",
            chunks: inner.chunks || [],
            structured: inner.structured_answer || [],
            extra_web_results: inner.extra_web_results || []
        };
    } catch {
        return empty;
    }
}

function extractMedia(chunk) {
    if (!chunk?.blocks || !Array.isArray(chunk.blocks)) return [];
    const media = [];
    for (const block of chunk.blocks) {
        const items = block?.media_items_block?.media_items;
        if (Array.isArray(items)) {
            for (const it of items) {
                media.push({
                    title: it.title || it.name || "",
                    url: it.medium_url || it.url || it.image_url || it.image || "",
                });
            }
        }
    }
    return media.filter(m => m.url);
}

function cleanSources(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(s => ({
        title: s.name || s.title || "",
        url: s.url || s.link || "",
        domain: (() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return null; } })()
    })).filter(s => s.url);
}

async function perplexitySearch(query, options = {}) {
    const { mode = "copilot", model = "turbo", focus = "internet", sources = ["web"], timezone = "Asia/Jakarta", language = "id-ID", retries = 1 } = options;
    const q = String(query).trim();
    if (!q) return null;

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const session = await bootstrap();
        const frontendUuid = crypto.randomUUID();
        const cacheKey = crypto.randomUUID();
        const contextUuid = crypto.randomUUID();
        const requestId = crypto.randomUUID();
        const rumSessionId = crypto.randomUUID();

        const payload = {
            params: {
                attachments: [], language, timezone, search_focus: focus, sources,
                frontend_uuid: frontendUuid, mode, model_preference: model,
                is_related_query: false, is_sponsored: false, frontend_context_uuid: contextUuid,
                prompt_source: "user", query_source: "home", is_incognito: false,
                time_from_first_type: 3000, local_search_enabled: false, use_schematized_api: true,
                send_back_text_in_streaming_api: false,
                supported_block_use_cases: ["answer_modes", "media_items", "inline_images", "answer_tabs"],
                client_coordinates: null, mentions: [], dsl_query: q, skip_search_enabled: true,
                is_nav_suggestions_disabled: false, source: "default", always_search_override: false,
                override_no_search: false, client_search_results_cache_key: cacheKey,
                should_ask_for_mcp_tool_confirmation: true, browser_agent_allow_once_from_toggle: false,
                force_enable_browser_agent: false, supported_features: ["browser_agent_permission_banner_v1.1"],
                extended_context: false, version: "2.18", rum_session_id: rumSessionId
            },
            query_str: q
        };

        const res = await fetch("https://www.perplexity.ai/rest/sse/perplexity_ask", {
            method: "POST",
            headers: {
                "accept": "text/event-stream",
                "accept-language": "en-US,en;q=0.9",
                "cache-control": "no-cache",
                "content-type": "application/json",
                "cookie": session.cookie,
                "origin": "https://www.perplexity.ai",
                "user-agent": UA,
                "x-perplexity-request-endpoint": "https://www.perplexity.ai/rest/sse/perplexity_ask",
                "x-perplexity-request-reason": "ask-query-state-provider",
                "x-perplexity-request-try-number": String(attempt + 1),
                "x-request-id": requestId
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            lastError = `HTTP ${res.status}`;
            continue;
        }

        const { lastChunk } = await readSSE(res.body);
        if (!lastChunk) {
            lastError = "empty SSE stream";
            continue;
        }

        const inner = extractAnswerFromChunk(lastChunk);
        if (!inner.answer) {
            lastError = "no answer in final chunk";
            if (attempt < retries) continue;
        }

        return {
            query: q,
            answer: inner.answer.replace(/【\d+†[^】]*】/g, "").trim(),
            sources: cleanSources(lastChunk.sources),
            media: extractMedia(lastChunk),
            related: lastChunk.related_queries || []
        };
    }

    throw new Error(lastError || "Pencarian gagal.");
}

// ==================== [ BOT HANDLER ] ====================

let handler = async (m, { sock, text, usedPrefix, command }) => {
    let queryText = m.quoted ? m.quoted.text : text;

    if (!queryText) {
        return m.reply(
            `🌐 *Perplexity AI Search engine*\n\n` +
            `Mencari informasi terkini dari internet menggunakan kecerdasan buatan.\n\n` +
            `*Gunakan:* ${usedPrefix + command} [pertanyaan kamu]\n` +
            `*Contoh:* ${usedPrefix + command} berita olahraga sepak bola minggu ini`
        );
    }

    await global.loading(m, sock);

    try {
        // Eksekusi fungsi mesin pencari Perplexity milik @Raflixyz
        const res = await perplexitySearch(queryText);

        if (!res || !res.answer) {
            throw new Error("Gagal mengambil jawaban dari sistem Perplexity AI.");
        }

        let caption = `🌐 *PERPLEXITY SEARCH RESULT*\n` +
            `════════════════════════════\n\n` +
            `${res.answer}\n\n` +
            `════════════════════════════\n`;

        // Menyusun list referensi / sumber situs eksternal
        if (res.sources && res.sources.length > 0) {
            caption += `📌 *Referensi Sumber:*\n`;
            res.sources.slice(0, 5).forEach((src, idx) => {
                caption += `• [${idx + 1}] *${src.title || src.domain}*\n  _${src.url}_\n`;
            });
            caption += `\n`;
        }

        // Menyusun list rekomendasi topik / pertanyaan terkait
        if (res.related && res.related.length > 0) {
            caption += `💡 *Pertanyaan Terkait:*\n`;
            res.related.slice(0, 3).forEach((q) => {
                caption += `• _${q}_\n`;
            });
        }

        await sock.sendMessage(m.chat, { text: caption }, { quoted: m });

    } catch (e) {
        console.error(e);
        m.reply(`⚠️ *Error:* ${e.message}`);
    } finally {
        await global.loading(m, sock, true);
    }
};

handler.help = ["perplexity"];
handler.tags = ["internet"];
handler.command = /^(perplexity|pplx)$/i;

export default handler;
