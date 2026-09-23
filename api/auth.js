// ==========================================================================
// GREENLOOM CMS - Administrative Authentication API Endpoint (/api/auth)
// Server-Side Verification for Admin/Intercom Portal Access
// Never exposes passwords to client browsers, logs, or repositories
// ==========================================================================

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function getAdminConfig() {
  let adminPassword = (process.env.ADMIN_INTERCOM_PASSWORD || process.env.ADMIN_PASSWORD || '').trim();
  let adminId = (process.env.ADMIN_ID || process.env.ADMIN_USERNAME || 'Greenloom').trim();

  // Local development fallback: read from local .env if not yet injected into process.env
  if (!adminPassword) {
    try {
      const envPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const matchPw = envContent.match(/^ADMIN_INTERCOM_PASSWORD=(.+)$/m) || envContent.match(/^ADMIN_PASSWORD=(.+)$/m);
        const matchId = envContent.match(/^ADMIN_ID=(.+)$/m) || envContent.match(/^ADMIN_USERNAME=(.+)$/m);
        if (matchPw && matchPw[1]) adminPassword = matchPw[1].trim().replace(/^["']|["']$/g, '');
        if (matchId && matchId[1]) adminId = matchId[1].trim().replace(/^["']|["']$/g, '');
      }
    } catch (err) {
      console.warn('[GREENLOOM CMS] Failed reading local .env file:', err.message);
    }
  }

  return {
    adminId,
    adminPassword,
    isConfigured: Boolean(adminPassword)
  };
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createSessionToken(adminId, secret) {
  const timestamp = Date.now();
  const payload = `${adminId}:${timestamp}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

export function verifySessionToken(token, secret) {
  if (!token || typeof token !== 'string' || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [b64Payload, signature] = parts;
  try {
    const payload = Buffer.from(b64Payload, 'base64url').toString('utf8');
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (!timingSafeEqualStr(signature, expectedSig)) return false;
    const [adminId, timestampStr] = payload.split(':');
    const timestamp = parseInt(timestampStr, 10);
    // Token valid for 24 hours
    if (isNaN(timestamp) || Date.now() - timestamp > 24 * 60 * 60 * 1000) return false;
    return { adminId, timestamp };
  } catch {
    return false;
  }
}

function parseRequestBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { adminId, adminPassword, isConfigured } = getAdminConfig();

  // GET: Check configuration status or verify an existing session token
  if (req.method === 'GET') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (req.query?.token || '');
    const session = isConfigured && token ? verifySessionToken(token, adminPassword) : false;

    return res.status(200).json({
      configured: isConfigured,
      authenticated: Boolean(session),
      adminId: session ? session.adminId : null
    });
  }

  // POST: Authenticate credentials submitted from Admin Portal
  if (req.method === 'POST') {
    if (!isConfigured) {
      console.error('[GREENLOOM CMS] Authentication rejected: ADMIN_INTERCOM_PASSWORD environment variable is not configured.');
      return res.status(500).json({
        success: false,
        error: 'Administrative password is not configured on the server. Please set ADMIN_INTERCOM_PASSWORD in environment variables.'
      });
    }

    const body = parseRequestBody(req);
    const submittedId = (body.id || body.username || '').trim();
    const submittedPw = (body.password || body.pw || '').trim();

    if (!submittedId || !submittedPw) {
      return res.status(400).json({
        success: false,
        error: 'Both Admin ID and password are required.'
      });
    }

    // Verify ID (case-insensitive comparison)
    const isIdValid = submittedId.toLowerCase() === adminId.toLowerCase();

    // Verify password (constant-time comparison)
    const isPwValid = timingSafeEqualStr(submittedPw, adminPassword);

    if (isIdValid && isPwValid) {
      const token = createSessionToken(adminId, adminPassword);
      return res.status(200).json({
        success: true,
        message: 'Administrative authentication successful.',
        token,
        adminId
      });
    }

    // Failed attempt — return generic 401 without detailing which field was wrong
    return res.status(401).json({
      success: false,
      error: 'Invalid administrative credentials.'
    });
  }

  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
