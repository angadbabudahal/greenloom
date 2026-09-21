// ==========================================================================
// GREENLOOM - Core Client Logic & Product Administration State Management
// Pure Himalayan Organic Hemp, Superfoods, Personal Care & Eco Goods
// ==========================================================================

import { PRODUCTS, TESTIMONIALS, BRAND_LOGO_URL } from './products-data.js';

// Legacy extracted product IDs that must be completely purged from local/IndexedDB storage
export const LEGACY_PRODUCT_IDS = new Set([
  'india-hemp-hearts-500g',
  'cold-pressed-hemp-seed-oil-250ml',
  'hemp-protein-powder-500g',
  'hemp-chocolate-seed-crunch',
  'hemp-skincare-daily-butter',
  'hemp-utility-pouch',
  'noigra-pet-hemp-oil',
  'hemp-canvas-backpack'
]);

export function isLegacyProduct(p) {
  if (!p) return true;
  if (p.id && LEGACY_PRODUCT_IDS.has(p.id)) return true;
  if (p.slug && (LEGACY_PRODUCT_IDS.has(p.slug) || p.slug.includes('hemp-hearts') || p.slug.includes('cold-pressed') || p.slug.includes('noigra-pet'))) return true;
  const name = (p.name || '').toLowerCase();
  if (name.includes('hemp hearts') || name.includes('seed oil') || name.includes('body butter') || name.includes('daypack backpack')) return true;
  return false;
}

class HempStoreApp {
  constructor() {
    this.products = [...PRODUCTS];
    this.editingProductId = null;
    this.pendingDeleteProductId = null;

    this.selectedSize = 0;
    this.currentProductQty = 1;
    this.activeProduct = this.products[0];
    this.discountPercent = 0;
  }

  async init() {
    this.bindGlobalEvents();
    this.setupModals();
    this.setupAdminPortal();

    // Fetch live product catalog from centralized API
    await this.syncCentralCatalog();

    const path = window.location.pathname;
    if (path.includes('product.html') || document.getElementById('product-detail-view')) {
      this.initProductPage();
    } else if (path.includes('shop.html') || document.getElementById('shop-catalog-view')) {
      this.initShopPage();
    } else if (document.getElementById('home-view') || path === '/' || path.includes('index.html')) {
      this.initHomePage();
    }
  }

  async syncCentralCatalog() {
    try {
      const res = await fetch('/api/products', { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this.products = data;
          this.activeProduct = this.products[0];
          this.refreshCatalogViews();
          const adminModal = document.getElementById('admin-product-modal');
          if (adminModal && adminModal.classList.contains('open')) {
            this.renderAdminInventory();
          }
        }
      }
    } catch (err) {
      console.warn('[GREENLOOM CMS] Operating with bundled catalog:', err.message);
    }
  }

  // Resizes and compresses image files (canvas-based) to ensure tiny footprint (<50KB) and prevent quota errors
  async compressImageFile(file, maxDim = 800, quality = 0.75) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve('images/greenloom-emblem.png');
      reader.readAsDataURL(file);
    });
  }

  async compressBase64Image(dataUrl, maxDim = 800, quality = 0.75) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl;
    if (dataUrl.length < 70000) return dataUrl; // already small (<70KB)

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  saveProducts(newProducts) {
    this.products = newProducts;
    this.refreshCatalogViews();
  }

  refreshCatalogViews() {
    if (document.getElementById('best-sellers-rail')) {
      this.renderBestSellers();
    }
    if (document.getElementById('hot-selling-grid')) {
      this.renderHotSelling();
    }
    if (document.getElementById('shop-products-grid')) {
      this.initShopPage();
    }
    const searchInput = document.getElementById('search-modal-input');
    if (searchInput) {
      this.renderSearchResults(searchInput.value || '');
    }
  }

  // --- UI Modals & Notifications ---
  setupModals() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('open');
        }
      });
    });

    document.querySelectorAll('.trigger-search-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openSearchModal();
      });
    });
  }

  openSearchModal() {
    const modal = document.getElementById('search-modal');
    if (modal) {
      modal.classList.add('open');
      const input = document.getElementById('search-modal-input');
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 100);
        this.renderSearchResults('');
      }
    }
  }

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
  }

  showToast(message) {
    let toast = document.getElementById('global-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'global-toast';
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `
      <span class="material-symbols-outlined" style="color: var(--color-pale-herbal-cream); font-size: 20px;">check_circle</span>
      <span>${message}</span>
    `;
    toast.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // --- Home Screen Logic ---
  initHomePage() {
    this.renderBestSellers();
    this.renderHotSelling();
    this.renderTestimonials();
  }

  // Helper: Generate structured WhatsApp ordering URL
  getWhatsAppUrl(prod, size = '', qty = 1, customPrice = null) {
    const sizeStr = size ? ` [Pack: ${size}]` : '';
    const qtyStr = qty > 1 ? ` (Quantity: ${qty})` : '';
    const unitPrice = customPrice !== null ? customPrice : (prod && prod.price ? Number(prod.price) : 0);
    const priceStr = unitPrice ? ` - Total: NPR ${Number(unitPrice * qty).toLocaleString('en-NP')}` : '';
    const text = `Hi GREENLOOM, I would like to order: ${prod ? (prod.shortName || prod.name) : 'GREENLOOM Himalayan Hemp'}${sizeStr}${qtyStr}${priceStr}. Please guide me with payment and delivery details.`;
    return `https://wa.me/9779805616879?text=${encodeURIComponent(text)}`;
  }

  renderBestSellers() {
    const container = document.getElementById('best-sellers-rail');
    if (!container) return;

    let items = this.products.filter(p => p.isBestSeller);
    if (items.length < 2 && this.products.length > items.length) {
      const remaining = this.products.filter(p => !p.isBestSeller);
      items = [...items, ...remaining].slice(0, 8);
    } else if (items.length === 0) {
      items = this.products.slice(0, 8);
    }

    container.innerHTML = items.map(prod => `
      <div class="product-card-compact">
        <div class="card-img-wrap">
          ${prod.badges && prod.badges[0] ? `
            <span class="pill-badge hot-red card-tag-badge" style="font-size: 10px; padding: 3px 8px;">${prod.badges[0]}</span>
          ` : ''}
          <a href="product.html?id=${encodeURIComponent(prod.id)}" target="_blank" rel="noopener noreferrer">
            <img src="${prod.image}" alt="${prod.name}" class="card-img">
          </a>
        </div>
        <span class="card-category-tag">${prod.brand || 'GREENLOOM'}</span>
        <a href="product.html?id=${encodeURIComponent(prod.id)}" target="_blank" rel="noopener noreferrer">
          <h4 class="card-product-title">${prod.name}</h4>
        </a>
        <div class="card-price-row">
          <div class="card-price-stack">
            <span class="card-price-main">NPR ${Number(prod.price).toLocaleString('en-NP')}</span>
            ${prod.mrp ? `<span class="card-mrp-strike">NPR ${Number(prod.mrp).toLocaleString('en-NP')}</span>` : ''}
          </div>
          <a href="${this.getWhatsAppUrl(prod)}" 
             target="_blank" rel="noopener noreferrer"
             class="btn-card-whatsapp-sm" 
             title="Order on WhatsApp">
            <span class="material-symbols-outlined" style="font-size: 15px;">chat</span>
            <span>ORDER</span>
          </a>
        </div>
      </div>
    `).join('');
  }

  renderHotSelling() {
    const grid = document.getElementById('hot-selling-grid');
    if (!grid) return;

    let hotItems = this.products.filter(p => p.isHotSelling);
    if (hotItems.length < 2 && this.products.length > hotItems.length) {
      const remaining = this.products.filter(p => !p.isHotSelling);
      hotItems = [...hotItems, ...remaining].slice(0, 4);
    } else if (hotItems.length === 0) {
      hotItems = this.products.slice(0, 4);
    }

    grid.innerHTML = hotItems.map(prod => `
      <div class="product-card">
        <div>
          <div class="card-img-wrap">
            ${prod.badges && prod.badges[0] ? `
              <span class="pill-badge hot-red card-tag-badge">${prod.badges[0]}</span>
            ` : ''}
            <a href="product.html?id=${encodeURIComponent(prod.id)}" target="_blank" rel="noopener noreferrer">
              <img src="${prod.image}" alt="${prod.name}" class="card-img">
            </a>
          </div>
          <span class="card-category-tag">${prod.brand || 'GREENLOOM'}</span>
          <a href="product.html?id=${encodeURIComponent(prod.id)}" target="_blank" rel="noopener noreferrer">
            <h3 class="card-product-title">${prod.name}</h3>
          </a>
          <div class="card-price-row">
            <div class="card-price-stack">
              <span class="card-price-main">NPR ${Number(prod.price).toLocaleString('en-NP')}</span>
              ${prod.mrp ? `<span class="card-mrp-strike">NPR ${Number(prod.mrp).toLocaleString('en-NP')}</span>` : ''}
            </div>
          </div>
        </div>
        <a href="${this.getWhatsAppUrl(prod)}" target="_blank" rel="noopener noreferrer" 
           class="btn-card-whatsapp" style="text-decoration: none;">
          <span class="material-symbols-outlined" style="font-size: 16px;">chat</span>
          <span>ORDER ON WHATSAPP</span>
        </a>
      </div>
    `).join('');
  }

  renderTestimonials() {
    const rail = document.getElementById('testimonials-rail');
    if (!rail) return;

    rail.innerHTML = TESTIMONIALS.map(t => `
      <div class="testimonial-card">
        <div>
          <div class="stars-row">
            ${'<span class="material-symbols-outlined">star</span>'.repeat(t.rating)}
          </div>
          <p class="testimonial-quote">"${t.quote}"</p>
        </div>
        <div class="testimonial-author">
          <span class="author-name">${t.name}</span>
          <span class="author-badge">${t.role}</span>
        </div>
      </div>
    `).join('');
  }

  // --- Product Detail Page Logic ---
  initProductPage() {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get('item') || params.get('id');
    if (itemId && !LEGACY_PRODUCT_IDS.has(itemId)) {
      this.activeProduct = this.products.find(p => p.id === itemId || p.slug === itemId) || this.products[0];
    } else {
      this.activeProduct = this.products[0];
      if (itemId && LEGACY_PRODUCT_IDS.has(itemId) && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', `product.html?id=${encodeURIComponent(this.activeProduct.id)}`);
      }
    }

    this.selectedSize = (this.activeProduct.sizeVariants && this.activeProduct.sizeVariants.length > 1) ? 1 : 0;
    this.currentProductQty = 1;

    // Render active product into the page DOM
    this.renderProductDetailPage();
    this.bindProductInteractions();
    this.updateProductPricingDisplay();
  }

  renderProductDetailPage() {
    if (!this.activeProduct) return;

    // 1. Meta & Breadcrumb
    document.title = `${this.activeProduct.name} | GREENLOOM`;
    const bcTitle = document.getElementById('product-breadcrumb-title');
    if (bcTitle) bcTitle.textContent = this.activeProduct.shortName || this.activeProduct.name;

    // 2. Brand & Category Pill & Page Title
    const brandEl = document.getElementById('product-brand-title');
    if (brandEl) {
      brandEl.innerHTML = `${this.activeProduct.brand || 'GREENLOOM'} <span class="material-symbols-outlined icon-filled" style="font-size: 16px; color: var(--color-warm-gold-deep);">verified</span>`;
    }
    const catPill = document.getElementById('product-category-pill');
    if (catPill) catPill.textContent = this.activeProduct.categoryLabel || 'Pure Botanical';

    const pageTitle = document.getElementById('product-page-title');
    if (pageTitle) pageTitle.textContent = this.activeProduct.name;

    // 3. Social Proof (Rating & Reviews)
    const ratingVal = document.getElementById('product-rating-val');
    if (ratingVal) ratingVal.textContent = (this.activeProduct.rating || 4.9).toFixed(1);

    const reviewsLink = document.getElementById('product-reviews-link');
    if (reviewsLink) reviewsLink.textContent = `${this.activeProduct.reviewCount || 100} Customer Reviews`;

    const badgeFlag = document.getElementById('product-badge-flag');
    if (badgeFlag) {
      if (this.activeProduct.isBestSeller) {
        badgeFlag.style.display = 'inline-block';
        badgeFlag.textContent = 'Best Seller';
      } else if (this.activeProduct.badges && this.activeProduct.badges[0]) {
        badgeFlag.style.display = 'inline-block';
        badgeFlag.textContent = this.activeProduct.badges[0];
      } else {
        badgeFlag.style.display = 'none';
      }
    }

    // 4. Gallery Badges & Main Image
    const galleryBadges = document.getElementById('product-gallery-badges');
    if (galleryBadges) {
      const badges = this.activeProduct.badges && this.activeProduct.badges.length > 0 
        ? this.activeProduct.badges 
        : ['100% Himalayan Organic', 'Lab Verified Pure'];
      galleryBadges.innerHTML = badges.map(b => `
        <span class="pill-badge ${b.toLowerCase().includes('save') ? 'hot-red' : 'herbal'}">
          <span class="material-symbols-outlined" style="font-size: 12px;">eco</span>
          <span>${b}</span>
        </span>
      `).join('');
    }

    const mainImg = document.getElementById('main-product-img');
    if (mainImg) {
      mainImg.src = this.activeProduct.image;
      mainImg.alt = this.activeProduct.name;
    }

    // 5. Gallery Thumbnails Strip
    const galleryList = (this.activeProduct.gallery && this.activeProduct.gallery.length > 0) 
      ? this.activeProduct.gallery 
      : [this.activeProduct.image];

    const thumbsRow = document.getElementById('product-gallery-thumbs');
    if (thumbsRow) {
      thumbsRow.innerHTML = galleryList.map((imgUrl, i) => `
        <button class="gallery-thumb-btn ${i === 0 ? 'active' : ''}" aria-label="${this.activeProduct.name} View ${i+1}">
          <img src="${imgUrl}" alt="${this.activeProduct.name} View ${i+1}">
        </button>
      `).join('');
    }

    // 6. Dynamic Variant Selector
    const varContainer = document.getElementById('product-variants-container');
    const varGrid = document.getElementById('product-variants-grid');
    const displayHint = document.getElementById('display-size-hint');

    if (this.activeProduct.sizeVariants && this.activeProduct.sizeVariants.length > 0) {
      if (varContainer) varContainer.style.display = 'block';
      if (displayHint) displayHint.textContent = this.activeProduct.sizeVariants[this.selectedSize]?.duration || 'Select size option';
      if (varGrid) {
        varGrid.innerHTML = this.activeProduct.sizeVariants.map((v, idx) => `
          <button class="potency-btn size-select-btn ${idx === this.selectedSize ? 'active' : ''}" data-index="${idx}" style="padding: 12px 10px;">
            <strong class="font-label-md" style="color: var(--color-primary); display: block;">${v.volume || v.label || ''}</strong>
            <span class="font-body-sm" style="color: var(--color-warm-gold-deep); font-weight: 700; display: block; font-size: 11px;">${v.duration || 'Pack Option'}</span>
            <span class="font-label-md" style="color: var(--color-primary); font-weight: 700; margin-top: 4px; display: block;">NPR ${Number(v.price).toLocaleString('en-NP')}</span>
          </button>
        `).join('');
      }
    } else {
      if (displayHint) displayHint.textContent = 'Standard Himalayan Pack';
      if (varGrid) {
        varGrid.innerHTML = `
          <button class="potency-btn size-select-btn active" data-index="0" style="padding: 12px 10px;">
            <strong class="font-label-md" style="color: var(--color-primary); display: block;">Standard Pack</strong>
            <span class="font-body-sm" style="color: var(--color-warm-gold-deep); font-weight: 700; display: block; font-size: 11px;">1 Unit</span>
            <span class="font-label-md" style="color: var(--color-primary); font-weight: 700; margin-top: 4px; display: block;">NPR ${Number(this.activeProduct.price).toLocaleString('en-NP')}</span>
          </button>
        `;
      }
    }

    // 7. Product Short Description
    const shortDesc = document.getElementById('product-short-description');
    if (shortDesc) shortDesc.textContent = this.activeProduct.description;

    // 8. Natural Benefits Grid
    const { benefits } = this.getProductDetails(this.activeProduct);
    const benefitsTag = document.getElementById('benefits-section-tag');
    if (benefitsTag) benefitsTag.textContent = `${(this.activeProduct.categoryLabel || 'BOTANICAL').toUpperCase()} BENEFITS`;

    const benefitsTitle = document.getElementById('benefits-section-title');
    if (benefitsTitle) benefitsTitle.textContent = `Why Choose ${this.activeProduct.shortName || this.activeProduct.name}?`;

    const benefitsGrid = document.getElementById('benefits-section-grid');
    if (benefitsGrid) {
      benefitsGrid.innerHTML = benefits.map(b => `
        <div class="product-card" style="padding: 16px;">
          <div class="guarantee-icon-wrap" style="background: var(--color-secondary-fixed); color: var(--color-on-secondary-fixed); margin-bottom: 10px;">
            <span class="material-symbols-outlined">${b.icon}</span>
          </div>
          <h3 class="font-label-md" style="color: var(--color-primary); font-size: 14px; margin-bottom: 4px;">${b.title}</h3>
          <p class="font-body-sm" style="color: var(--color-text-muted);">${b.desc}</p>
        </div>
      `).join('');
    }

    // Seamless load transition - reveals content with 0 flicker
    document.getElementById('product-detail-view')?.classList.add('loaded');
  }

  getProductDetails(prod) {
    let benefits = prod.benefits;
    if (!benefits || benefits.length === 0) {
      if (prod.category === 'nutrition') {
        benefits = [
          { icon: "fitness_center", title: "Clean Plant Nutrition", desc: "Abundant in natural plant protein and balanced omegas with exceptional cellular bioavailability." },
          { icon: "favorite", title: "Heart & Vitality Support", desc: "Golden 3:1 ratio of Omega-6 to Omega-3 essential fatty acids supporting daily cardiovascular vitality." },
          { icon: "bolt", title: "Sustained Natural Energy", desc: "Packed with essential minerals to replenish active bodies without crashes or fatigue." },
          { icon: "eco", title: "100% Himalayan Raw Harvest", desc: "Sustainably grown in Himalayan foothills by traditional local farmer collectives." }
        ];
      } else if (prod.category === 'personal-care') {
        benefits = [
          { icon: "spa", title: "Deep Skin Nourishment", desc: "Linoleic and oleic acids deeply replenish the epidermal moisture barrier." },
          { icon: "healing", title: "Soothes Dryness & Redness", desc: "Natural plant phytosterols calm irritation, flakiness, and environmental stress." },
          { icon: "water_drop", title: "Non-Comedogenic Hydration", desc: "Fast-absorbing plant lipids that lock in dewy moisture without clogging pores." },
          { icon: "cruelty_free", title: "Zero Harsh Additives", desc: "Free from parabens, mineral oils, synthetic perfumes, and artificial fillers." }
        ];
      } else if (prod.category === 'pet-care') {
        benefits = [
          { icon: "pets", title: "Glossy Coat & Healthy Skin", desc: "Soothes seasonal skin allergies, itching, and dry flaky skin in dogs and cats." },
          { icon: "directions_run", title: "Joint Mobility & Hip Comfort", desc: "Natural anti-inflammatory omegas help older pets move with ease and playfulness." },
          { icon: "mood", title: "Daily Calming Wellness", desc: "Assists nervous pets during loud weather, travel, vet visits, or separation." },
          { icon: "verified", title: "100% Pet Safe & Non-Toxic", desc: "Pure organic botanical formulation developed safely for companion animals." }
        ];
      } else {
        benefits = [
          { icon: "handyman", title: "Himalayan Artisan Weave", desc: "Hand-spun and tailored by skilled craftspeople across rural mountain communities." },
          { icon: "shield", title: "Incredible Fiber Strength", desc: "Natural hemp fiber is three times stronger than standard cotton for lifetime durability." },
          { icon: "compost", title: "100% Biodegradable & Eco", desc: "Grown naturally with zero synthetic pesticides, minimal water, and zero waste." },
          { icon: "water_drop", title: "Naturally Weather-Resistant", desc: "Breathable, antimicrobial fiber that repels light moisture and resists mildew." }
        ];
      }
    }

    return { benefits };
  }

  bindProductInteractions() {
    const galleryList = (this.activeProduct.gallery && this.activeProduct.gallery.length > 0) 
      ? this.activeProduct.gallery 
      : [this.activeProduct.image];

    document.querySelectorAll('.gallery-thumb-btn').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gallery-thumb-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mainImg = document.getElementById('main-product-img');
        if (mainImg && galleryList[idx]) {
          mainImg.style.opacity = '0.3';
          setTimeout(() => {
            mainImg.src = galleryList[idx];
            mainImg.style.opacity = '1';
          }, 150);
        }
      });
    });

    document.querySelectorAll('.size-select-btn').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.size-select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedSize = idx;
        this.updateProductPricingDisplay();
      });
    });


    const qtyMinus = document.getElementById('sticky-qty-minus');
    const qtyPlus = document.getElementById('sticky-qty-plus');
    if (qtyMinus && qtyPlus) {
      qtyMinus.onclick = () => this.updateProductQty(-1);
      qtyPlus.onclick = () => this.updateProductQty(1);
    }
  }

  updateProductQty(delta) {
    this.currentProductQty = Math.max(1, Math.min(10, this.currentProductQty + delta));
    const valEl = document.getElementById('sticky-qty-val');
    if (valEl) valEl.textContent = this.currentProductQty;
    this.updateProductPricingDisplay();
  }

  updateProductPricingDisplay() {
    if (!this.activeProduct) return;

    const displayPrice = document.getElementById('display-product-price');
    const displayMrp = document.getElementById('display-product-mrp');
    const displayHint = document.getElementById('display-size-hint');
    const displayDiscountTag = document.getElementById('display-discount-tag');
    const stickyPrice = document.getElementById('sticky-bar-total-price');

    let currentSizeLabel = '';
    let currentUnitPrice = Number(this.activeProduct.price) || 0;

    if (this.activeProduct.sizeVariants && this.activeProduct.sizeVariants.length > 0) {
      const size = this.activeProduct.sizeVariants[this.selectedSize] || this.activeProduct.sizeVariants[0];
      currentSizeLabel = size.volume || size.label || size.duration || '';
      currentUnitPrice = size.price;
      if (displayPrice) displayPrice.textContent = `NPR ${Number(size.price).toLocaleString('en-NP')}`;
      if (displayMrp) displayMrp.textContent = `NPR ${Number(size.mrp || size.price).toLocaleString('en-NP')}`;
      if (displayHint) displayHint.textContent = size.duration || 'Selected pack variant';
      if (displayDiscountTag) {
        if (size.mrp && size.mrp > size.price) {
          const discount = size.mrp - size.price;
          const pct = Math.round((discount / size.mrp) * 100);
          displayDiscountTag.style.display = 'inline-block';
          displayDiscountTag.textContent = `Save NPR ${discount} (${pct}%)`;
        } else {
          displayDiscountTag.style.display = 'none';
        }
      }
      const total = size.price * this.currentProductQty;
      if (stickyPrice) stickyPrice.textContent = `NPR ${total.toLocaleString('en-NP')}`;
    } else {
      if (displayPrice) displayPrice.textContent = `NPR ${Number(this.activeProduct.price).toLocaleString('en-NP')}`;
      if (displayMrp) {
        if (this.activeProduct.mrp && this.activeProduct.mrp > this.activeProduct.price) {
          displayMrp.style.display = 'inline-block';
          displayMrp.textContent = `NPR ${Number(this.activeProduct.mrp).toLocaleString('en-NP')}`;
        } else {
          displayMrp.style.display = 'none';
        }
      }
      if (displayDiscountTag) {
        if (this.activeProduct.mrp && this.activeProduct.mrp > this.activeProduct.price) {
          const discount = this.activeProduct.mrp - this.activeProduct.price;
          const pct = Math.round((discount / this.activeProduct.mrp) * 100);
          displayDiscountTag.style.display = 'inline-block';
          displayDiscountTag.textContent = `Save NPR ${discount} (${pct}%)`;
        } else {
          displayDiscountTag.style.display = 'none';
        }
      }
      if (stickyPrice) stickyPrice.textContent = `NPR ${(Number(this.activeProduct.price) * this.currentProductQty).toLocaleString('en-NP')}`;
    }

    // Dynamically update WhatsApp order buttons with selected variant & quantity
    const waUrl = this.getWhatsAppUrl(this.activeProduct, currentSizeLabel, this.currentProductQty, currentUnitPrice);
    const mainWaBtn = document.getElementById('product-whatsapp-btn');
    if (mainWaBtn) mainWaBtn.href = waUrl;
    const stickyWaBtn = document.getElementById('sticky-whatsapp-btn');
    if (stickyWaBtn) stickyWaBtn.href = waUrl;
  }

  // --- Search Modal Logic ---
  renderSearchResults(query) {
    const container = document.getElementById('search-results-list');
    if (!container) return;

    const filtered = query.trim() === '' 
      ? this.products.slice(0, 4) 
      : this.products.filter(p => 
          p.name.toLowerCase().includes(query.toLowerCase()) || 
          (p.categoryLabel && p.categoryLabel.toLowerCase().includes(query.toLowerCase())) ||
          (p.brand && p.brand.toLowerCase().includes(query.toLowerCase())) ||
          (p.description && p.description.toLowerCase().includes(query.toLowerCase()))
        );

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: var(--color-text-muted);">
          <span class="material-symbols-outlined" style="font-size: 36px; opacity: 0.5;">search_off</span>
          <p style="margin-top: 8px;">No hemp products found matching "${query}".</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(p => `
      <div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--color-surface-container);">
        <img src="${p.image}" alt="${p.name}" style="width: 50px; height: 50px; object-fit: contain; background: var(--color-surface-container-low); border-radius: var(--radius-md); padding: 2px;">
        <div style="flex: 1; min-width: 0;">
          <h4 style="font-size: 13px; font-weight: 700; color: var(--color-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${p.name}
          </h4>
          <span style="font-size: 11px; color: var(--color-text-muted);">${p.brand || 'GREENLOOM'} • NPR ${Number(p.price).toLocaleString('en-NP')}</span>
        </div>
        <a href="product.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener noreferrer"
           class="pill-badge herbal" style="text-decoration: none;">View</a>
      </div>
    `).join('');
  }

  // --- Shop Page Catalog Logic ---
  initShopPage() {
    const container = document.getElementById('shop-products-grid');
    if (!container) return;

    container.innerHTML = this.products.map(prod => `
      <div class="product-card">
        <div>
          <div class="card-img-wrap">
            ${prod.badges && prod.badges[0] ? `
              <span class="pill-badge hot-red card-tag-badge">${prod.badges[0]}</span>
            ` : ''}
            <a href="product.html?id=${encodeURIComponent(prod.id)}" target="_blank" rel="noopener noreferrer">
              <img src="${prod.image}" alt="${prod.name}" class="card-img">
            </a>
          </div>
          <span class="card-category-tag">${prod.brand || 'GREENLOOM'}</span>
          <a href="product.html?id=${encodeURIComponent(prod.id)}" target="_blank" rel="noopener noreferrer">
            <h3 class="card-product-title">${prod.name}</h3>
          </a>
          <div class="card-price-row">
            <div class="card-price-stack">
              <span class="card-price-main">NPR ${Number(prod.price).toLocaleString('en-NP')}</span>
              ${prod.mrp ? `<span class="card-mrp-strike">NPR ${Number(prod.mrp).toLocaleString('en-NP')}</span>` : ''}
            </div>
          </div>
        </div>
        <a href="${this.getWhatsAppUrl(prod)}" 
           target="_blank" rel="noopener noreferrer"
           class="btn-card-whatsapp" style="text-decoration: none;">
          <span class="material-symbols-outlined" style="font-size: 16px;">chat</span>
          <span>ORDER ON WHATSAPP</span>
        </a>
      </div>
    `).join('');
  }

  // --- Admin Auth Helpers ---
  static get AUTH_KEY() { return 'greenloom_admin_auth'; }
  static get CORRECT_ID() { return 'Greenloom'; }
  static get CORRECT_PW() { return 'Greenloom0855'; }
  static get MAX_ATTEMPTS() { return 3; }
  static get LOCKOUT_MS() { return 8 * 60 * 60 * 1000; } // 8 hours

  getAuthState() {
    try {
      const raw = localStorage.getItem(HempStoreApp.AUTH_KEY);
      return raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: 0, authenticated: false };
    } catch { return { attempts: 0, lockedUntil: 0, authenticated: false }; }
  }

  saveAuthState(state) {
    try { localStorage.setItem(HempStoreApp.AUTH_KEY, JSON.stringify(state)); } catch { }
  }

  isAuthLocked() {
    const s = this.getAuthState();
    return s.lockedUntil && Date.now() < s.lockedUntil;
  }

  isAuthenticated() {
    const s = this.getAuthState();
    // session token valid for current browser session (sessionStorage)
    return sessionStorage.getItem('greenloom_admin_session') === '1' && !this.isAuthLocked();
  }

  // --- Administrative Product Upload & Management Portal ---
  setupAdminPortal() {
    this.injectAdminModal();
    this.bindAdminPortalEvents();
  }

  injectAdminModal() {
    if (document.getElementById('admin-product-modal')) return;

    const modal = document.createElement('div');
    modal.className = 'admin-modal-overlay';
    modal.id = 'admin-product-modal';
    modal.innerHTML = `
      <div class="admin-modal-dialog">
        <!-- ====== LOGIN GATE ====== -->
        <div id="admin-login-gate" class="admin-login-gate">
          <div class="admin-login-card">
            <div class="admin-login-logo">
              <img src="images/greenloom-emblem.png" alt="GREENLOOM" class="admin-login-emblem">
              <span class="admin-login-brand-name">Greenloom</span>
              <span class="admin-login-brand-sub">Administrative Portal</span>
            </div>
            <div id="admin-login-error" class="admin-login-error" style="display:none;"></div>
            <div id="admin-login-lockout" class="admin-login-lockout" style="display:none;">
              <span class="material-symbols-outlined" style="font-size:32px;color:#e05252;">lock</span>
              <p class="admin-lockout-title">Portal Locked</p>
              <p class="admin-lockout-msg" id="admin-lockout-msg">Too many failed attempts. Please try again later.</p>
            </div>
            <form id="admin-login-form" autocomplete="off">
              <div class="admin-login-field">
                <label class="admin-login-label" for="admin-login-id">Admin ID</label>
                <input type="text" id="admin-login-id" class="admin-login-input" placeholder="Enter ID" autocomplete="off" spellcheck="false">
              </div>
              <div class="admin-login-field">
                <label class="admin-login-label" for="admin-login-pw">Password</label>
                <div class="admin-login-pw-wrap">
                  <input type="password" id="admin-login-pw" class="admin-login-input" placeholder="Enter password" autocomplete="new-password">
                  <button type="button" class="admin-pw-toggle" id="admin-pw-toggle" aria-label="Toggle password visibility" tabindex="-1">
                    <span class="material-symbols-outlined" id="admin-pw-icon">visibility</span>
                  </button>
                </div>
              </div>
              <button type="submit" class="admin-login-btn" id="admin-login-submit">Access Portal</button>
              <p class="admin-login-attempts-info" id="admin-login-attempts-info"></p>
            </form>
            <button type="button" class="admin-login-cancel-btn" id="admin-login-cancel-btn">
              <span class="material-symbols-outlined" style="font-size:15px;">close</span>
              <span>Cancel</span>
            </button>
          </div>
        </div>
        <!-- Hero Header Bar -->
        <div class="admin-modal-header">
          <div class="admin-modal-header-inner">
            <div class="admin-header-spacer"></div>
            <div class="admin-hero-brand">
              <img src="images/greenloom-emblem.png" alt="GREENLOOM" class="admin-hero-emblem">
              <span class="admin-hero-title">Admin</span>
            </div>
            <div class="admin-header-actions">
              <button class="admin-modal-close-btn" id="admin-close-modal-btn" aria-label="Exit Studio">
                <span class="material-symbols-outlined">close</span>
                <span>Exit Studio</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Body -->
        <div class="admin-modal-body">
          <div class="admin-modal-container">
            <!-- View 1: Inventory List -->
            <div id="admin-view-list">
              <div class="admin-toolbar">
                <div class="admin-search-wrap">
                  <span class="material-symbols-outlined admin-search-icon">search</span>
                  <input type="text" id="admin-search-input" class="admin-search-input" placeholder="Search catalog products...">
                </div>
                <div class="admin-toolbar-actions">
                  <button class="admin-btn-primary" id="admin-btn-add-product">
                    <span class="material-symbols-outlined">add</span>
                    <span>Add Product</span>
                  </button>
                  <button class="admin-btn-subtle" id="admin-btn-reset-defaults" title="Restore factory catalog">
                    <span class="material-symbols-outlined">restart_alt</span>
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <span id="admin-product-count" style="font-size: 12px; color: var(--color-gold-light); font-weight: 600;">Loading catalog...</span>
                <span style="font-size: 11px; color: var(--color-gold-light); display: inline-flex; align-items: center; gap: 4px;"><span class="material-symbols-outlined" style="font-size: 14px;">cloud_done</span> GitHub Repository Persistent CMS</span>
              </div>

              <div class="admin-products-grid" id="admin-inventory-list">
                <!-- Rendered dynamically -->
              </div>
            </div>

            <!-- View 2: Add / Edit Product Form -->
            <div id="admin-view-form" style="display: none;">
              <div class="admin-form-wrap">
                <div class="admin-form-head">
                  <h4 class="admin-form-title" id="admin-form-title">Add New Botanical Product</h4>
                  <button class="admin-btn-subtle" id="admin-form-back-btn" style="height: 32px; padding: 0 10px; font-size: 11px;">
                    <span class="material-symbols-outlined" style="font-size: 16px;">arrow_back</span>
                    <span>Back to List</span>
                  </button>
                </div>

                <form id="admin-product-form">
                  <div class="admin-form-grid">
                    <!-- Product Title -->
                    <div class="admin-form-group full-width">
                      <label class="admin-form-label" for="admin-field-title">PRODUCT TITLE (NAME) *</label>
                      <input type="text" id="admin-field-title" class="admin-form-input" required 
                             placeholder="e.g. GREENLOOM Artisanal Himalayan Hemp Jacket">
                    </div>

                    <!-- Short Title -->
                    <div class="admin-form-group">
                      <label class="admin-form-label" for="admin-field-short-title">SHORT TITLE (CATALOG CARD)</label>
                      <input type="text" id="admin-field-short-title" class="admin-form-input" 
                             placeholder="e.g. Hemp Jacket">
                    </div>

                    <!-- Category -->
                    <div class="admin-form-group">
                      <label class="admin-form-label" for="admin-field-category">CATEGORY</label>
                      <select id="admin-field-category" class="admin-form-select">
                        <option value="fashion">Sustainable Gear &amp; Fashion</option>
                        <option value="personal-care">Personal Care &amp; Botanicals</option>
                        <option value="nutrition">Superfood Nutrition</option>
                        <option value="pet-care">Pet Botanical Care</option>
                        <option value="edibles">Edibles &amp; Treats</option>
                      </select>
                    </div>

                    <!-- Price -->
                    <div class="admin-form-group">
                      <label class="admin-form-label" for="admin-field-price">SELLING PRICE (NPR) *</label>
                      <input type="number" id="admin-field-price" class="admin-form-input" required min="1" step="1" 
                             placeholder="e.g. 1850">
                    </div>

                    <!-- Original MRP -->
                    <div class="admin-form-group">
                      <label class="admin-form-label" for="admin-field-mrp">ORIGINAL MRP (NPR)</label>
                      <input type="number" id="admin-field-mrp" class="admin-form-input" min="1" step="1" 
                             placeholder="e.g. 2400 (for strike-through)">
                    </div>

                    <!-- Promotional Badge -->
                    <div class="admin-form-group full-width">
                      <label class="admin-form-label" for="admin-field-badge">PROMOTIONAL BADGE / TAG</label>
                      <input type="text" id="admin-field-badge" class="admin-form-input" 
                             placeholder="e.g. 100% ORGANIC • Best Seller • Handcrafted">
                    </div>

                    <!-- Image Upload & URL -->
                    <div class="admin-form-group full-width">
                      <label class="admin-form-label">PRODUCT IMAGE (URL OR DEVICE UPLOAD) *</label>
                      <div style="display: flex; gap: 8px;">
                        <input type="text" id="admin-field-image" class="admin-form-input" required 
                               placeholder="Paste image URL or choose file from device below">
                      </div>

                      <div class="admin-image-upload-row">
                        <img id="admin-image-preview" src="images/greenloom-emblem.png" alt="Preview" class="admin-image-preview">
                        <div>
                          <label class="admin-file-btn">
                            <span class="material-symbols-outlined">upload_file</span>
                            <span>Upload From Device</span>
                            <input type="file" id="admin-file-input" accept="image/*" style="display: none;">
                          </label>
                          <p style="font-size: 11px; color: rgba(250, 248, 244, 0.5); margin-top: 6px;">
                            Accepts PNG, JPG, WebP. Automatically converted to persistent data URL.
                          </p>
                        </div>
                      </div>

                      <!-- Preset sample images -->
                      <div class="admin-presets-row">
                        <span style="font-size: 11px; color: var(--color-gold-light); margin-right: 4px;">Quick Presets:</span>
                        <button type="button" class="admin-preset-btn" data-preset="mask">Hemp Mask</button>
                        <button type="button" class="admin-preset-btn" data-preset="coat">Hemp Coat</button>
                        <button type="button" class="admin-preset-btn" data-preset="cap">Hemp Cap</button>
                        <button type="button" class="admin-preset-btn" data-preset="emblem">Brand Emblem</button>
                      </div>
                    </div>

                    <!-- Description -->
                    <div class="admin-form-group full-width">
                      <label class="admin-form-label" for="admin-field-desc">DESCRIPTION *</label>
                      <textarea id="admin-field-desc" class="admin-form-textarea" required 
                                placeholder="Artisanal Himalayan organic botanical details, benefits, harvest origin, and suggested usage..."></textarea>
                    </div>

                    <!-- Homepage placement toggles -->
                    <div class="admin-form-group full-width">
                      <label class="admin-form-label">STORE PLACEMENT &amp; HOMEPAGE SECTIONS</label>
                      <div class="admin-toggles-row">
                        <label class="admin-checkbox-label">
                          <input type="checkbox" id="admin-field-bestseller">
                          <span>Feature in <strong>Best Sellers</strong> Horizontal Rail (Homepage)</span>
                        </label>
                        <label class="admin-checkbox-label">
                          <input type="checkbox" id="admin-field-hotselling">
                          <span>Feature in <strong>Hot Selling This Week</strong> Grid (Homepage)</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <!-- Form Buttons -->
                  <div class="admin-form-actions">
                    <button type="button" class="admin-btn-subtle" id="admin-form-cancel-btn">Cancel</button>
                    <button type="submit" class="admin-btn-primary" id="admin-form-save-btn">
                      <span class="material-symbols-outlined">save</span>
                      <span>Save Product</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>

        <!-- In-App Delete Confirmation Modal -->
        <div id="admin-delete-modal" class="admin-delete-modal-wrap" style="display: none;" aria-hidden="true" role="dialog" aria-modal="true">
          <div class="admin-delete-card">
            <div class="admin-delete-icon-badge">
              <span class="material-symbols-outlined">delete_forever</span>
            </div>
            <h3 class="admin-delete-title">Delete Product?</h3>
            <p class="admin-delete-desc">
              Are you sure you want to permanently delete this product from the store catalog? This action cannot be undone.
            </p>
            <div class="admin-delete-item-preview">
              <img id="admin-delete-thumb" src="images/greenloom-emblem.png" alt="Preview" class="admin-delete-preview-thumb">
              <div style="flex: 1; min-width: 0; text-align: left;">
                <div id="admin-delete-name" class="admin-delete-preview-title">Product Title</div>
                <div id="admin-delete-meta" class="admin-delete-preview-meta">NPR 0</div>
              </div>
            </div>
            <div class="admin-delete-actions">
              <button type="button" class="admin-btn-subtle" id="admin-cancel-delete-btn">Cancel</button>
              <button type="button" class="admin-btn-delete-confirm" id="admin-confirm-delete-btn">
                <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                <span>Delete Product</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  bindAdminPortalEvents() {
    const modal = document.getElementById('admin-product-modal');
    if (!modal) return;

    // Open trigger on lock button (in footer)
    document.querySelectorAll('#admin-lock-trigger, .admin-lock-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openAdminModal();
      });
    });

    // --- Login Gate Events ---
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const idVal = (document.getElementById('admin-login-id')?.value || '').trim();
        const pwVal = (document.getElementById('admin-login-pw')?.value || '').trim();
        const errEl = document.getElementById('admin-login-error');
        const attemptsInfo = document.getElementById('admin-login-attempts-info');

        if (this.isAuthLocked()) {
          this._showAdminLockoutScreen();
          return;
        }

        if (idVal === HempStoreApp.CORRECT_ID && pwVal === HempStoreApp.CORRECT_PW) {
          // Success — grant session, reset attempts
          sessionStorage.setItem('greenloom_admin_session', '1');
          this.saveAuthState({ attempts: 0, lockedUntil: 0, authenticated: true });
          if (errEl) errEl.style.display = 'none';
          // Clear inputs
          const idInput = document.getElementById('admin-login-id');
          const pwInput = document.getElementById('admin-login-pw');
          if (idInput) idInput.value = '';
          if (pwInput) pwInput.value = '';
          this._showAdminInventoryScreen();
        } else {
          // Failure
          const s = this.getAuthState();
          const newAttempts = (s.attempts || 0) + 1;
          let newState;
          if (newAttempts >= HempStoreApp.MAX_ATTEMPTS) {
            newState = { attempts: newAttempts, lockedUntil: Date.now() + HempStoreApp.LOCKOUT_MS, authenticated: false };
            this.saveAuthState(newState);
            this._showAdminLockoutScreen();
          } else {
            newState = { attempts: newAttempts, lockedUntil: 0, authenticated: false };
            this.saveAuthState(newState);
            const remaining = HempStoreApp.MAX_ATTEMPTS - newAttempts;
            if (errEl) {
              errEl.textContent = `Incorrect credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`;
              errEl.style.display = 'block';
            }
            if (attemptsInfo) attemptsInfo.textContent = `${remaining} attempt${remaining === 1 ? '' : 's'} remaining`;
            // Shake the card
            const card = document.querySelector('.admin-login-card');
            if (card) {
              card.classList.add('admin-login-shake');
              setTimeout(() => card.classList.remove('admin-login-shake'), 600);
            }
            // Clear password
            const pwInput = document.getElementById('admin-login-pw');
            if (pwInput) { pwInput.value = ''; pwInput.focus(); }
          }
        }
      });
    }

    // Password visibility toggle
    const pwToggle = document.getElementById('admin-pw-toggle');
    const pwInput = document.getElementById('admin-login-pw');
    const pwIcon = document.getElementById('admin-pw-icon');
    if (pwToggle && pwInput && pwIcon) {
      pwToggle.addEventListener('click', () => {
        const isHidden = pwInput.type === 'password';
        pwInput.type = isHidden ? 'text' : 'password';
        pwIcon.textContent = isHidden ? 'visibility_off' : 'visibility';
      });
    }

    // Cancel button on login gate (dismiss portal without logging in)
    const loginCancelBtn = document.getElementById('admin-login-cancel-btn');
    if (loginCancelBtn) {
      loginCancelBtn.addEventListener('click', () => this.closeAdminModal());
    }

    // Close button & overlay click
    const closeBtn = document.getElementById('admin-close-modal-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeAdminModal());
    }
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeAdminModal();
    });

    // Search filter in inventory
    const searchInput = document.getElementById('admin-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.renderAdminInventory(e.target.value);
      });
    }

    // Add Product button
    const addBtn = document.getElementById('admin-btn-add-product');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openProductForm(null));
    }

    // Reset Defaults button
    const resetBtn = document.getElementById('admin-btn-reset-defaults');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetCatalogDefaults());
    }

    // Form Back & Cancel buttons
    const backBtn = document.getElementById('admin-form-back-btn');
    const cancelBtn = document.getElementById('admin-form-cancel-btn');
    const returnToList = () => {
      document.getElementById('admin-view-form').style.display = 'none';
      document.getElementById('admin-view-list').style.display = 'block';
    };
    if (backBtn) backBtn.addEventListener('click', returnToList);
    if (cancelBtn) cancelBtn.addEventListener('click', returnToList);

    // Live image preview & file upload
    const imgInput = document.getElementById('admin-field-image');
    const imgPreview = document.getElementById('admin-image-preview');
    if (imgInput && imgPreview) {
      imgInput.addEventListener('input', () => {
        imgPreview.src = imgInput.value.trim() || 'images/greenloom-emblem.png';
      });
      imgPreview.addEventListener('error', () => {
        imgPreview.src = 'images/greenloom-emblem.png';
      });
    }

    const fileInput = document.getElementById('admin-file-input');
    if (fileInput && imgInput && imgPreview) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          this.showToast(`Optimizing ${file.name}...`);
          try {
            const compressed = await this.compressImageFile(file, 800, 0.75);
            imgInput.value = compressed;
            imgPreview.src = compressed;
            this.showToast(`Image loaded: ${file.name}`);
          } catch (err) {
            console.warn('Image compression fallback', err);
            const reader = new FileReader();
            reader.onload = (loadEvent) => {
              imgInput.value = loadEvent.target.result;
              imgPreview.src = loadEvent.target.result;
            };
            reader.readAsDataURL(file);
          }
        }
      });
    }

    // Preset buttons
    const presets = {
      mask: "https://images.unsplash.com/photo-1586942593568-29361efcd571",
      coat: "https://images.unsplash.com/photo-1539533018447-63fcce2678e3",
      cap: "https://images.unsplash.com/photo-1588850561407-ed78c282e89b",
      emblem: "images/greenloom-emblem.png"
    };

    document.querySelectorAll('.admin-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.preset;
        if (presets[key] && imgInput && imgPreview) {
          imgInput.value = presets[key];
          imgPreview.src = presets[key];
        }
      });
    });

    // Form Submit
    const form = document.getElementById('admin-product-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleProductFormSubmit(e));
    }

    // In-App Delete Confirmation Modal buttons
    const cancelDeleteBtn = document.getElementById('admin-cancel-delete-btn');
    if (cancelDeleteBtn) {
      cancelDeleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeDeleteConfirmModal();
      });
    }

    const confirmDeleteBtn = document.getElementById('admin-confirm-delete-btn');
    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.executeDeleteProduct();
      });
    }

    const deleteModal = document.getElementById('admin-delete-modal');
    if (deleteModal) {
      deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) {
          this.closeDeleteConfirmModal();
        }
      });
    }

    // Delegated click handler on inventory list (ensures delete & edit work reliably on mobile and desktop)
    const inventoryList = document.getElementById('admin-inventory-list');
    if (inventoryList) {
      inventoryList.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.admin-action-btn.delete');
        if (deleteBtn) {
          e.preventDefault();
          e.stopPropagation();
          const id = deleteBtn.dataset.id;
          if (id) this.openDeleteConfirmModal(id);
          return;
        }

        const editBtn = e.target.closest('.admin-action-btn.edit');
        if (editBtn) {
          e.preventDefault();
          e.stopPropagation();
          const id = editBtn.dataset.id;
          if (id) this.openProductForm(id);
          return;
        }
      });
    }

    // Escape key closes delete modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const dModal = document.getElementById('admin-delete-modal');
        if (dModal && dModal.style.display !== 'none') {
          this.closeDeleteConfirmModal();
        }
      }
    });
  }

  openAdminModal() {
    const modal = document.getElementById('admin-product-modal');
    if (!modal) return;

    modal.classList.add('open');

    // Check lockout first
    if (this.isAuthLocked()) {
      this._showAdminLockoutScreen();
      return;
    }

    // Require authentication
    if (!this.isAuthenticated()) {
      this._showAdminLoginScreen();
      return;
    }

    // Authenticated — show inventory
    this._showAdminInventoryScreen();
  }

  _showAdminLoginScreen() {
    const gate = document.getElementById('admin-login-gate');
    const body = document.querySelector('#admin-product-modal .admin-modal-body');
    if (gate) gate.style.display = 'flex';
    if (body) body.style.display = 'none';

    const lockout = document.getElementById('admin-login-lockout');
    const form = document.getElementById('admin-login-form');
    if (lockout) lockout.style.display = 'none';
    if (form) form.style.display = 'block';

    // Update attempts hint
    const s = this.getAuthState();
    const remaining = HempStoreApp.MAX_ATTEMPTS - (s.attempts || 0);
    const attemptsInfo = document.getElementById('admin-login-attempts-info');
    if (attemptsInfo) {
      attemptsInfo.textContent = remaining < HempStoreApp.MAX_ATTEMPTS
        ? `${remaining} attempt${remaining === 1 ? '' : 's'} remaining`
        : '';
    }
    const errEl = document.getElementById('admin-login-error');
    if (errEl) errEl.style.display = 'none';

    setTimeout(() => {
      const idInput = document.getElementById('admin-login-id');
      if (idInput) idInput.focus();
    }, 100);
  }

  _showAdminLockoutScreen() {
    const gate = document.getElementById('admin-login-gate');
    const body = document.querySelector('#admin-product-modal .admin-modal-body');
    if (gate) gate.style.display = 'flex';
    if (body) body.style.display = 'none';

    const lockout = document.getElementById('admin-login-lockout');
    const form = document.getElementById('admin-login-form');
    if (lockout) lockout.style.display = 'flex';
    if (form) form.style.display = 'none';

    const s = this.getAuthState();
    const msLeft = s.lockedUntil - Date.now();
    const hoursLeft = Math.ceil(msLeft / (1000 * 60 * 60));
    const minsLeft = Math.ceil(msLeft / (1000 * 60)) % 60;
    const msgEl = document.getElementById('admin-lockout-msg');
    if (msgEl) {
      msgEl.textContent = `Access denied. Try again in ${hoursLeft > 0 ? hoursLeft + 'h ' : ''}${minsLeft}m.`;
    }
  }

  _showAdminInventoryScreen() {
    const gate = document.getElementById('admin-login-gate');
    const body = document.querySelector('#admin-product-modal .admin-modal-body');
    if (gate) gate.style.display = 'none';
    if (body) body.style.display = 'block';

    document.getElementById('admin-view-form').style.display = 'none';
    document.getElementById('admin-view-list').style.display = 'block';

    const searchInput = document.getElementById('admin-search-input');
    if (searchInput) searchInput.value = '';

    this.renderAdminInventory('');
  }

  closeAdminModal() {
    const modal = document.getElementById('admin-product-modal');
    if (modal) modal.classList.remove('open');
    this.refreshCatalogViews();
  }

  renderAdminInventory(filterText = '') {
    const list = document.getElementById('admin-inventory-list');
    const countEl = document.getElementById('admin-product-count');
    if (!list) return;

    const query = filterText.trim().toLowerCase();
    const filtered = query === '' 
      ? this.products 
      : this.products.filter(p => 
          p.name.toLowerCase().includes(query) ||
          (p.categoryLabel && p.categoryLabel.toLowerCase().includes(query)) ||
          p.id.toLowerCase().includes(query) ||
          (p.badges && p.badges.some(b => b.toLowerCase().includes(query)))
        );

    if (countEl) {
      countEl.textContent = `${filtered.length} of ${this.products.length} Products Active`;
    }

    if (filtered.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 48px 16px; color: rgba(250, 248, 244, 0.5);">
          <span class="material-symbols-outlined" style="font-size: 44px; opacity: 0.5;">inventory_2</span>
          <p style="margin-top: 10px; font-size: 14px;">No products match "${filterText}".</p>
        </div>
      `;
      return;
    }

    list.innerHTML = filtered.map(prod => `
      <div class="admin-prod-card" data-id="${prod.id}">
        <img src="${prod.image}" alt="${prod.name}" class="admin-prod-thumb" onerror="this.src='images/greenloom-emblem.png'">
        <div class="admin-prod-info">
          <h4 class="admin-prod-title" title="${prod.name}">${prod.name}</h4>
          <div class="admin-prod-meta">
            <span class="admin-prod-price">NPR ${Number(prod.price).toLocaleString('en-NP')}</span>
            ${prod.mrp ? `<span class="admin-prod-mrp">NPR ${Number(prod.mrp).toLocaleString('en-NP')}</span>` : ''}
            <span class="admin-tag">${prod.categoryLabel || prod.category || 'General'}</span>
            ${prod.isBestSeller ? '<span class="admin-tag bestseller">Best Seller</span>' : ''}
            ${prod.isHotSelling ? '<span class="admin-tag hotselling">Hot Selling</span>' : ''}
            ${prod.badges && prod.badges[0] ? `<span class="admin-tag">${prod.badges[0]}</span>` : ''}
          </div>
        </div>
        <div class="admin-prod-actions">
          <button class="admin-action-btn edit" data-id="${prod.id}" title="Edit product">
            <span class="material-symbols-outlined" style="font-size: 17px;">edit</span>
          </button>
          <button class="admin-action-btn delete" data-id="${prod.id}" title="Delete product">
            <span class="material-symbols-outlined" style="font-size: 17px;">delete</span>
          </button>
        </div>
      </div>
    `).join('');

    // Bind Edit & Delete buttons directly
    list.querySelectorAll('.admin-action-btn.edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        if (id) this.openProductForm(id);
      });
    });

    list.querySelectorAll('.admin-action-btn.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        if (id) this.openDeleteConfirmModal(id);
      });
    });
  }

  openProductForm(productId = null) {
    this.editingProductId = productId;
    const formView = document.getElementById('admin-view-form');
    const listView = document.getElementById('admin-view-list');
    const formTitle = document.getElementById('admin-form-title');
    const preview = document.getElementById('admin-image-preview');

    listView.style.display = 'none';
    formView.style.display = 'block';

    if (productId) {
      const prod = this.products.find(p => p.id === productId);
      if (!prod) return;

      formTitle.textContent = `Edit Product: ${prod.shortName || prod.name}`;
      document.getElementById('admin-field-title').value = prod.name || '';
      document.getElementById('admin-field-short-title').value = prod.shortName || '';
      document.getElementById('admin-field-category').value = prod.category || 'nutrition';
      document.getElementById('admin-field-price').value = prod.price || '';
      document.getElementById('admin-field-mrp').value = prod.mrp || '';
      document.getElementById('admin-field-badge').value = (prod.badges && prod.badges.join(', ')) || '';
      document.getElementById('admin-field-image').value = prod.image || '';
      document.getElementById('admin-field-desc').value = prod.description || '';
      document.getElementById('admin-field-bestseller').checked = !!prod.isBestSeller;
      document.getElementById('admin-field-hotselling').checked = !!prod.isHotSelling;

      if (preview) preview.src = prod.image || 'images/greenloom-emblem.png';
    } else {
      formTitle.textContent = 'Add New Botanical Product';
      document.getElementById('admin-field-title').value = '';
      document.getElementById('admin-field-short-title').value = '';
      document.getElementById('admin-field-category').value = 'nutrition';
      document.getElementById('admin-field-price').value = '899';
      document.getElementById('admin-field-mrp').value = '1099';
      document.getElementById('admin-field-badge').value = '100% ORGANIC';
      document.getElementById('admin-field-image').value = 'https://lh3.googleusercontent.com/aida-public/AB6AXuC5v-SZTng-JiJAAz1MRat5-AEM9g9wxY173IsjaU091E2dbsI_5pWR3oYg-qNOk7MQlAeTgb2LtfjUyKUxABk6_L_Non32ruv2JQ-OKTs0qIsZ6a55BYoI-gU404eOXJ5_0dG3hvyzCeTXZ84MpK3RlSpJpPgDspj6wkwG-wYhvuQIkPz9cw2Bmd9lCDkZmftzUEPKSMcwqMZdhNVwI2if7bZgcXQqmWXQDPFc4loT2xB7U16Or4_3';
      document.getElementById('admin-field-desc').value = '';
      document.getElementById('admin-field-bestseller').checked = true;
      document.getElementById('admin-field-hotselling').checked = false;

      if (preview) preview.src = document.getElementById('admin-field-image').value;
    }
  }

  async handleProductFormSubmit(e) {
    e.preventDefault();

    const title = document.getElementById('admin-field-title').value.trim();
    const shortTitle = document.getElementById('admin-field-short-title').value.trim() || title;
    const category = document.getElementById('admin-field-category').value;
    const price = Number(document.getElementById('admin-field-price').value);
    const mrp = Number(document.getElementById('admin-field-mrp').value) || price;
    const badgeText = document.getElementById('admin-field-badge').value.trim();
    let image = document.getElementById('admin-field-image').value.trim() || 'images/greenloom-emblem.png';
    const description = document.getElementById('admin-field-desc').value.trim();
    const isBestSeller = document.getElementById('admin-field-bestseller').checked;
    const isHotSelling = document.getElementById('admin-field-hotselling').checked;

    if (!title || !price || !description) {
      alert('Please fill out all required product fields.');
      return;
    }

    const saveBtn = document.getElementById('admin-form-save-btn');
    const originalSaveText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span><span>Committing to GitHub...</span>`;
    }

    try {
      // If user uploaded a new local file (data:image URL), commit image to GitHub repository
      if (image.startsWith('data:image')) {
        this.showToast('Committing image to GitHub repository...');
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image,
            filename: `${slug || 'product'}.jpg`
          })
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || `Image upload failed (${uploadRes.status})`);
        }

        const uploadData = await uploadRes.json();
        if (uploadData.url) {
          image = uploadData.url;
          document.getElementById('admin-field-image').value = image;
          this.showToast('Image committed to GitHub repository!');
        }
      }

      const categoryLabels = {
        nutrition: 'Superfood Nutrition',
        'personal-care': 'Personal Care',
        fashion: 'Sustainable Gear',
        'pet-care': 'Pet Care',
        edibles: 'Edibles & Treats'
      };

      const badges = badgeText 
        ? badgeText.split(',').map(b => b.trim()).filter(Boolean) 
        : [];

      const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

      const productPayload = {
        name: title,
        shortName: shortTitle,
        category,
        categoryLabel: categoryLabels[category] || 'Hemp Botanicals',
        price,
        mrp,
        discountPercent,
        badges,
        image,
        gallery: [image],
        description,
        isBestSeller,
        isHotSelling
      };

      const isEdit = Boolean(this.editingProductId);
      const url = '/api/products';
      const method = isEdit ? 'PUT' : 'POST';
      const body = isEdit 
        ? { product: { ...productPayload, id: this.editingProductId } }
        : { product: productPayload };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned error status ${res.status}`);
      }

      const data = await res.json();
      if (Array.isArray(data.products)) {
        this.products = data.products;
      } else if (data.product) {
        if (isEdit) {
          const idx = this.products.findIndex(p => p.id === this.editingProductId);
          if (idx !== -1) this.products[idx] = data.product;
        } else {
          this.products.unshift(data.product);
        }
      }

      this.saveProducts(this.products);
      this.showToast(`Saved "${shortTitle}" & committed to GitHub!`);

      // Switch back to inventory list view
      document.getElementById('admin-view-form').style.display = 'none';
      document.getElementById('admin-view-list').style.display = 'block';
      this.renderAdminInventory();
    } catch (err) {
      console.error('[GREENLOOM CMS] Save product error:', err);
      alert(`Could not save product: ${err.message}\n\nPlease verify Vercel GITHUB_TOKEN environment variables if deployed.`);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalSaveText;
      }
    }
  }

  deleteProduct(productId) {
    this.openDeleteConfirmModal(productId);
  }

  openDeleteConfirmModal(productId) {
    const prod = this.products.find(p => p.id === productId);
    if (!prod) return;

    this.pendingDeleteProductId = productId;

    const modal = document.getElementById('admin-delete-modal');
    const nameEl = document.getElementById('admin-delete-name');
    const metaEl = document.getElementById('admin-delete-meta');
    const thumbEl = document.getElementById('admin-delete-thumb');

    if (nameEl) nameEl.textContent = prod.shortName || prod.name;
    if (metaEl) {
      metaEl.textContent = `NPR ${Number(prod.price).toLocaleString('en-NP')}${prod.mrp ? ` (MRP NPR ${Number(prod.mrp).toLocaleString('en-NP')})` : ''} • ${prod.categoryLabel || prod.category || 'Botanicals'}`;
    }
    if (thumbEl) {
      thumbEl.src = prod.image || 'images/greenloom-emblem.png';
      thumbEl.alt = prod.name;
    }

    if (modal) {
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  closeDeleteConfirmModal() {
    this.pendingDeleteProductId = null;
    const modal = document.getElementById('admin-delete-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  async executeDeleteProduct() {
    if (!this.pendingDeleteProductId) return;
    const idToDelete = this.pendingDeleteProductId;
    const prod = this.products.find(p => p.id === idToDelete);

    const confirmBtn = document.getElementById('admin-confirm-delete-btn');
    const originalText = confirmBtn ? confirmBtn.innerHTML : '';
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">sync</span><span>Deleting from GitHub...</span>`;
    }

    try {
      const res = await fetch(`/api/products?id=${encodeURIComponent(idToDelete)}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Delete failed (${res.status})`);
      }

      const data = await res.json();
      if (Array.isArray(data.products)) {
        this.products = data.products;
      } else {
        this.products = this.products.filter(p => p.id !== idToDelete);
      }

      this.saveProducts(this.products);
      this.closeDeleteConfirmModal();

      const searchInput = document.getElementById('admin-search-input');
      this.renderAdminInventory(searchInput ? searchInput.value : '');
      this.showToast(`Deleted "${prod ? (prod.shortName || prod.name) : 'Product'}" & committed to GitHub!`);
    } catch (err) {
      console.error('[GREENLOOM CMS] Delete error:', err);
      alert(`Could not delete product: ${err.message}`);
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalText;
      }
    }
  }

  async resetCatalogDefaults() {
    const confirmed = confirm('Are you sure you want to reset the entire store catalog back to original default products? All custom additions and edits will be removed.');
    if (!confirmed) return;

    this.showToast('Resetting catalog...');
    try {
      this.products = [...PRODUCTS];
      this.saveProducts(this.products);
      this.renderAdminInventory();
      this.showToast('Store catalog reset to default products.');
    } catch (err) {
      console.error(err);
    }
  }

  bindGlobalEvents() {
    const searchInput = document.getElementById('search-modal-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.renderSearchResults(e.target.value);
      });
    }
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.storeApp = new HempStoreApp();
  window.storeApp.init();
});
