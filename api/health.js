// ==========================================================================
// GREENLOOM CMS - Health & Diagnostic API Endpoint (/api/health)
// Tests server configuration and GitHub API connectivity without exposing secrets
// ==========================================================================

import { getGitHubConfig } from './_github.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const config = getGitHubConfig();
  const missingVars = [];

  if (!config.token) missingVars.push('GITHUB_TOKEN');

  const diagnostics = {
    serverTimestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? 'vercel-production' : 'local-development',
    configuration: {
      hasGitHubToken: Boolean(config.token),
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      missingVariables: missingVars
    },
    githubConnection: {
      status: 'untested',
      accessible: false,
      message: ''
    }
  };

  if (missingVars.length > 0) {
    diagnostics.githubConnection.status = 'unconfigured';
    diagnostics.githubConnection.message = `Missing required environment variable: ${missingVars.join(', ')}`;
    return res.status(200).json(diagnostics);
  }

  // If token is present, perform a quick 6-second ping to GitHub API to verify credentials & permissions
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const startTime = Date.now();
    const testUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;
    
    console.log(`[GREENLOOM CMS] Testing GitHub connection to ${config.owner}/${config.repo}...`);

    const ghRes = await fetch(testUrl, {
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Greenloom-CMS-Diagnostic'
      }
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (ghRes.ok) {
      const data = await ghRes.json();

      // Also verify Contents permission on data/products.json
      let contentsCheck = 'Read/Write access verified';
      try {
        const contentsRes = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/data/products.json?ref=${encodeURIComponent(config.branch)}&t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${config.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Greenloom-CMS-Diagnostic'
          }
        });
        if (contentsRes.ok) {
          contentsCheck = 'Read/Write access confirmed on data/products.json';
        } else {
          contentsCheck = `Warning: contents API returned HTTP ${contentsRes.status}. Ensure token has 'Contents: Read and write' permissions.`;
        }
      } catch (cErr) {
        contentsCheck = `Warning on contents API: ${cErr.message}`;
      }

      diagnostics.githubConnection = {
        status: 'connected',
        accessible: true,
        latencyMs,
        repository: data.full_name,
        branch: config.branch,
        contentsStatus: contentsCheck,
        message: 'Successfully connected to GitHub repository with verified write access.'
      };
      return res.status(200).json(diagnostics);
    } else {
      const errBody = await ghRes.text();
      let parsedErr = errBody;
      try { parsedErr = JSON.parse(errBody).message; } catch {}

      diagnostics.githubConnection = {
        status: 'error',
        accessible: false,
        httpStatus: ghRes.status,
        latencyMs,
        message: `GitHub API returned HTTP ${ghRes.status}: ${parsedErr}`,
        troubleshooting: ghRes.status === 401 
          ? 'GITHUB_TOKEN is invalid or expired. Please generate a new token.'
          : ghRes.status === 404
          ? `Repository "${config.owner}/${config.repo}" was not found, or GITHUB_TOKEN does not have access to it.`
          : 'Check token permissions and repository name.'
      };
      return res.status(200).json(diagnostics);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    diagnostics.githubConnection = {
      status: 'failed',
      accessible: false,
      message: isTimeout 
        ? 'Connection to api.github.com timed out after 6 seconds.' 
        : `Network error connecting to GitHub: ${err.message}`,
      isTimeout
    };
    return res.status(200).json(diagnostics);
  }
}
