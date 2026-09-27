const fs = require('fs');
const pathModule = require('path');

const USER_AGENT = 'sivakasi666-admin';

function env() {
    return {
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        branch: process.env.GITHUB_BRANCH || 'main',
        token: process.env.GITHUB_TOKEN,
    };
}

function isPlaceholderToken(token) {
    return !token || token === 'your_github_token_here' || token.startsWith('your_');
}

function getLocalFile(filePath) {
    const fullPath = pathModule.resolve(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
        const raw = fs.readFileSync(fullPath, 'utf8');
        return {
            sha: 'local-file-sha',
            content: JSON.parse(raw),
        };
    }
    throw new Error('Local file not found: ' + filePath);
}

function putLocalFile(filePath, content) {
    const fullPath = pathModule.resolve(process.cwd(), filePath);
    fs.writeFileSync(fullPath, JSON.stringify(content, null, 2), 'utf8');
    return { ok: true, local: true };
}

function configError() {
    return 'GitHub storage is not configured (GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN)';
}

function headers(extra) {
    const { token } = env();
    return Object.assign({
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': USER_AGENT,
    }, extra || {});
}

/** Read the current content plus the blob SHA. */
async function getFile(filePath) {
    const { owner, repo, branch, token } = env();

    if (isPlaceholderToken(token) || !owner || !repo) {
        return getLocalFile(filePath);
    }

    try {
        const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' +
            filePath + '?ref=' + encodeURIComponent(branch);
        const res = await fetch(url, { headers: headers() });

        if (!res.ok) {
            const errText = await res.text();
            if (res.status === 401 || res.status === 404) {
                console.warn('[api/_github] GitHub fetch returned ' + res.status + '. Falling back to local file:', filePath);
                return getLocalFile(filePath);
            }
            throw new Error('GitHub read failed (' + res.status + '): ' + errText);
        }

        const data = await res.json();
        return {
            sha: data.sha,
            content: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')),
        };
    } catch (err) {
        if (err.message && err.message.includes('Local file')) throw err;
        console.warn('[api/_github] Falling back to local file due to error:', err.message);
        return getLocalFile(filePath);
    }
}

/** Atomic replace + commit. */
async function putFile(filePath, sha, content, message) {
    const { owner, repo, branch, token } = env();

    if (isPlaceholderToken(token) || !owner || !repo) {
        return putLocalFile(filePath, content);
    }

    try {
        const res = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + filePath, {
            method: 'PUT',
            headers: headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                message,
                content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
                sha,
                branch,
            }),
        });

        if (res.status === 401) {
            console.warn('[api/_github] 401 Bad credentials on write. Falling back to writing local file:', filePath);
            return putLocalFile(filePath, content);
        }

        if (res.status === 409 || res.status === 422) {
            throw new Error('CONFLICT: Another update just changed ' + filePath + '. Please retry.');
        }

        if (!res.ok) throw new Error('GitHub write failed (' + res.status + '): ' + (await res.text()));
        return res.json();
    } catch (err) {
        if (err.message && err.message.includes('CONFLICT')) throw err;
        console.warn('[api/_github] Falling back to writing local file due to error:', err.message);
        return putLocalFile(filePath, content);
    }
}

/** Serialise a whole-file write through a queue to avoid interleaved writers. */
let chain = Promise.resolve();
function withLock(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(() => undefined, () => undefined);
    return run;
}

module.exports = { getFile, putFile, withLock, configError };

