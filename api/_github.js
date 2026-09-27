/**
 * GitHub-as-database layer.
 * Reads/writes a JSON file in the repo through the GitHub Contents API.
 * The blob SHA is used as an optimistic-concurrency token: every request
 * re-reads the file, mutates the fresh copy, then PUTs it back with that SHA.
 * If somebody else committed in between, GitHub answers 409 and we surface
 * CONFLICT so the client can replay the identical request safely.
 */

const USER_AGENT = 'sivakasi666-admin';

function env() {
    return {
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        branch: process.env.GITHUB_BRANCH || 'main',
        token: process.env.GITHUB_TOKEN,
    };
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

function assertConfigured() {
    const { owner, repo, token } = env();
    if (!owner || !repo || !token) throw new Error(configError());
}

/** Read the current content plus the blob SHA. */
async function getFile(path) {
    assertConfigured();
    const { owner, repo, branch } = env();
    const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' +
        path + '?ref=' + encodeURIComponent(branch);
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error('GitHub read failed (' + res.status + '): ' + (await res.text()));
    const data = await res.json();
    return {
        sha: data.sha,
        content: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')),
    };
}

/** Atomic replace + commit. */
async function putFile(path, sha, content, message) {
    assertConfigured();
    const { owner, repo, branch } = env();
    const res = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
        method: 'PUT',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            message,
            content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
            sha,
            branch,
        }),
    });
    if (res.status === 409 || res.status === 422) {
        throw new Error('CONFLICT: Another update just changed ' + path + '. Please retry.');
    }
    if (!res.ok) throw new Error('GitHub write failed (' + res.status + '): ' + (await res.text()));
    return res.json();
}

/** Serialise a whole-file write through a queue to avoid interleaved writers. */
let chain = Promise.resolve();
function withLock(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(() => undefined, () => undefined);
    return run;
}

module.exports = { getFile, putFile, withLock, configError };
