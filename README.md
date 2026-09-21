# GREENLOOM | Himalayan Hemp & Sustainable Living

A modern e-commerce web application for artisanal Himalayan organic hemp apparel, gear, and sustainable essentials. Built with Vite, Vanilla CSS/JS, and deployed on Vercel with a Git-backed Persistent CMS.

---

## Centralized GitHub-Backed CMS Architecture

The GreenLoom Admin Portal acts as a full-fledged, real-time Content Management System (CMS) where the **GitHub repository is the single source of truth**.

```
Admin Portal (Browser)
      │
      ▼  (POST / PUT / DELETE)
Vercel Serverless Function (/api/products, /api/upload)
      │  (Authenticates securely via server-side GITHUB_TOKEN)
      ▼
GitHub Contents API (api.github.com)
      │
      ├─► Commits images to:  /public/uploads/products/
      └─► Commits catalog to: /data/products.json
      │
      ▼
Vercel Automatic Build & Deployment
      │
      ▼
All Browsers, Devices, and Direct Links see the identical updated catalog!
```

### Key Advantages
- **No Lost Data**: Changes are NOT stored in browser memory, `localStorage`, or `IndexedDB`.
- **Cross-Device Consistency**: Refreshing or opening the link on any device, incognito tab, or computer displays the identical catalog.
- **Permanent Version History**: Every product addition, modification, or image upload is committed with an informative Git commit message in your repository history.
- **Zero Frontend Secret Exposure**: Your GitHub Token remains 100% on the server; the client-side JavaScript has zero access to credentials.

---

## Vercel Environment Variables Configuration

To enable server-side commits from Vercel to your GitHub repository, configure these environment variables in your **Vercel Project Dashboard**:

1. Go to **Vercel Dashboard → Your Project (greenloom) → Settings → Environment Variables**.
2. Add the following variables:

| Variable Name | Required | Description | Example Value |
|---------------|----------|-------------|---------------|
| `GITHUB_TOKEN` | **Yes** | GitHub Personal Access Token (PAT) with repository write permissions. | `ghp_xxxxxxxxxxxxxxxxxxxx` |
| `GITHUB_OWNER` | **Yes** | Your GitHub username or organization name. | `angadbabudahal` |
| `GITHUB_REPO` | **Yes** | Your GitHub repository name. | `greenloom` |
| `GITHUB_BRANCH` | Optional | Target Git branch for commits (defaults to `main`). | `main` |

> [!CAUTION]
> **SECURITY NOTICE**:
> Never prefix `GITHUB_TOKEN` with `VITE_` or `NEXT_PUBLIC_`. Keep it as `GITHUB_TOKEN` so that Vercel only exposes it to serverless API routes (`/api/*`), ensuring it is completely invisible to visitors and client-side browsers.

---

## How to Create a GitHub Personal Access Token

1. Log into your GitHub account and navigate to **Settings → Developer Settings → Personal Access Tokens → Tokens (classic)**.
   *(Or visit: https://github.com/settings/tokens)*
2. Click **Generate new token (classic)**.
3. Set a descriptive note (e.g. `Greenloom Vercel CMS Token`).
4. Select an expiration period (e.g. `90 days`, `1 year`, or `No expiration`).
5. Select the **`repo`** scope (Full control of private repositories and contents).
6. Click **Generate token** and copy the token string (`ghp_...`).
7. Paste this value into Vercel's `GITHUB_TOKEN` environment variable.

---

## Where Data & Images Are Stored

- **Product Catalog Data**:
  - File path: `/data/products.json`
  - Stores all product details (title, short title, price, MRP, category, description, badges, size variants, benefits, and image paths).
- **Uploaded Product Images**:
  - File path: `/public/uploads/products/`
  - Public web URL: `/uploads/products/{slug}-{timestamp}.{ext}`
  - Automatically served as static assets by Vercel and Vite.

---

## Local Development & Fallback Mode

During local development with `npm run dev`:
- If `GITHUB_TOKEN` is present in a local `.env` file, the CMS will commit changes directly to GitHub.
- If `GITHUB_TOKEN` is not set, the CMS gracefully falls back to saving files directly to your local filesystem (`data/products.json` and `public/uploads/products/`), allowing you to test without network credentials.

```bash
# Install dependencies
npm install

# Run local development server
npm run dev

# Production build
npm run build
```

---

## Troubleshooting Failed Operations

### 1. "Could not save product: GitHub Commit Failed (401 / 403)"
- **Cause**: The `GITHUB_TOKEN` in Vercel is missing, expired, or lacks write permissions for the repository.
- **Fix**: Re-generate your GitHub token with the `repo` scope and update the `GITHUB_TOKEN` variable in your Vercel Project Settings. Redeploy the project on Vercel.

### 2. "Unsupported image format or image too large"
- **Cause**: The uploaded image is either not a supported format or exceeds 5MB.
- **Fix**: Upload images in **JPG**, **PNG**, or **WebP** format under 5MB. The Admin Portal includes client-side pre-optimization.

### 3. "Product with ID already exists (409 Conflict)"
- **Cause**: A product with an identical slug/ID already exists.
- **Fix**: Change the product title or use the **Edit** button in the Admin Inventory list to modify the existing product.

### 4. Admin Portal Login & Credentials
- **Portal ID**: `Greenloom`
- **Password**: `Greenloom0855`
- **Security lockout**: 3 consecutive incorrect attempts locks access for 8 hours.
