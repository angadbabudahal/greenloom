// ==========================================================================
// GREENLOOM CMS - GitHub Contents API Connector
// Server-Side Git Persistence with Conflict & Race Condition Protection
// ==========================================================================

import fs from 'fs';
import path from 'path';

export function getGitHubConfig() {
  return {
    token: (process.env.GITHUB_TOKEN || '').trim(),
    owner: (process.env.GITHUB_OWNER || 'angadbabudahal').trim(),
    repo: (process.env.GITHUB_REPO || 'greenloom').trim(),
    branch: (process.env.GITHUB_BRANCH || 'main').trim()
  };
}

export function isGitHubConfigured() {
  const config = getGitHubConfig();
  return Boolean(config.token && config.owner && config.repo);
}

/**
 * Robust fetch with timeout to prevent hanging requests.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const cleanLogUrl = url.split('?')[0];

  try {
    const startTime = Date.now();
    console.log(`[GREENLOOM CMS] --> ${options.method || 'GET'} ${cleanLogUrl}`);
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    const elapsed = Date.now() - startTime;
    console.log(`[GREENLOOM CMS] <-- HTTP ${res.status} (${elapsed}ms)`);
    return res;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      console.error(`[GREENLOOM CMS] Timed out after ${timeoutMs / 1000}s on ${cleanLogUrl}`);
      throw new Error(`GitHub API request timed out after ${timeoutMs / 1000} seconds`);
    }
    console.error(`[GREENLOOM CMS] Network error on ${cleanLogUrl}:`, err.message);
    throw err;
  }
}

/**
 * Fetch file information and content from GitHub.
 * Returns { exists, sha, content, rawData }
 */
export async function fetchGitHubFile(filePath) {
  const { token, owner, repo, branch } = getGitHubConfig();

  if (!token) {
    // Local filesystem fallback
    const localPath = path.join(process.cwd(), filePath);
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, 'utf8');
      return { exists: true, sha: null, content, local: true };
    }
    return { exists: false, sha: null, content: null, local: true };
  }

  const cleanPath = filePath.replace(/^\/+/, '');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}?ref=${encodeURIComponent(branch)}`;

  const res = await fetchWithTimeout(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Greenloom-CMS'
    }
  }, 9000);

  if (res.status === 404) {
    return { exists: false, sha: null, content: null, local: false };
  }

  if (res.status === 401) {
    throw new Error('GitHub Authentication Failed (HTTP 401). GITHUB_TOKEN is invalid or expired.');
  }

  if (res.status === 403) {
    throw new Error('GitHub Access Denied (HTTP 403). GITHUB_TOKEN lacks write permissions or rate limit was reached.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const buff = Buffer.from(data.content, 'base64');
  return {
    exists: true,
    sha: data.sha,
    content: buff.toString('utf8'),
    binaryBuffer: buff,
    local: false
  };
}

/**
 * Commit a UTF-8 text file (e.g. data/products.json) to GitHub with automatic
 * 409 conflict retry protection and timeout.
 */
export async function commitGitHubFile(filePath, textContent, message, retries = 3) {
  const { token, owner, repo, branch } = getGitHubConfig();

  // Try saving to local disk if writable
  try {
    const localPath = path.join(process.cwd(), filePath);
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(localPath, textContent, 'utf8');
  } catch (err) {
    // Vercel serverless has read-only root fs in production; this is expected
  }

  if (!token) {
    if (process.env.VERCEL) {
      throw new Error('Missing GITHUB_TOKEN environment variable in Vercel settings. Please configure GITHUB_TOKEN in Vercel Project Settings to persist changes.');
    }
    console.warn('[GREENLOOM CMS] GITHUB_TOKEN not set. Saved to local disk only.');
    return { success: true, localOnly: true };
  }

  const cleanPath = filePath.replace(/^\/+/, '');
  const base64Content = Buffer.from(textContent, 'utf8').toString('base64');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Fetch latest SHA right before committing to avoid stale conflicts
      const existing = await fetchGitHubFile(cleanPath);
      const payload = {
        message: `${message} [via Greenloom CMS]`,
        content: base64Content,
        branch
      };
      if (existing.exists && existing.sha) {
        payload.sha = existing.sha;
      }

      const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;
      const res = await fetchWithTimeout(putUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Greenloom-CMS'
        },
        body: JSON.stringify(payload)
      }, 10000);

      if (res.status === 409 && attempt < retries) {
        console.warn(`[GREENLOOM CMS] 409 Conflict on attempt ${attempt}. Retrying with fresh SHA...`);
        await new Promise(r => setTimeout(r, 400 * attempt));
        continue;
      }

      if (res.status === 401) {
        throw new Error('GitHub Authentication Failed (HTTP 401). GITHUB_TOKEN is invalid or expired.');
      }

      if (res.status === 403) {
        throw new Error('GitHub Access Denied (HTTP 403). GITHUB_TOKEN lacks write permissions for repository.');
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GitHub Commit Failed (HTTP ${res.status}): ${errText}`);
      }

      const result = await res.json();
      return { success: true, commitSha: result.commit?.sha };
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, 400 * attempt));
    }
  }
}

/**
 * Commit a binary file (e.g. image) to GitHub contents.
 * base64Data should be the pure base64 string (no "data:image/...;base64," prefix).
 */
export async function commitGitHubBinary(filePath, base64Data, message, retries = 3) {
  const { token, owner, repo, branch } = getGitHubConfig();

  // Save to local filesystem if possible
  try {
    const localPath = path.join(process.cwd(), filePath);
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(localPath, Buffer.from(base64Data, 'base64'));
  } catch (err) {
    // Expected on Vercel runtime
  }

  if (!token) {
    if (process.env.VERCEL) {
      throw new Error('Missing GITHUB_TOKEN environment variable in Vercel settings. Please configure GITHUB_TOKEN in Vercel Project Settings to upload images.');
    }
    console.warn('[GREENLOOM CMS] GITHUB_TOKEN not set. Image saved locally.');
    return { success: true, localOnly: true };
  }

  const cleanPath = filePath.replace(/^\/+/, '');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const existing = await fetchGitHubFile(cleanPath);
      const payload = {
        message: `${message} [via Greenloom CMS]`,
        content: base64Data,
        branch
      };
      if (existing.exists && existing.sha) {
        payload.sha = existing.sha;
      }

      const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;
      const res = await fetchWithTimeout(putUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Greenloom-CMS'
        },
        body: JSON.stringify(payload)
      }, 12000);

      if (res.status === 409 && attempt < retries) {
        await new Promise(r => setTimeout(r, 400 * attempt));
        continue;
      }

      if (res.status === 401) {
        throw new Error('GitHub Authentication Failed (HTTP 401). GITHUB_TOKEN is invalid or expired.');
      }

      if (res.status === 403) {
        throw new Error('GitHub Access Denied (HTTP 403). GITHUB_TOKEN lacks write permissions for repository.');
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GitHub Image Upload Failed (HTTP ${res.status}): ${errText}`);
      }

      const result = await res.json();
      return { success: true, commitSha: result.commit?.sha };
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, 400 * attempt));
    }
  }
}
