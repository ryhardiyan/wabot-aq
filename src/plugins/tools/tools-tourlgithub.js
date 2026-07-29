/**
 * @file GitHub Repository Media Uploader (ToURL Github)
 * @module plugins/tools/tourlgh
 * @license Apache-2.0
 * @author RyharDev (Scraper) & Gemini (Structure)
 */

import axios from 'axios';

/**
 * Generator header standar untuk request ke GitHub API
 * @param {string} githubToken 
 * @returns {object}
 */
const generateGitHubHeaders = (githubToken) => ({
    'Authorization': `token ${githubToken}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'WhatsAppBot-RyharDev'
});

let handler = async (m, { sock }) => {
    const quotedMessage = m.quoted || m;
    const mediaMimetype = (quotedMessage.msg || quotedMessage).mimetype || '';

    if (!mediaMimetype) {
        return m.reply('📌 *Peringatan:* Mohon reply/kirim media yang ingin diupload ke GitHub.');
    }

    const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; 
    const mediaMessageObject = quotedMessage.msg || quotedMessage;
    const fileLengthBytes = parseInt(mediaMessageObject.fileLength || 0, 10);

    if (fileLengthBytes > MAX_FILE_SIZE_BYTES) {
        const fileLengthMB = (fileLengthBytes / (1024 * 1024)).toFixed(2);
        return m.reply(`❌ *Ukuran File Terlalu Besar!*\n\nUkuran file kamu: *${fileLengthMB} MB*\nMaximal yang diizinkan oleh GitHub API adalah *25.00 MB*.`);
    }

    const gitHubToken = process.env.GITHUB_TOKEN;
    if (!gitHubToken) {
        return m.reply('⚠️ *Error:* Token GitHub (`GITHUB_TOKEN`) belum diatur di file .env.');
    }

    const repositoryName = 'database';
    
    if (typeof global.loading === 'function') {
        await global.loading(m, sock);
    } else {
        await m.reply('⏳ _Uploading media to GitHub..._');
    }

    try {
        const headersConfig = generateGitHubHeaders(gitHubToken);

        const { data: userProfile } = await axios.get(
            'https://api.github.com/user',
            { headers: headersConfig }
        );
        const repositoryOwner = userProfile.login;

        try {
            await axios.get(
                `https://api.github.com/repos/${repositoryOwner}/${repositoryName}`,
                { headers: headersConfig }
            );
        } catch (repoError) {
            if (repoError.response?.status === 404) {
                await axios.post(
                    'https://api.github.com/user/repos',
                    {
                        name: repositoryName,
                        private: false,
                        auto_init: true
                    },
                    { headers: headersConfig }
                );
            } else {
                throw repoError;
            }
        }

        const mediaBuffer = await quotedMessage.download();

        const fileExtension = '.' + (mediaMimetype || 'bin')
            .split('/')
            .pop()
            //.replace('jpeg', 'jpg')
            //.replace('mpeg', 'mp3');

        const uniqueFilename = `${Date.now().toString(36)}${fileExtension}`;
        const targetStoragePath = `uploads/${uniqueFilename}`;

        await axios.put(
            `https://api.github.com/repos/${repositoryOwner}/${repositoryName}/contents/${targetStoragePath}`,
            {
                message: `Upload ${uniqueFilename} via WhatsApp Bot`,
                content: mediaBuffer.toString('base64')
            },
            { headers: headersConfig }
        );

        const rawContentUrl = `https://raw.githubusercontent.com/${repositoryOwner}/${repositoryName}/main/${targetStoragePath}`;

        await sock.sendMessage(
            m.chat,
            {
                text: `✅ *Upload Berhasil!*\n\n🔗 *URL:* ${rawContentUrl}`
            },
            { quoted: m }
        );

    } catch (error) {
        console.error(error);
        const errorMessage = error.response?.data?.message || error.message;
        m.reply(`❌ *Gagal mengunggah:* ${errorMessage}`);
    } finally {
        if (typeof global.loading === 'function') {
            await global.loading(m, sock, true);
        }
    }
};

handler.help = ['tourlgh'];
handler.tags = ['tools'];
handler.command = /^(tourlgh|tourlgithub)$/i;

export default handler;
