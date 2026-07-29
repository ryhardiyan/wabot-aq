/**
 * @file Clash/Meta Proxy & Config Account Converter
 * @module plugins/tools/converter
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure)
 */

import YAML from 'yaml';

const BASE_CONFIG = {
  port: 7890,
  "socks-port": 7891,
  "redir-port": 7892,
  "mixed-port": 7893,
  "tproxy-port": 7895,
  ipv6: false,
  mode: "rule",
  "log-level": "silent",
  "allow-lan": true,
  "external-controller": "0.0.0.0:9090",
  secret: "",
  "bind-address": "*",
  "unified-delay": true,
  profile: { "store-selected": true, "store-fake-ip": true },
  dns: {
    enable: true,
    ipv6: false,
    "use-host": true,
    "enhanced-mode": "fake-ip",
    listen: "0.0.0.0:7874",
    nameserver: ["8.8.8.8", "1.0.0.1", "https://dns.google/dns-query"],
    fallback: ["1.1.1.1", "8.8.4.4", "https://cloudflare-dns.com/dns-query", "112.215.203.254"],
    "default-nameserver": ["8.8.8.8", "1.1.1.1", "112.215.203.254"],
    "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter": [
      "*.lan", "*.localdomain", "*.example", "*.invalid", "*.localhost", "*.test", "*.local", "*.home.arpa",
      "time.*.com", "ntp.*.com", "+.pool.ntp.org", "music.163.com", "*.music.163.com", "*.126.net"
    ]
  },
  proxies: [],
  "proxy-groups": [{ name: "PROXY", type: "select", proxies: [] }],
  rules: ["MATCH,PROXY"]
};

// ==================== [ PARSER UTILS FUNCTIONS ] ====================
function decodeVmessBase64(str) {
  try {
    const src = str.trim().startsWith("vmess://") ? str.trim().slice(8) : str.trim();
    const jsonStr = Buffer.from(src, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch { return null; }
}

function parseVlessTrojanURL(url) {
  try {
    let proto = url.startsWith('vless://') ? 'vless' : (url.startsWith('trojan://') ? 'trojan' : null);
    if (!proto) return null;
    const _url = url.replace(/^(vless|trojan):\/\//, '');
    const [mainPart, ...fragParts] = _url.split('#');
    const desc = fragParts.join('#');
    const [addressPart, ...paramParts] = mainPart.split('?');
    const params = new URLSearchParams(paramParts.join('?'));
    const match = addressPart.match(/^([^@]+)@([^:]+):(\d+)$/);
    if (!match) return null;
    return { proto, user: match[1], address: match[2], port: match[3], params, desc, original: url };
  } catch { return null; }
}

function validateAddress(addr) {
  const ipPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const domainPattern = /^([a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.)+[a-zA-Z]{2,}$/;
  return ipPattern.test(addr) || domainPattern.test(addr);
}

function detectProto(text) {
  if (/^vmess:\/\/[A-Za-z0-9+/=]+$/.test(text)) return 'vmess';
  if (/^vless:\/\/[A-Za-z0-9\-]+@[^:]+:\d+/.test(text)) return 'vless';
  if (/^trojan:\/\/[^@]+@[^:]+:\d+/.test(text)) return 'trojan';
  return null;
}

function getWildcardDomain(addrBaru, domainLama) {
  if (/^[0-9.]+$/.test(domainLama)) return domainLama;
  if (!domainLama) return `${addrBaru}.domain.com`;
  return `${addrBaru}.${domainLama}`;
}

function configToProxies(configType, configObj) {
  let proxyBase = { "skip-cert-verify": true, udp: true };
  const isVmess = configType === "vmess";
  const sni = isVmess ? (configObj.sni || configObj.host || configObj.add) : (configObj.params.get("sni") || configObj.address);
  const network = isVmess ? (configObj.net || "tcp") : (configObj.params.get("type") || configObj.params.get("network") || "tcp");

  proxyBase = {
    ...proxyBase,
    name: isVmess ? (configObj.ps || "VMess_Proxy") : (configObj.desc ? decodeURIComponent(configObj.desc) : `${configType.toUpperCase()}_Proxy`),
    server: isVmess ? configObj.add : configObj.address,
    port: parseInt(configObj.port || "443"),
    type: configType,
    sni,
    network
  };

  if (configType === "trojan") proxyBase.password = configObj.user;
  if (configType === "vless" || isVmess) proxyBase.uuid = isVmess ? configObj.id : configObj.user;
  
  if (isVmess) {
    proxyBase.alterId = configObj.aid ? parseInt(configObj.aid) : 0;
    proxyBase.cipher = configObj.cipher || "auto";
    proxyBase.tls = configObj.tls === "tls";
  } else {
    proxyBase.tls = true; 
  }

  const path = isVmess ? configObj.path : configObj.params.get("path");
  const host = isVmess ? configObj.host : configObj.params.get("host");

  if (network === "ws" || path) {
    proxyBase["ws-opts"] = {
      path: path || "/",
      headers: { Host: host || sni }
    };
  }
  if (network === "grpc") {
    proxyBase["grpc-opts"] = {
      "grpc-service-name": isVmess ? "" : (configObj.params.get("serviceName") || "")
    };
  }
  return proxyBase;
}

// ==================== [ MAIN EXECUTOR ] ====================

let handler = async (m, { sock, text, usedPrefix, command, isOwner }) => {
	
  if (!isOwner) return m.reply(`This command is restricted to the system owner only.\nContact the administrator for permission.`);
  // Ambil data link dari pesan teks biasa atau dari hasil reply chat/quote
  let targetText = (m.quoted && m.quoted.text) ? m.quoted.text.trim() : text.trim();

  // Parsing argumen inline: format perintah -> /convert [mode] [new_address] [wildcard y/n] | [link_account]
  // Contoh: /convert config sg.bug.com y vmess://xxxx
  const parts = targetText.split(/\s+/);
  
  if (!text || parts.length < 4 || !detectProto(parts[parts.length - 1])) {
    return m.reply(
      `🛠️ *CLASH CONFIG INLINE GENERATOR*\n\n` +
      `Gunakan format satu baris perintah berikut:\n` +
      `\`${usedPrefix + command} [config/proxies] [bug] [wildcard: y/n] [link]\`\n\n` +
      `*Contoh:*\n` +
      `\`${usedPrefix + command} config sg.server.com y vmess://ey...==\`\n\n`
    );
  }

  const convertMode = parts[0].toLowerCase();
  const addrBaru = parts[1];
  const wildcardOpt = parts[2].toLowerCase();
  const accountLink = parts[parts.length - 1]; // Mengambil bagian paling akhir sebagai link v2ray

  // Validasi Parameter Input
  if (convertMode !== "proxies" && convertMode !== "config") {
    return m.reply("❌ Mode tidak valid. Pilih antara `proxies` atau `config`.");
  }
  if (!validateAddress(addrBaru)) {
    return m.reply("❌ Format server/IP baru tidak valid. Gunakan domain atau alamat IPv4.");
  }
  if (wildcardOpt !== "y" && wildcardOpt !== "n") {
    return m.reply("❌ Opsi wildcard salah. Masukkan pilihan `y` (ya) atau `n` (tidak).");
  }

  const proto = detectProto(accountLink);
  let configObj = proto === 'vmess' ? decodeVmessBase64(accountLink) : parseVlessTrojanURL(accountLink);
  
  if (!configObj) {
    return m.reply(`❌ Gagal membaca enkripsi struktur data link ${proto ? proto.toUpperCase() : 'V2RAY'}.`);
  }

  if (global.loading) await global.loading(m, sock);
  const isWildcard = wildcardOpt === 'y';

  // Menyusun injeksi parameter address baru
  if (proto === 'vmess') {
    configObj.add = addrBaru; configObj.address = addrBaru;
    if (isWildcard) {
      let domainLama = configObj.host || configObj.sni || '';
      const wildcardDomain = getWildcardDomain(addrBaru, domainLama);
      if (configObj.host !== undefined) configObj.host = wildcardDomain;
      if (configObj.sni !== undefined) configObj.sni = wildcardDomain;
    }
  } else {
    configObj.address = addrBaru;
    if (isWildcard) {
      let domainLama = configObj.params.get('host') || configObj.params.get('sni') || '';
      const wildcardDomain = getWildcardDomain(addrBaru, domainLama);
      if (configObj.params.has('host')) configObj.params.set('host', wildcardDomain);
      if (configObj.params.has('sni')) configObj.params.set('sni', wildcardDomain);
    }
  }

  const proxyResult = configToProxies(proto, configObj);
  if (!proxyResult) {
    if (global.loading) await global.loading(m, sock, true);
    return m.reply(`❌ Terjadi malfungsi saat menyusun skema core proxy.`);
  }

  // --- [ PACKAGING OUTPUT INLINE ] ---
  try {
    if (convertMode === "proxies") {
      const proxiesYaml = YAML.stringify({ proxies: [proxyResult] });
      await sock.sendMessage(m.chat, { text: `✅ *KONVERSI INLINE PROXIES BERHASIL*\n\n\`\`\`yaml\n${proxiesYaml}\`\`\`` }, { quoted: m });
    } else if (convertMode === "config") {
      let finalConfig = JSON.parse(JSON.stringify(BASE_CONFIG));
      finalConfig.proxies = [proxyResult];
      finalConfig["proxy-groups"][0].proxies = [proxyResult.name, "DIRECT"];
      const configYaml = YAML.stringify(finalConfig);

      await sock.sendMessage(m.chat, {
        document: Buffer.from(configYaml, "utf8"),
        fileName: `${proxyResult.name.replace(/[^a-zA-Z0-9]/g, "_")}_config.yaml`,
        mimetype: "text/yaml",
        caption: `✅ *CONFIG CLASH UTUH BERHASIL DI-GENERATE*`
      }, { quoted: m });
    }
  } catch {
    m.reply(`❌ Terjadi error internal sewaktu memproses file YAML.`);
  } finally {
    if (global.loading) await global.loading(m, sock, true);
  }
};

handler.help = ['convert'];
handler.tags = ['internet'];
handler.command = /^(convert|yamlgen|clashgen)$/i;

export default handler;
