/**
 * @file GitHub User Profile & Repository Scraper
 * @module plugins/tools/githubstalk
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure)
 */

import axios from 'axios';

class GitHubScraper {
    constructor() {
        this.headers = {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
        this.baseUrl = 'https://api.github.com';
    }

    async getUser(username) {
        const { data } = await axios.get(`${this.baseUrl}/users/${username}`, { headers: this.headers });
        return data;
    }

    async getRepos(username, limit = 100) {
        const perPage = Math.min(limit, 100);
        const { data: repos } = await axios.get(`${this.baseUrl}/users/${username}/repos?per_page=${perPage}`, { headers: this.headers });
        
        return repos.map(repo => ({
            name: repo.name || '',
            full_name: repo.full_name || '',
            description: repo.description || '',
            html_url: repo.html_url || '',
            language: repo.language || '',
            stargazers_count: repo.stargazers_count || 0,
            forks_count: repo.forks_count || 0,
            created_at: repo.created_at || '',
            updated_at: repo.updated_at || '',
            pushed_at: repo.pushed_at || '',
            private: repo.private || false,
            fork: repo.fork || false,
            archived: repo.archived || false,
            size: repo.size || 0,
            default_branch: repo.default_branch || ''
        }));
    }

    async getEvents(username, limit = 20) {
        const perPage = Math.min(limit, 100);
        const { data: events } = await axios.get(`${this.baseUrl}/users/${username}/events?per_page=${perPage}`, { headers: this.headers });
        
        return events.map(event => ({
            id: event.id || '',
            type: event.type || '',
            repo: event.repo?.name || '',
            created_at: event.created_at || '',
            public: event.public || false,
            actor: event.actor?.login || '',
            payload: event.payload || {}
        }));
    }

    async getFullProfile(username) {
        const [user, repos, events] = await Promise.all([
            this.getUser(username),
            this.getRepos(username),
            this.getEvents(username, 20)
        ]);

        return {
            success: true,
            author: 'RyharDev',
            data: {
                user: {
                    login: user.login || '',
                    id: user.id || 0,
                    avatar_url: user.avatar_url || '',
                    html_url: user.html_url || '',
                    type: user.type || '',
                    name: user.name || '',
                    company: user.company || '',
                    blog: user.blog || '',
                    location: user.location || '',
                    email: user.email || '',
                    bio: user.bio || '',
                    twitter_username: user.twitter_username || '',
                    public_repos: user.public_repos || 0,
                    public_gists: user.public_gists || 0,
                    followers: user.followers || 0,
                    following: user.following || 0,
                    created_at: user.created_at || '',
                    updated_at: user.updated_at || ''
                },
                repositories: repos.slice(0, 100),
                recent_events: events.slice(0, 20),
                stats: {
                    total_repos: repos.length,
                    total_stars: repos.reduce((sum, r) => sum + r.stargazers_count, 0),
                    total_forks: repos.reduce((sum, r) => sum + r.forks_count, 0),
                    languages: [...new Set(repos.map(r => r.language).filter(Boolean))]
                }
            }
        };
    }
}

const githubScraper = new GitHubScraper();


let handler = async (m, { sock, text, usedPrefix, command }) => {
    let targetUsername = text ? text.replace(/@\d+/g, '').trim() : '';
    
    if (!targetUsername && m.quoted) {
        targetUsername = m.quoted.text ? m.quoted.text.trim() : '';
    }

    if (!targetUsername) {
        return m.reply(
            `🐙 *GitHub Profile Stalker*\n\n` +
            `Mencari dan merangkum informasi data profil GitHub.\n\n` +
            `*Gunakan:* ${usedPrefix + command} [username_github]\n` +
            `📌 *Contoh:* ${usedPrefix + command} ryhardiyan`
        );
    }

    if (typeof global.loading === 'function') {
        await global.loading(m, sock);
    } else {
        await m.reply('⏳ _Stalking GitHub profile..._');
    }

    try {
        const profileData = await githubScraper.getFullProfile(targetUsername);

        const user = profileData.data.user;
        const stats = profileData.data.stats;

        let captionResult = `🐙 *GITHUB PROFILE STALK*\n\n` +
            `👤 *Nama:* ${user.name || '-'}\n` +
            `🏷️ *Username:* ${user.login}\n` +
            `🆔 *ID:* ${user.id}\n` +
            `🏢 *Perusahaan:* ${user.company || '-'}\n` +
            `📍 *Lokasi:* ${user.location || '-'}\n` +
            `🌐 *Blog:* ${user.blog || '-'}\n` +
            `🕊️ *Twitter:* ${user.twitter_username ? '@' + user.twitter_username : '-'}\n` +
            `📝 *Bio:* _${user.bio || 'Tidak ada bio.'}_\n\n` +
            `📊 *STATISTIK UTAMA:*\n` +
            `• Pengikut (Followers): ${user.followers}\n` +
            `• Mengikuti (Following): ${user.following}\n` +
            `• Publik Repo: ${user.public_repos}\n` +
            `• Total Stars: ${stats.total_stars} ⭐\n` +
            `• Total Forks: ${stats.total_forks} 🍴\n` +
            `• Bahasa Pemrograman:* ${stats.languages.join(', ') || '-'}\n\n` +
            `🔗 *Link Profile:* ${user.html_url}`;

        if (user.avatar_url) {
            await sock.sendMessage(m.chat, { 
                image: { url: user.avatar_url }, 
                caption: captionResult 
            }, { quoted: m });
        } else {
            await sock.sendMessage(m.chat, { text: captionResult }, { quoted: m });
        }

        await m.reply(`Merasa terbantu dengan bot ini?\n\nDukung kami untuk terus berkembang dan menjaga server tetap selalu aktif\nhttps://payment.lumiskin.lol\n\nTerimakasih ❤️`);

    } catch (e) {
        console.error(e);
        const errorMessage = e.response?.status === 404 
            ? 'Username GitHub tidak ditemukan.' 
            : e.message;
        m.reply(`⚠️ *Error:* ${errorMessage}`);
    } finally {
        if (typeof global.loading === 'function') {
            await global.loading(m, sock, true);
        }
    }
};

handler.help = ['stalkgithub'];
handler.tags = ['stalk'];
handler.command = /^(ghstalk|githubstalk|stalkgh)$/i;

export default handler;
