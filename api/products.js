// ==========================================================================
// GREENLOOM CMS - Products API Endpoint (Vercel Serverless Function)
// Handles GET, POST, PUT, DELETE for centralized product catalog
// ==========================================================================

import { fetchGitHubFile, commitGitHubFile } from './_github.js';
import fs from 'fs';
import path from 'path';

const PRODUCTS_PATH = 'data/products.json';

async function loadCurrentCatalog() {
  try {
    const file = await fetchGitHubFile(PRODUCTS_PATH);
    if (file && file.content) {
      const parsed = JSON.parse(file.content);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('[GREENLOOM CMS] Failed to fetch catalog from GitHub, falling back to local file:', err.message);
  }

  // Fallback to local file
  try {
    const localFile = path.join(process.cwd(), PRODUCTS_PATH);
    if (fs.existsSync(localFile)) {
      const content = fs.readFileSync(localFile, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('[GREENLOOM CMS] Failed to read local products.json:', err);
  }

  return [];
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
  // Enable CORS headers for safety
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // ------------------------------------------------------------------------
    // GET: Retrieve all products
    // ------------------------------------------------------------------------
    if (req.method === 'GET') {
      const products = await loadCurrentCatalog();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).json(products);
    }

    // ------------------------------------------------------------------------
    // POST: Create a new product
    // ------------------------------------------------------------------------
    if (req.method === 'POST') {
      const body = parseRequestBody(req);
      const product = body.product || body;

      if (!product || !product.name || !product.price) {
        return res.status(400).json({ error: 'Missing required product fields: name, price' });
      }

      const products = await loadCurrentCatalog();

      const slug = product.slug || product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const newId = product.id || `greenloom-${slug}-${Date.now().toString().slice(-4)}`;

      // Check for duplicate ID
      if (products.some(p => p.id === newId)) {
        return res.status(409).json({ error: `Product with ID "${newId}" already exists.` });
      }

      const completeProduct = {
        id: newId,
        slug,
        name: product.name,
        shortName: product.shortName || product.name,
        category: product.category || 'fashion',
        categoryLabel: product.categoryLabel || 'Sustainable Gear',
        brand: product.brand || 'GREENLOOM',
        brandLogo: product.brandLogo || 'images/greenloom-emblem.png',
        price: Number(product.price),
        mrp: Number(product.mrp) || Number(product.price),
        discountPercent: product.mrp > product.price 
          ? Math.round(((product.mrp - product.price) / product.mrp) * 100) 
          : 0,
        rating: Number(product.rating) || 5.0,
        reviewCount: Number(product.reviewCount) || 1,
        badges: Array.isArray(product.badges) ? product.badges : ['100% ORGANIC'],
        image: product.image || 'images/greenloom-emblem.png',
        gallery: Array.isArray(product.gallery) && product.gallery.length > 0 
          ? product.gallery 
          : [product.image || 'images/greenloom-emblem.png'],
        description: product.description || '',
        isBestSeller: Boolean(product.isBestSeller),
        isHotSelling: Boolean(product.isHotSelling),
        sizeVariants: Array.isArray(product.sizeVariants) && product.sizeVariants.length > 0
          ? product.sizeVariants
          : [{ volume: 'Standard', duration: '1 Unit', price: Number(product.price), mrp: Number(product.mrp) || Number(product.price) }],
        benefits: Array.isArray(product.benefits) && product.benefits.length > 0
          ? product.benefits
          : [
              { icon: 'eco', title: '100% Himalayan Hemp', desc: 'Handcrafted sustainably from Himalayan organic fiber.' }
            ]
      };

      // Add to front of catalog
      products.unshift(completeProduct);

      // Commit to GitHub repository
      const commitRes = await commitGitHubFile(
        PRODUCTS_PATH,
        JSON.stringify(products, null, 2),
        `Add product: "${completeProduct.name}"`
      );

      return res.status(201).json({
        success: true,
        message: `Product "${completeProduct.name}" created and committed to repository.`,
        product: completeProduct,
        products,
        commit: commitRes
      });
    }

    // ------------------------------------------------------------------------
    // PUT: Update an existing product
    // ------------------------------------------------------------------------
    if (req.method === 'PUT') {
      const body = parseRequestBody(req);
      const product = body.product || body;

      if (!product || !product.id) {
        return res.status(400).json({ error: 'Missing product ID for update.' });
      }

      const products = await loadCurrentCatalog();
      const index = products.findIndex(p => p.id === product.id);

      if (index === -1) {
        return res.status(404).json({ error: `Product with ID "${product.id}" not found.` });
      }

      const existing = products[index];
      const updatedPrice = product.price !== undefined ? Number(product.price) : existing.price;
      const updatedMrp = product.mrp !== undefined ? Number(product.mrp) : existing.mrp;
      const discountPercent = updatedMrp > updatedPrice 
        ? Math.round(((updatedMrp - updatedPrice) / updatedMrp) * 100) 
        : 0;

      products[index] = {
        ...existing,
        ...product,
        price: updatedPrice,
        mrp: updatedMrp,
        discountPercent,
        gallery: Array.isArray(product.gallery) && product.gallery.length > 0
          ? product.gallery
          : [product.image || existing.image]
      };

      const commitRes = await commitGitHubFile(
        PRODUCTS_PATH,
        JSON.stringify(products, null, 2),
        `Update product: "${products[index].name}"`
      );

      return res.status(200).json({
        success: true,
        message: `Product "${products[index].name}" updated and committed to repository.`,
        product: products[index],
        products,
        commit: commitRes
      });
    }

    // ------------------------------------------------------------------------
    // DELETE: Remove a product
    // ------------------------------------------------------------------------
    if (req.method === 'DELETE') {
      const body = parseRequestBody(req);
      const id = req.query.id || body.id;

      if (!id) {
        return res.status(400).json({ error: 'Missing product ID to delete.' });
      }

      const products = await loadCurrentCatalog();
      const toDelete = products.find(p => p.id === id);

      if (!toDelete) {
        return res.status(404).json({ error: `Product with ID "${id}" not found.` });
      }

      const filtered = products.filter(p => p.id !== id);

      const commitRes = await commitGitHubFile(
        PRODUCTS_PATH,
        JSON.stringify(filtered, null, 2),
        `Delete product: "${toDelete.name}" (${id})`
      );

      return res.status(200).json({
        success: true,
        message: `Product "${toDelete.name}" deleted and committed to repository.`,
        deletedId: id,
        products: filtered,
        commit: commitRes
      });
    }

    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error('[GREENLOOM CMS] Products API Error:', error);
    return res.status(500).json({
      error: 'Failed to process product request',
      details: error.message
    });
  }
}
