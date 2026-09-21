// ==========================================================================
// GREENLOOM CMS - Image Upload API Endpoint (Vercel Serverless Function)
// Receives image data and commits permanently to GitHub /public/uploads/products/
// ==========================================================================

import { commitGitHubBinary } from './_github.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/svg+xml'
]);

const EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const body = parseRequestBody(req);
    const rawImage = body.image || body.dataUrl || body.data;
    const requestedName = (body.filename || body.name || 'product').toLowerCase();

    if (!rawImage) {
      return res.status(400).json({ error: 'No image data provided in request body.' });
    }

    let mimeType = 'image/jpeg';
    let base64Data = rawImage;

    // Check for data URL format: data:[<mediatype>][;base64],<data>
    const dataUrlMatch = rawImage.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1].toLowerCase();
      base64Data = dataUrlMatch[2];
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return res.status(400).json({
        error: `Unsupported image format: "${mimeType}". Allowed: JPG, PNG, WebP, SVG.`
      });
    }

    const approxSizeBytes = Math.round((base64Data.length * 3) / 4);
    if (approxSizeBytes > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({
        error: `Image file is too large (${Math.round(approxSizeBytes / 1024 / 1024 * 10) / 10}MB). Maximum allowed is 5MB.`
      });
    }

    const ext = EXTENSION_MAP[mimeType] || 'jpg';
    const cleanBaseName = requestedName
      .replace(/\.[^/.]+$/, '') // remove extension
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'product';

    const filename = `${cleanBaseName}-${Date.now().toString().slice(-6)}.${ext}`;
    const repoFilePath = `public/uploads/products/${filename}`;
    const publicUrl = `/uploads/products/${filename}`;

    // Commit binary file to GitHub repository
    const commitRes = await commitGitHubBinary(
      repoFilePath,
      base64Data,
      `Upload product image: ${filename}`
    );

    return res.status(200).json({
      success: true,
      url: publicUrl,
      repoPath: repoFilePath,
      filename,
      message: `Image successfully uploaded and committed to GitHub as ${filename}.`,
      commit: commitRes
    });
  } catch (error) {
    console.error('[GREENLOOM CMS] Image Upload Error:', error);
    return res.status(500).json({
      error: 'Failed to upload and commit image',
      details: error.message
    });
  }
}
