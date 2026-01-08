/* script.js */

// AppData will be loaded from Supabase
let AppData = {
    vendors: [],
    menu: [],
    orders: [],
    dailyConfig: [],
    config: { payment: {} },
    users: []
};
// Keep user session in local for now, but validate against DB could be better.
const AppState = { user: JSON.parse(localStorage.getItem('lunchUser')) || null, cutoffTime: null, activeVendor: null, activeSubVendor: null, selectedDate: null, currentBannerIndex: 0, currentSelection: null, editingOrderId: null, isOrderingForSelf: true, sortOrder: 'asc', sortKey: 'subVendor', bannerInterval: null };


const Utils = {
    formatCurrency: (num) => `RM ${parseFloat(num).toFixed(2)}`,

    // Updated: GMT+8 Timezone & 1:15 PM (13:15) cutoff logic
    getTodayDate: () => {
        const now = new Date();

        // 1. Convert to GMT+8 (Malaysia Time)
        // Get UTC time in milliseconds
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        // Add 8 hours offset (8 * 60 * 60 * 1000 = 28800000)
        const myTime = new Date(utc + 28800000);

        // 2. Check if time is after 1:15 PM (13:15)
        const currentHour = myTime.getHours();
        const currentMinute = myTime.getMinutes();

        // If hour > 13 OR (hour is 13 AND minute >= 15)
        if (currentHour > 13 || (currentHour === 13 && currentMinute >= 15)) {
            myTime.setDate(myTime.getDate() + 1); // Set to Tomorrow
        }

        // 3. Return formatted string YYYY-MM-DD
        const year = myTime.getFullYear();
        const month = String(myTime.getMonth() + 1).padStart(2, '0');
        const day = String(myTime.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    saveData: () => { console.log("Legacy Save skipped - using Supabase"); }, // No-op

    handleLogin: () => { const id = document.getElementById('login-id').value.trim(); const pass = document.getElementById('login-pass').value.trim(); const userFound = AppData.users.find(u => u.name.toLowerCase() === id.toLowerCase() && u.password === pass); if (userFound) { AppState.user = userFound; localStorage.setItem('lunchUser', JSON.stringify(userFound)); window.location.reload(); } else { Utils.showToast("❌ Invalid Credentials"); } },
    logout: () => { localStorage.removeItem('lunchUser'); window.location.reload(); },
    showToast: (msg) => {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position:fixed; bottom:40px; left:50%; transform:translateX(-50%); 
            padding:16px 32px; background:rgba(45, 52, 54, 0.9); color:white; 
            border-radius:50px; z-index:3000; font-weight:700; 
            box-shadow: 0 15px 40px rgba(0,0,0,0.2); 
            font-family: 'Quicksand', sans-serif; font-size: 1rem;
            animation: fadeUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            display: flex; align-items: center; gap: 10px; border: 2px solid rgba(255,255,255,0.2);
        `;
        toast.innerHTML = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, 20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },
    copyToClipboard: (text) => { navigator.clipboard.writeText(text).then(() => Utils.showToast(`Copied: ${text}`)); },
    sortOrders: (key) => {
        if (AppState.sortKey === key) {
            AppState.sortOrder = AppState.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            AppState.sortKey = key;
            AppState.sortOrder = 'asc';
        }

        AppData.orders.sort((a, b) => {
            let valA = a[key] || '';
            let valB = b[key] || '';

            // Handle numeric sort for price
            if (key === 'price') {
                return (parseFloat(valA) - parseFloat(valB)) * (AppState.sortOrder === 'asc' ? 1 : -1);
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            if (valA < valB) return AppState.sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return AppState.sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        Render.publicOrders();
    }
};

const Render = {
    init: async () => {
        try {
            const data = await SupabaseService.fetchAllValues();
            AppData = data;
            // Ensure config has payment defaults if missing
            if (!AppData.config) AppData.config = {};
            if (!AppData.config.payment) AppData.config.payment = {};
        } catch (e) { console.error("Failed to load data", e); }

        Render.header();
        document.querySelectorAll('.login-input').forEach(input => { input.addEventListener('keypress', (e) => { if (e.key === 'Enter') Utils.handleLogin(); }); });
        const dp = document.getElementById('date-picker');
        // Use updated logic for default date
        const defaultDate = Utils.getTodayDate();
        const today = dp ? dp.value || defaultDate : defaultDate;

        if (dp) {
            dp.value = today;
            dp.addEventListener('change', () => Render.loadDate(dp.value));
        }
        Render.loadDate(today);
    },
    loadDate: (dateStr) => {
        AppState.selectedDate = dateStr;
        const config = AppData.dailyConfig.find(c => c.date === dateStr);
        if (config) { AppState.activeVendor = AppData.vendors.find(v => v.id == config.vendorId); AppState.cutoffTime = new Date(config.cutoff); }
        else { AppState.activeVendor = null; AppState.cutoffTime = null; }
        if (document.getElementById('menu-section')) { Render.banner(); Render.announcement(); Render.menu(); }
        if (document.getElementById('public-orders')) Render.publicOrders();
        Render.initTimer();
    },
    header: () => {
        const container = document.getElementById('auth-container');
        if (AppState.user) {
            container.innerHTML = `<div style="display:flex; align-items:center; gap:15px;"><div style="text-align:right;"><span style="font-weight:600; display:block;">${AppState.user.name}</span><small style="color:var(--primary); font-weight:700;">${AppState.user.role.toUpperCase()}</small></div><div class="avatar" onclick="Utils.logout()">➜</div></div>`;
            const isAdmin = AppState.user.role === 'admin';
            const isCollector = AppState.user.role === 'collector';

            // Toggle History Nav: Visible for ALL logged in users (both desktop and mobile nav)
            const navHistElements = document.querySelectorAll('.nav-history');
            navHistElements.forEach(el => el.style.display = 'block');

            // Toggle Admin Nav (both desktop and mobile nav)
            const navAdminElements = document.querySelectorAll('.nav-admin');
            navAdminElements.forEach(el => el.style.display = isAdmin ? 'block' : 'none');
        } else {
            container.innerHTML = `<div class="login-wrapper"><div class="login-group"><label class="login-label">ID</label><input id="login-id" class="login-input" placeholder="User"></div><div class="login-group"><label class="login-label">Pass</label><input type="password" id="login-pass" class="login-input" placeholder="•••"></div><button class="btn-signin" onclick="Utils.handleLogin()">Sign In</button></div>`;
            // Ensure hidden if logged out (both desktop and mobile nav)
            document.querySelectorAll('.nav-history').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.nav-admin').forEach(el => el.style.display = 'none');
        }
    },
    announcement: () => { const wrapper = document.getElementById('announcement-wrapper'); if (wrapper) wrapper.style.display = AppData.config.announcement ? 'block' : 'none'; const text = document.getElementById('announcement-text'); if (text) text.innerText = AppData.config.announcement || ''; },
    banner: () => {
        const container = document.getElementById('banner-container');
        if (!container) return;

        // Clear existing interval to prevent duplicates
        if (AppState.bannerInterval) clearInterval(AppState.bannerInterval);

        let banners = (AppState.activeVendor && AppState.activeVendor.banners.length) ? AppState.activeVendor.banners : AppData.config.noServiceBanners;
        document.querySelector('.banner-overlay h2').innerText = AppState.activeVendor ? AppState.activeVendor.name : "No Service Today";

        container.innerHTML = banners.map((url, i) => `<img src="${url}" class="menu-banner-img banner-slide ${i === 0 ? 'active' : ''}" onclick="event.stopPropagation(); ZoomModal.open('${url}')">`).join('');

        if (banners.length > 1) {
            container.innerHTML += `<div class="banner-nav"><div class="banner-btn" onclick="Render.moveBanner(-1)">❮</div><div class="banner-btn" onclick="Render.moveBanner(1)">❯</div></div>`;
            // Auto-change every 5s
            AppState.bannerInterval = setInterval(() => Render.moveBanner(1), 5000);
        }
        AppState.currentBannerIndex = 0;
    },
    moveBanner: (dir) => {
        const slides = document.querySelectorAll('.banner-slide');
        if (slides.length < 2) return;

        // Reset timer on manual interaction
        if (AppState.bannerInterval) {
            clearInterval(AppState.bannerInterval);
            AppState.bannerInterval = setInterval(() => Render.moveBanner(1), 5000);
        }

        slides[AppState.currentBannerIndex].classList.remove('active');
        AppState.currentBannerIndex = (AppState.currentBannerIndex + dir + slides.length) % slides.length;
        slides[AppState.currentBannerIndex].classList.add('active');
    },
    menu: () => {
        const container = document.getElementById('menu-section');
        if (!AppState.activeVendor) { container.innerHTML = `<div class="no-data-msg">🚫 No vendor scheduled for today.</div>`; return; }

        const items = AppData.menu.filter(m => m.vendorId == AppState.activeVendor.id);
        const subVendors = AppState.activeVendor.subVendors || [];

        // Initialize activeSubVendor if not set or invalid
        if (!AppState.activeSubVendor || (AppState.activeSubVendor !== 'All' && !subVendors.includes(AppState.activeSubVendor))) {
            AppState.activeSubVendor = (subVendors.length > 0) ? subVendors[0] : 'All';
        }

        let html = `<h3 class="section-title">Available Menu</h3>`;

        // --- SUB-VENDOR TABS ---
        if (subVendors.length > 0) {
            html += `<div class="sub-vendor-tabs glass">`;

            // Sub-vendor Buttons
            subVendors.forEach(sub => {
                const isActive = AppState.activeSubVendor === sub ? 'active' : '';
                html += `<button class="tab-btn ${isActive}" onclick="Render.switchSubVendor('${sub}')">${sub}</button>`;
            });

            html += `</div>`;
        }

        const renderCard = (item) => `<div class="menu-card glass" onclick='ItemModal.open(AppData.menu.find(i => i.id === ${item.id}))'><div><div class="menu-vendor">${item.subVendor || AppState.activeVendor.name}</div><div class="menu-title">${item.name}</div>${item.description ? `<div class="menu-description">${item.description}</div>` : ''}</div><div class="menu-footer"><span class="card-price">${Utils.formatCurrency(item.price)}</span></div></div>`;

        // --- MENU CAROUSEL ---
        let visibleItems = items;
        // Filter active items only
        visibleItems = visibleItems.filter(i => i.isActive !== false);

        if (AppState.activeSubVendor !== 'All') {
            visibleItems = visibleItems.filter(i => i.subVendor === AppState.activeSubVendor);
        }

        if (visibleItems.length > 0) {
            html += `
            <div class="menu-carousel-wrapper">
                <button class="carousel-btn prev-btn" onclick="Render.scrollMenu(-1)">❮</button>
                <div class="menu-carousel" id="menu-carousel">
                    ${visibleItems.map(renderCard).join('')}
                </div>
                <button class="carousel-btn next-btn" onclick="Render.scrollMenu(1)">❯</button>
            </div>
            `;
        } else {
            html += `<div class="no-data-msg" style="font-size:1rem; padding:20px;">No items found for ${AppState.activeSubVendor}</div>`;
        }

        container.innerHTML = html;

        // 🟢 Drag to Scroll
        const carousel = document.getElementById('menu-carousel');
        if (carousel) {
            let isDown = false;
            let startX;
            let scrollLeft;

            carousel.addEventListener('mousedown', (e) => {
                isDown = true;
                carousel.classList.add('active');
                startX = e.pageX - carousel.offsetLeft;
                scrollLeft = carousel.scrollLeft;
            });

            carousel.addEventListener('mouseleave', () => {
                isDown = false;
                carousel.classList.remove('active');
            });

            carousel.addEventListener('mouseup', () => {
                isDown = false;
                carousel.classList.remove('active');
            });

            carousel.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - carousel.offsetLeft;
                const walk = (x - startX) * 2; // Scroll-fast
                carousel.scrollLeft = scrollLeft - walk;
            });
        }
    },
    scrollMenu: (dir) => {
        const carousel = document.getElementById('menu-carousel');
        if (carousel) {
            const scrollAmount = 300;
            const maxScroll = carousel.scrollWidth - carousel.clientWidth;

            // Check boundaries for cyclic behavior (approximate)
            if (dir === 1 && carousel.scrollLeft >= maxScroll - 10) {
                // At end, loop to start
                carousel.scrollTo({ left: 0, behavior: 'smooth' });
            } else if (dir === -1 && carousel.scrollLeft <= 10) {
                // At start, loop to end
                carousel.scrollTo({ left: carousel.scrollWidth, behavior: 'smooth' });
            } else {
                carousel.scrollBy({ left: dir * scrollAmount, behavior: 'smooth' });
            }
        }
    },
    switchSubVendor: (target) => {
        const subVendors = AppState.activeVendor.subVendors || [];
        if (subVendors.length === 0) return;

        if (typeof target === 'number') {
            // Cyclic Navigation
            let currentIndex = subVendors.indexOf(AppState.activeSubVendor);
            if (currentIndex === -1) currentIndex = 0; // Default if 'All' or not found

            let newIndex = (currentIndex + target) % subVendors.length;
            if (newIndex < 0) newIndex += subVendors.length; // Handle negative modulo

            AppState.activeSubVendor = subVendors[newIndex];
        } else {
            // Direct Key Selection
            AppState.activeSubVendor = target;
        }
        Render.menu();
    },
    updateScrollButtons: () => {
        const scrollContainers = document.querySelectorAll('.category-scroll');
        scrollContainers.forEach(scrollContainer => {
            const buttons = scrollContainer.parentElement.querySelectorAll('.scroll-btn');
            // Check if scrolling is needed
            const hasScroll = scrollContainer.scrollWidth > scrollContainer.clientWidth;
            buttons.forEach(btn => {
                btn.style.display = hasScroll ? 'flex' : 'none';
            });
        });
    },
    publicOrders: () => {
        const tbody = document.querySelector('#public-orders tbody'); if (!tbody) return;
        let grandTotal = 0;
        const todaysOrders = AppData.orders.filter(o => o.date === AppState.selectedDate && o.status !== 'Cancelled');
        if (todaysOrders.length === 0) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:40px; color:#aaa;">No orders yet.</td></tr>`; document.getElementById('table-grand-total').innerText = "RM 0.00"; return; }

        // Group orders by category
        const groupedByCategory = {};
        todaysOrders.forEach(o => {
            const category = o.subVendor || o.vendor;
            if (!groupedByCategory[category]) groupedByCategory[category] = [];
            groupedByCategory[category].push(o);
        });

        let html = '';
        Object.keys(groupedByCategory).forEach(category => {
            const orders = groupedByCategory[category];
            const categoryTotal = orders.reduce((sum, o) => sum + o.price, 0);
            grandTotal += categoryTotal;

            orders.forEach((o, idx) => {
                const menuItem = AppData.menu.find(m => m.name === o.item);
                let itemDisplay = `${o.item}`;
                if (menuItem && menuItem.description) itemDisplay += ` - ${menuItem.description}`;
                let detailsHtml = `<div class="item-main">${itemDisplay}</div>`;
                if (o.addons && o.addons.length) detailsHtml += `<div class="item-addons">+ ${o.addons.join(', ')}</div>`;
                if (o.remarks) detailsHtml += `<div class="item-notes">📝 ${o.remarks}</div>`;

                const displayUser = o.user !== o.payer ? `${o.user} <small style='color:#777; font-size:0.85em'> (by ${o.payer})</small>` : o.user;
                const isFirstRow = idx === 0;
                const isLastRow = idx === orders.length - 1;

                if (isFirstRow) {
                    html += `<tr class="group-header"><td colspan="4">${category}</td></tr>`;
                }

                const firstClass = isFirstRow ? ' category-first' : '';
                const lastClass = isLastRow ? ' category-last' : '';
                html += `<tr class="clickable-row${firstClass}${lastClass}" data-category="${category}" onclick="ItemModal.openForEdit(${o.id})"><td class="col-num">${idx + 1}</td><td><strong>${displayUser}</strong></td><td>${detailsHtml}</td><td style="text-align:right"><strong>${Utils.formatCurrency(o.price)}</strong></td></tr>`;
            });
        });
        tbody.innerHTML = html;
        document.getElementById('table-grand-total').innerText = Utils.formatCurrency(grandTotal);
    },
    refreshOrders: async () => {
        const btn = document.querySelector('.refresh-btn-header i');
        if (btn) btn.classList.add('fa-spin');

        try {
            // Re-fetch all data to ensure sync (e.g. if someone else ordered)
            const data = await SupabaseService.fetchAllValues();
            AppData.orders = data.orders; // Update orders specifically
            // We might want to update other things too, but orders is the main one for this view

            Render.publicOrders();
            Utils.showToast("✅ Orders Refreshed");
        } catch (e) {
            console.error(e);
            Utils.showToast("❌ Failed to refresh");
        } finally {
            if (btn) btn.classList.remove('fa-spin');
        }
    },

    hoverCategory: (category) => {
        const rows = document.querySelectorAll(`#public-orders tbody tr[data-category="${category}"]`);
        rows.forEach(r => r.classList.add('category-hover'));
    },

    unhoverCategory: (category) => {
        const rows = document.querySelectorAll(`#public-orders tbody tr[data-category="${category}"]`);
        rows.forEach(r => r.classList.remove('category-hover'));
    },
    initTimer: () => {
        const el = document.getElementById('timer'); if (!el) return;
        if (window.timerInterval) clearInterval(window.timerInterval);
        window.timerInterval = setInterval(() => {
            if (!AppState.cutoffTime) { el.innerText = "Closed"; el.style.background = "#fab1a0"; return; }
            const diff = AppState.cutoffTime - new Date();
            if (diff <= 0) { el.innerText = "Order Closed"; el.style.background = "#fab1a0"; }
            else { const h = Math.floor(diff / (1000 * 60 * 60)); const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)); el.innerText = `Cutoff: ${h}h ${m}m`; el.style.background = "#fff0f0"; }
        }, 1000);
    }
};

const ItemModal = {
    open: (item) => {
        if (!AppState.user) return Utils.showToast("⚠️ Please login!");
        const isAdmin = AppState.user.role === 'admin';
        // 🟢 Strict Cutoff: Check if cutoff time is set and passed
        if (!isAdmin && AppState.cutoffTime && new Date() > AppState.cutoffTime) { return Utils.showToast("⛔ Closed Order."); }

        // Block ordering for past dates if no config (implicit)
        // Use Utils.getTodayDate() to compare against currently selected date
        // Note: We want to prevent ordering for dates strictly BEFORE "today" (accounting for the 1:15pm rollover)
        if (!isAdmin && AppState.selectedDate < Utils.getTodayDate()) { return Utils.showToast("⛔ Cannot order for past dates. Please select today date."); }

        AppState.editingOrderId = null; ItemModal.setupModal(item);
    },
    openForEdit: (orderId) => {
        const order = AppData.orders.find(o => o.id === orderId); if (!order) return;
        const isAdmin = AppState.user && AppState.user.role === 'admin';
        const isOwner = AppState.user && order.payer === AppState.user.name;

        // 🟢 Strict Cutoff for Edit
        const isCutoffPassed = AppState.cutoffTime && new Date() > AppState.cutoffTime;
        if (!isAdmin && isCutoffPassed) return Utils.showToast("⛔ Cutoff Passed. Unable to Edit.");

        if (!isAdmin && !isOwner) { if (!confirm(`Edit ${order.user}'s order?`)) return; }

        // 🟢 Smart Find: Handle "Item Name Variant" pattern
        const menuItem = AppData.menu.find(m => {
            if (m.name === order.item) return true; // Exact match
            if (m.variants && m.variants.length > 0) {
                // Check if order item matches "Name Variant"
                return m.variants.some(v => order.item === `${m.name} ${v.name}`);
            }
            return false;
        });

        if (!menuItem) return;
        AppState.editingOrderId = orderId; ItemModal.setupModal(menuItem, order);
    },
    setupModal: (item, existingOrder = null) => {
        AppState.currentSelection = item;
        document.getElementById('m-title').innerText = item.name;
        document.getElementById('m-vendor').innerText = item.subVendor ? `${AppState.activeVendor.name} - ${item.subVendor}` : AppState.activeVendor.name;
        document.getElementById('m-price').innerText = Utils.formatCurrency(item.price);
        const descDiv = document.getElementById('m-description');
        if (item.description) {
            descDiv.innerText = item.description;
            descDiv.style.display = 'block';
        } else {
            descDiv.style.display = 'none';
        }
        const isSelf = existingOrder ? (existingOrder.payer === AppState.user.name && existingOrder.user === AppState.user.name) : true;
        ItemModal.toggleUser(isSelf);
        if (!isSelf && existingOrder) document.getElementById('m-order-user').value = existingOrder.user;
        document.getElementById('m-notes').value = existingOrder ? existingOrder.remarks : "";

        // 🟢 Variants (Required Selection)
        const variantList = document.getElementById('m-variants-list');
        if (item.variants && item.variants.length > 0) {
            variantList.style.display = 'block';
            // Find currently selected variant from existing order (it might be part of Item Name or separate)
            // Strategy: We will append variant name to item name in DB? Or just strict check.
            // Let's handle it by checking if any 'variant' name exists in the order's addons list.

            variantList.innerHTML = `<label style="display:block; margin-bottom:10px; font-weight:600; color:var(--primary);">Select Option (Required)</label>` +
                item.variants.map((v, i) => {
                    // Check if:
                    // 1. Existing order item name strictly matches "ItemName VariantName"
                    // 2. OR fallback for legacy/safety: existing order addons includes it (though we are moving away from this)
                    const matchesName = existingOrder && existingOrder.item === `${item.name} ${v.name}`;
                    const matchesAddonLegacy = existingOrder && existingOrder.addons.includes(v.name);

                    const isChecked = (matchesName || matchesAddonLegacy) ? 'checked' : '';

                    return `
                    <label class="addon-label radio-option">
                        <span>${v.name} ${v.price > 0 ? `(+${Utils.formatCurrency(v.price)})` : ''}</span>
                        <input type="radio" name="item_variant" value="${i}" ${isChecked} onchange="ItemModal.calculateTotal()">
                    </label>`;
                }).join('');
        } else {
            variantList.style.display = 'none';
            variantList.innerHTML = '';
        }

        const list = document.getElementById('m-addons-list');
        list.innerHTML = (item.addons || []).map((a, i) => {
            const isChecked = existingOrder && existingOrder.addons.includes(a.name) ? 'checked' : '';
            return `<label class="addon-label"><span>${a.name} (+${Utils.formatCurrency(a.price)})</span><input type="checkbox" value="${i}" ${isChecked} onchange="ItemModal.calculateTotal()"></label>`;
        }).join('');

        const submitBtn = document.getElementById('btn-submit-order');
        const deleteBtn = document.getElementById('btn-delete-order');
        submitBtn.innerText = existingOrder ? "Update Order" : "Submit Order";
        deleteBtn.style.display = existingOrder ? 'flex' : 'none';

        ItemModal.calculateTotal();
        document.getElementById('order-modal').classList.add('show');
    },

    close: () => { document.getElementById('order-modal').classList.remove('show'); },


    toggleUser: (isSelf) => {
        AppState.isOrderingForSelf = isSelf;
        document.getElementById('btn-self').className = isSelf ? 'toggle-btn active' : 'toggle-btn';
        document.getElementById('btn-other').className = !isSelf ? 'toggle-btn active' : 'toggle-btn';
        const input = document.getElementById('m-order-user'); input.style.display = isSelf ? 'none' : 'block'; if (isSelf) input.value = '';
    },

    calculateTotal: () => {
        if (!AppState.currentSelection) return;
        let total = AppState.currentSelection.price;
        // Variants
        const selectedVariant = document.querySelector('input[name="item_variant"]:checked');
        if (selectedVariant) {
            const vIndex = parseInt(selectedVariant.value);
            total += AppState.currentSelection.variants[vIndex].price;
        }
        // Addons
        document.querySelectorAll('#m-addons-list input:checked').forEach(cb => { total += AppState.currentSelection.addons[cb.value].price; });
        document.getElementById('m-total-price').innerText = Utils.formatCurrency(total);
    },

    submitOrder: async () => {
        const item = AppState.currentSelection;
        let extraCost = 0;
        const selectedAddonNames = [];
        let finalItemName = item.name;

        // Validate Variant Logic
        if (item.variants && item.variants.length > 0) {
            const selectedVariant = document.querySelector('input[name="item_variant"]:checked');
            if (!selectedVariant) return Utils.showToast("⚠️ Please select a required option!");

            const vIndex = parseInt(selectedVariant.value);
            const variant = item.variants[vIndex];

            // 🟢 Append Variant to Item Name
            finalItemName = `${item.name} ${variant.name}`;
            extraCost += variant.price;
        }

        document.querySelectorAll('#m-addons-list input:checked').forEach(cb => { selectedAddonNames.push(item.addons[cb.value].name); extraCost += item.addons[cb.value].price; });

        // 🟢 Debt Logic: Self->Self, User->User, Guest->Self
        const orderFor = AppState.isOrderingForSelf ? AppState.user.name : (document.getElementById('m-order-user').value || 'Guest').trim();

        // Check if orderFor is a valid system user
        const beneficiary = AppData.users.find(u => u.name.toLowerCase() === orderFor.toLowerCase());
        const finalPayer = beneficiary ? beneficiary.name : AppState.user.name; // If valid user, they pay; else I pay
        const finalUser = beneficiary ? beneficiary.name : orderFor; // Standardize name if valid user

        const finalPrice = item.price + extraCost;
        const remarks = document.getElementById('m-notes').value;

        if (AppState.editingOrderId) {
            const order = AppData.orders.find(o => o.id === AppState.editingOrderId);
            if (order) {
                order.user = finalUser; order.payer = finalPayer; order.item = finalItemName; order.addons = selectedAddonNames; order.remarks = remarks; order.price = finalPrice;
                await SupabaseService.updateOrder(order);
                Utils.showToast("✅ Order Updated Successfully!");
            }
        } else {
            const newOrder = {
                id: Date.now(), user: finalUser, payer: finalPayer,
                vendor: AppState.activeVendor.name, subVendor: item.subVendor,
                item: finalItemName, addons: selectedAddonNames,
                remarks: remarks, price: finalPrice, status: 'Unpaid', date: AppState.selectedDate
            };
            AppData.orders.push(newOrder); // Optimistic UI
            await SupabaseService.addOrder(newOrder);
            Utils.showToast("🎉 Yum! Order Placed!");
        }
        ItemModal.close(); Render.publicOrders();
    },

    deleteOrder: async () => {
        if (!confirm("Delete this order?")) return;
        const id = AppState.editingOrderId;
        AppData.orders = AppData.orders.filter(o => o.id !== id);
        await SupabaseService.deleteOrder(id);
        Utils.showToast("🗑️ Order Deleted"); ItemModal.close(); Render.publicOrders();
    }
};
const ExportModal = {
    copyAsImage: () => {
        const captureArea = document.querySelector("#capture-area");
        const priceHeader = captureArea.querySelector('th[data-col="price"]');
        const priceCells = captureArea.querySelectorAll('td:nth-child(4)');

        // Hide price column
        if (priceHeader) priceHeader.style.display = 'none';
        priceCells.forEach(cell => cell.style.display = 'none');

        html2canvas(captureArea).then(canvas => {
            canvas.toBlob(blob => {
                const item = new ClipboardItem({ 'image/png': blob });
                navigator.clipboard.write([item]).then(() => {
                    Utils.showToast('✅ Image copied to clipboard!');
                }).catch((err) => {
                    console.error("Clipboard failed:", err);
                    // Fallback for mobile or strict browsers
                    const url = URL.createObjectURL(blob);
                    ZoomModal.open(url);
                    Utils.showToast('📲 Long press image to Copy/Save');
                });

                // Restore price column
                if (priceHeader) priceHeader.style.display = '';
                priceCells.forEach(cell => cell.style.display = '');
            });
        }).catch(err => {
            console.error("Capture failed:", err);
            Utils.showToast('❌ Failed to capture table');
            // Restore price column just in case of error
            if (priceHeader) priceHeader.style.display = '';
            priceCells.forEach(cell => cell.style.display = '');
        });
    },
    saveAsXLSX: () => {
        const todaysOrders = AppData.orders.filter(o => o.date === AppState.selectedDate && o.status !== 'Cancelled');

        // Group orders by category (same logic as table rendering)
        const groupedByCategory = {};
        todaysOrders.forEach(o => {
            const category = o.subVendor || o.vendor;
            if (!groupedByCategory[category]) groupedByCategory[category] = [];
            groupedByCategory[category].push(o);
        });

        // Prepare data with grouped categories
        const data = [];
        Object.keys(groupedByCategory).forEach(category => {
            const orders = groupedByCategory[category];
            orders.forEach((o, idx) => {
                const details = o.addons && o.addons.length ? `${o.item} + ${o.addons.join(', ')}` : o.item;
                const fullDetails = o.remarks ? `${details} (${o.remarks})` : details;
                const displayUser = o.user !== o.payer ? `${o.user} (${o.payer})` : o.user;
                data.push({
                    'Category': idx === 0 ? category : '',
                    'No': idx + 1,
                    'Name': displayUser,
                    'Order Details': fullDetails
                });
            });
        });

        // Generate Dynamic Filename
        const d = new Date(AppState.selectedDate);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = String(d.getFullYear()).slice(-2);
        const vendorName = AppState.activeVendor ? AppState.activeVendor.name : "Orders";
        const filename = `${day}${month}${year} ${vendorName}.xlsx`;

        // Create workbook and sheet
        const ws = XLSX.utils.json_to_sheet(data);

        // Apply Styling
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_ref = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cell_ref]) continue;

                // Base Style (Borders & Font)
                ws[cell_ref].s = {
                    font: { name: "Arial", sz: 10 },
                    border: {
                        top: { style: "thin", color: { rgb: "CCCCCC" } },
                        bottom: { style: "thin", color: { rgb: "CCCCCC" } },
                        left: { style: "thin", color: { rgb: "CCCCCC" } },
                        right: { style: "thin", color: { rgb: "CCCCCC" } }
                    },
                    alignment: { vertical: "center", wrapText: true }
                };

                // Header Row Style
                if (R === 0) {
                    ws[cell_ref].s.fill = { fgColor: { rgb: "9FA8DA" } }; // Theme Primary
                    ws[cell_ref].s.font = { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
                    ws[cell_ref].s.alignment = { horizontal: "center", vertical: "center" };
                }

                // "Category" Highlight (Col 0)
                if (C === 0 && R > 0 && ws[cell_ref].v) {
                    ws[cell_ref].s.font.bold = true;
                    ws[cell_ref].s.fill = { fgColor: { rgb: "F3E5F5" } }; // Theme BG
                }
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Orders");

        // Set column widths
        ws['!cols'] = [
            { wch: 15 },  // Category
            { wch: 5 },   // #
            { wch: 20 },  // Name
            { wch: 40 }   // Order Details
        ];

        // Manual Download
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: "application/octet-stream" });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => {
            document.body.removeChild(anchor);
            window.URL.revokeObjectURL(url);
        }, 100);
    }
};
const ZoomModal = {
    currentIndex: 0,
    banners: [],
    currentScale: 1,

    open: (src) => {
        const modal = document.getElementById('zoom-modal');
        const prevBtn = document.getElementById('zoom-prev');
        const nextBtn = document.getElementById('zoom-next');

        // Determine banners context
        let banners = [];
        if (AppState.activeVendor && AppState.activeVendor.banners && AppState.activeVendor.banners.length) {
            banners = AppState.activeVendor.banners;
        } else if (AppData.config && AppData.config.noServiceBanners) {
            banners = AppData.config.noServiceBanners;
        } else {
            banners = [];
        }

        // Check if the current src is in the banner list
        // Note: src passed from img.src might be absolute URL, while banners might be relative.
        // We try to match by establishing if banner URL is contained in src
        let idx = banners.findIndex(b => src.includes(b));

        if (idx !== -1) {
            ZoomModal.banners = banners;
            ZoomModal.currentIndex = idx;
        } else {
            // Fallback for single image (e.g. captured table image)
            ZoomModal.banners = [src];
            ZoomModal.currentIndex = 0;
        }

        ZoomModal.resetZoom(); // Reset zoom on open
        ZoomModal.updateImage();

        // Manage Nav Buttons Visibility
        const hasMultiple = ZoomModal.banners.length > 1;
        if (prevBtn) prevBtn.style.display = hasMultiple ? 'block' : 'none';
        if (nextBtn) nextBtn.style.display = hasMultiple ? 'block' : 'none';

        modal.classList.add('show');

        // Attach Events
        document.addEventListener('keydown', ZoomModal.handleKey);
        modal.addEventListener('wheel', ZoomModal.handleWheel, { passive: false });

        // Stop banner slideshow while zoomed? Optional, but good UX.
        if (AppState.bannerInterval) clearInterval(AppState.bannerInterval);
    },

    close: () => {
        const modal = document.getElementById('zoom-modal');
        modal.classList.remove('show');
        document.removeEventListener('keydown', ZoomModal.handleKey);
        modal.removeEventListener('wheel', ZoomModal.handleWheel);

        // Restart banner slideshow if needed
        if (document.querySelectorAll('.banner-slide').length > 1) {
            if (AppState.bannerInterval) clearInterval(AppState.bannerInterval);
            AppState.bannerInterval = setInterval(() => Render.moveBanner(1), 5000);
        }
    },

    nav: (dir) => {
        if (ZoomModal.banners.length < 2) return;
        ZoomModal.currentIndex = (ZoomModal.currentIndex + dir + ZoomModal.banners.length) % ZoomModal.banners.length;
        ZoomModal.resetZoom(); // Reset zoom on nav
        ZoomModal.updateImage();
    },

    updateImage: () => {
        const img = document.getElementById('zoom-img');
        if (img) {
            img.src = ZoomModal.banners[ZoomModal.currentIndex];
            // Apply current scale (which should be 1 after reset)
            img.style.transform = `scale(${ZoomModal.currentScale})`;
        }
    },

    resetZoom: () => {
        ZoomModal.currentScale = 1;
        const img = document.getElementById('zoom-img');
        if (img) img.style.transform = `scale(1)`;
    },

    handleKey: (e) => {
        if (e.key === 'Escape') ZoomModal.close();
        if (e.key === 'ArrowLeft') ZoomModal.nav(-1);
        if (e.key === 'ArrowRight') ZoomModal.nav(1);
    },

    handleWheel: (e) => {
        e.preventDefault();
        const delta = e.deltaY * -0.001; // Sensitivity
        const newScale = Math.min(Math.max(1, ZoomModal.currentScale + delta), 4); // Min 1x, Max 4x
        ZoomModal.currentScale = newScale;

        const img = document.getElementById('zoom-img');
        if (img) img.style.transform = `scale(${newScale})`;
    }
};

// Mobile Menu Toggle
const MobileMenu = {
    init: () => {
        const toggle = document.getElementById('mobile-menu-toggle');
        const panel = document.getElementById('mobile-nav-panel');

        if (toggle && panel) {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('active');
                panel.classList.toggle('active');
            });

            // Close menu when clicking on a link
            panel.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    toggle.classList.remove('active');
                    panel.classList.remove('active');
                });
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!toggle.contains(e.target) && !panel.contains(e.target)) {
                    toggle.classList.remove('active');
                    panel.classList.remove('active');
                }
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Render.init();
    MobileMenu.init();
});
