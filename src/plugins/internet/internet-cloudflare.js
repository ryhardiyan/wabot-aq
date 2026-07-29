/**
 * @file Cloudflare DNS & Shared Access Manager - Inline Edition
 * @module plugins/tools/cloudflare
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import dayjs from 'dayjs';
import { randomBytes } from 'node:crypto';

// === Konfigurasi Path File Kredensial ke Folder Liora/database/ ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Menargetkan folder Liora/database/ (mundur dari folder plugins)
const DB_DIR = path.resolve(__dirname, '../../../database');
const USER_CONFIG_FILE = path.join(DB_DIR, 'userConfig.json');
const SHARED_ACCESS_FILE = path.join(DB_DIR, 'sharedAccess.json');

// ==================== [ JSON DATABASE HELPERS ] ====================
function readJson(file) {
  try {
    // Buat folder database terlebih dahulu jika belum ada
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, '{}');
    }
    const raw = fs.readFileSync(file, 'utf-8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch { 
    return {}; 
  }
}

function writeJson(file, data) {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Gagal menulis database:", e.message);
  }
}

// ==================== [ CORE UTILS FUNCTIONS ] ====================
function genRandomName(len = 6) {
  return randomBytes(len).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, len).toLowerCase();
}

function parseDuration(str) {
  const m = /^(\d+)([mhd])$/.exec(str);
  if (!m) return null;
  const unitMap = { m: 'minute', h: 'hour', d: 'day' };
  return dayjs().add(parseInt(m[1]), unitMap[m[2]]).toISOString();
}

// ==================== [ CLASSIFIED CLOUDFLARE API ] ====================
async function cfGetZones(email, apiKey) {
  const res = await axios.get('https://api.cloudflare.com/client/v4/zones', {
    headers: { 'X-Auth-Email': email, 'X-Auth-Key': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.data.success) throw new Error('Gagal mengambil zone domain.');
  return res.data.result.map(z => ({ name: z.name, id: z.id }));
}

async function cfGetDNS(email, apiKey, zoneId) {
  const res = await axios.get(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    headers: { 'X-Auth-Email': email, 'X-Auth-Key': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.data.success) throw new Error('Gagal menarik baris DNS.');
  return res.data.result;
}

async function cfAddDNS(email, apiKey, zoneId, type, name, content, proxied = false) {
  const res = await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
    { type, name, content, proxied },
    { headers: { 'X-Auth-Email': email, 'X-Auth-Key': apiKey, 'Content-Type': 'application/json' } }
  );
  if (!res.data.success) throw new Error('Gagal menyuntikkan DNS baru.');
  return res.data.result;
}

async function cfDelDNS(email, apiKey, zoneId, recId) {
  const res = await axios.delete(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recId}`, {
    headers: { 'X-Auth-Email': email, 'X-Auth-Key': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.data.success) throw new Error('Gagal menghapus entri DNS.');
  return res.data.result;
}

// ==================== [ BOT EXECUTOR HANDLER ] ====================
let handler = async (m, { sock, text, usedPrefix, command, isOwner }) => {
  if (!isOwner) return sock.reply(m.key.remoteJid, '❌ *Akses Ditolak:* Fitur pengelolaan DNS Cloudflare ini eksklusif untuk Owner Bot.', m);

  const args = text ? text.trim().split(/\s+/) : [];
  const subCommand = args[0] ? args[0].toLowerCase() : '';

  const userConfig = readJson(USER_CONFIG_FILE);
  const sharedAccess = readJson(SHARED_ACCESS_FILE);
  const userKey = String(m.sender);

  switch (subCommand) {

    case 'addkey': {
      if (args.length < 3) return sock.reply(m.key.remoteJid, `⚠️ *Format Salah.*\nGunakan: \`${usedPrefix + command} addkey [email] [global_api_key]\``, m);
      const [_, email, apiKey] = args;
      
      if (global.loading) await global.loading(m, sock);
      try {
        const zones = await cfGetZones(email, apiKey);
        userConfig[userKey] = { email, apiKey, zones, activeZoneId: zones.length ? zones[0].id : null };
        writeJson(USER_CONFIG_FILE, userConfig);
        await sock.reply(m.key.remoteJid, `✅ *SUKSES AKUN TERINTEGRASI*\n\n📧 *Email:* ${email}\n🌐 *Domain Terdeteksi:* ${zones.map(z => z.name).join(', ')}`, m);
      } catch (e) {
        await sock.reply(m.key.remoteJid, `❌ *Koneksi Gagal:* ${e.message}. Pastikan Kredensial Valid.`, m);
      } finally {
        if (global.loading) await global.loading(m, sock, true);
      }
      break;
    }

    case 'addshare': {
      if (args.length < 2) return sock.reply(m.key.remoteJid, `⚠️ *Format Salah.*\nGunakan: \`${usedPrefix + command} addshare [password_key]\``, m);
      const pw = args[1];
      const shared = sharedAccess[pw];

      if (!shared) return sock.reply(m.key.remoteJid, '❌ Tiket password share tidak ditemukan.', m);
      if (dayjs().isAfter(dayjs(shared.expiresAt))) return sock.reply(m.key.remoteJid, '❌ Tiket password share sudah kedaluwarsa (Expired).', m);
      
      const ownerData = userConfig[shared.owner];
      if (!ownerData) return sock.reply(m.key.remoteJid, '❌ Induk data klan owner tidak ditemukan di database.', m);

      userConfig[userKey] = { ...ownerData };
      writeJson(USER_CONFIG_FILE, userConfig);
      await sock.reply(m.key.remoteJid, '✅ *Kredensial Duplikasi Berhasil.* Akses Cloudflare berhasil disalin.', m);
      break;
    }

    case 'sharecf': {
      if (!userConfig[userKey]) return sock.reply(m.key.remoteJid, '❌ Hubungkan akun Cloudflare Anda terlebih dahulu via `addkey`.', m);
      if (args.length < 3) return sock.reply(m.key.remoteJid, `⚠️ *Format Salah.*\nGunakan: \`${usedPrefix + command} sharecf [password] [durasi: ex 1h]\``, m);
      
      const [_, password, durasi] = args;
      if (sharedAccess[password]) return sock.reply(m.key.remoteJid, '❌ Kode password tersebut sudah terpakai. Pilih string kode lain.', m);

      const expires = parseDuration(durasi);
      if (!expires) return sock.reply(m.key.remoteJid, '❌ Format durasi salah. Gunakan pola: 30m (menit), 2h (jam), atau 1d (hari).', m);

      sharedAccess[password] = { owner: userKey, expiresAt: expires };
      writeJson(SHARED_ACCESS_FILE, sharedAccess);
      await sock.reply(m.key.remoteJid, `✅ *PASSWORD SHARE TERCIPTA*\n\n🔑 *Pass:* \`${password}\`\n⏳ *Expired At:* ${dayjs(expires).format('DD-MM-YYYY HH:mm:ss')}`, m);
      break;
    }

    case 'setzone': {
      const user = userConfig[userKey];
      if (!user || !user.zones) return sock.reply(m.key.remoteJid, '❌ Integrasikan Cloudflare Anda terlebih dahulu.', m);
      
      if (args.length < 2) {
        let listZone = user.zones.map((z, i) => `*${i + 1}.* ${z.name}`).join('\n');
        return sock.reply(m.key.remoteJid, `🌐 *DAFTAR ZONE DOMAIN ANDA*\n\n${listZone}\n\n👉 Ketik: \`${usedPrefix + command} setzone [nomor_urutan]\` untuk mengaktifkan.`, m);
      }

      const idx = parseInt(args[1]) - 1;
      if (!user.zones[idx]) return sock.reply(m.key.remoteJid, '❌ Angka indeks zone tidak valid.', m);

      user.activeZoneId = user.zones[idx].id;
      writeJson(USER_CONFIG_FILE, userConfig);
      await sock.reply(m.key.remoteJid, `✅ *Zone Aktif Berubah:* \`${user.zones[idx].name}\``, m);
      break;
    }

    case 'adddns': {
      const user = userConfig[userKey];
      if (!user || !user.activeZoneId) return sock.reply(m.key.remoteJid, '❌ Zone domain belum dipilih. Jalankan `setzone` dulu.', m);
      if (args.length < 5) return sock.reply(m.key.remoteJid, `⚠️ *Format Salah.*\nGunakan: \`${usedPrefix + command} adddns [subdomain] [A/CNAME] [IP/Host] [proxy: on/off]\``, m);

      const [_, sub, type, target, proxyOpt] = args;
      const recType = type.toUpperCase();
      if (!['A', 'CNAME'].includes(recType)) return sock.reply(m.key.remoteJid, '❌ Proteksi tipe record gagal. Hanya menerima tipe `A` atau `CNAME`.', m);

      const domain = user.zones.find(z => z.id === user.activeZoneId).name;
      const fullHost = sub === '@' ? domain : `${sub}.${domain}`;
      const isProxied = proxyOpt.toLowerCase() === 'on';

      if (global.loading) await global.loading(m, sock);
      try {
        await cfAddDNS(user.email, user.apiKey, user.activeZoneId, recType, fullHost, target, isProxied);
        await sock.reply(m.key.remoteJid, `✅ *DNS RECORD TERCIPTA*\n\n🛠️ *Type:* ${recType}\n🌐 *Host:* \`${fullHost}\`\n🎯 *Target:* \`${target}\`\n🛡️ *Proxy Cloudflare:* ${isProxied ? 'ON' : 'OFF'}`, m);
      } catch (e) {
        await sock.reply(m.key.remoteJid, `❌ *Cloudflare Error:* ${e.message}`, m);
      } finally {
        if (global.loading) await global.loading(m, sock, true);
      }
      break;
    }

    case 'randomdns': {
      const user = userConfig[userKey];
      if (!user || !user.activeZoneId) return sock.reply(m.key.remoteJid, '❌ Zone domain belum ditentukan. Jalankan `setzone` dulu.', m);
      if (args.length < 4) return sock.reply(m.key.remoteJid, `⚠️ *Format Salah.*\nGunakan: \`${usedPrefix + command} randomdns [A/CNAME] [IP/Host] [proxy: on/off]\``, m);

      const [_, type, target, proxyOpt] = args;
      const recType = type.toUpperCase();
      if (!['A', 'CNAME'].includes(recType)) return sock.reply(m.key.remoteJid, '❌ Tipe record ditolak. Gunakan `A` atau `CNAME`.', m);

      const randSub = genRandomName();
      const domain = user.zones.find(z => z.id === user.activeZoneId).name;
      const fullHost = `${randSub}.${domain}`;
      const isProxied = proxyOpt.toLowerCase() === 'on';

      if (global.loading) await global.loading(m, sock);
      try {
        await cfAddDNS(user.email, user.apiKey, user.activeZoneId, recType, fullHost, target, isProxied);
        await sock.reply(m.key.remoteJid, `✅ *RANDOM SUBDOMAIN CREATED*\n\n🛠️ *Type:* ${recType}\n🌐 *Host:* \`${fullHost}\`\n🎯 *Target:* \`${target}\`\n🛡️ *Proxy:* ${isProxied ? 'ON' : 'OFF'}`, m);
      } catch (e) {
        await sock.reply(m.key.remoteJid, `❌ *Cloudflare Error:* ${e.message}`, m);
      } finally {
        if (global.loading) await global.loading(m, sock, true);
      }
      break;
    }

    case 'listdns': {
      const user = userConfig[userKey];
      if (!user || !user.activeZoneId) return sock.reply(m.key.remoteJid, '❌ Sesi zone kosong. Tentukan domain aktif lewat `setzone`.', m);

      if (global.loading) await global.loading(m, sock);
      try {
        const dnsRecords = await cfGetDNS(user.email, user.apiKey, user.activeZoneId);
        if (!dnsRecords.length) return sock.reply(m.key.remoteJid, '📭 Zone domain ini bersih dari records DNS.', m);

        let out = `📋 *DAFTAR DNS RECORDS ZONE ACTIVE*\n\n`;
        dnsRecords.forEach((d, i) => {
          out += `*${i + 1}.* \`[${d.type}]\` *${d.name}*\n↳ 🎯 Target: \`${d.content}\` ${d.proxied ? '🛡️ [Proxied]' : ''}\n\n`;
        });
        await sock.reply(m.key.remoteJid, out.trim(), m);
      } catch (e) {
        await sock.reply(m.key.remoteJid, `❌ *Gagal Fetch DNS:* ${e.message}`, m);
      } finally {
        if (global.loading) await global.loading(m, sock, true);
      }
      break;
    }

    case 'deldns': {
      const user = userConfig[userKey];
      if (!user || !user.activeZoneId) return sock.reply(m.key.remoteJid, '❌ Tentukan target zone aktif terlebih dahulu lewat `setzone`.', m);
      if (args.length < 2) return sock.reply(m.key.remoteJid, `⚠️ *Format Salah.*\nGunakan: \`${usedPrefix + command} deldns [nama_lengkap_subdomain]\` (Contoh: \`www.domain.com\`)`, m);

      const targetHost = args[1].trim().toLowerCase();

      if (global.loading) await global.loading(m, sock);
      try {
        const dnsRecords = await cfGetDNS(user.email, user.apiKey, user.activeZoneId);
        const matchRecord = dnsRecords.find(d => d.name.toLowerCase() === targetHost);
        
        if (!matchRecord) return sock.reply(m.key.remoteJid, `❌ Host \`${targetHost}\` tidak ditemukan pada daftar database zone ini.`, m);

        await cfDelDNS(user.email, user.apiKey, user.activeZoneId, matchRecord.id);
        await sock.reply(m.key.remoteJid, `✅ *Sukses Dihapus:* Record host \`${targetHost}\` telah dilenyapkan dari Cloudflare.`, m);
      } catch (e) {
        await sock.reply(m.key.remoteJid, `❌ *Gagal eksekusi penghapusan:* ${e.message}`, m);
      } finally {
        if (global.loading) await global.loading(m, sock, true);
      }
      break;
    }

    default: {
      return sock.reply(
        m.key.remoteJid,
        `🌐 *CLARIFIED CLOUDFLARE DNS MANAGEMENT*\n\n` +
        `Gunakan argumen perintah sebaris di bawah ini:\n\n` +
        `• *\`${usedPrefix + command} addkey [email] [api_key]\`*\n` +
        `  ↳ Menyimpan kredensial token akun Cloudflare.\n\n` +
        `• *\`${usedPrefix + command} setzone\`*\n` +
        `  ↳ Melihat list domain & memilih zone aktif.\n\n` +
        `• *\`${usedPrefix + command} adddns [sub] [A/CNAME] [IP/Host] [on/off]\`*\n` +
        `  ↳ Menambahkan entri DNS record baru.\n\n` +
        `• *\`${usedPrefix + command} randomdns [A/CNAME] [IP/Host] [on/off]\`*\n` +
        `  ↳ Membuat subdomain acak 6 digit instan.\n\n` +
        `• *\`${usedPrefix + command} listdns\`*\n` +
        `  ↳ Menampilkan semua daftar DNS record aktif.\n\n` +
        `• *\`${usedPrefix + command} deldns [subdomain_lengkap]\`*\n` +
        `  ↳ Menghapus DNS record secara spesifik.\n\n` +
        `• *\`${usedPrefix + command} sharecf [password] [durasi: ex 1h]\`*\n` +
        `  ↳ Membuat tiket token share credential sementara.\n\n` +
        `• *\`${usedPrefix + command} addshare [password_tiket]\`*\n` +
        `  ↳ Memasang akses kloning dari tiket owner lain.`,
        m
      );
    }
  }
};

handler.help = ['cloudflare'];
handler.tags = ['internet'];
handler.command = /^(cf|cloudflare)$/i;

export default handler;
