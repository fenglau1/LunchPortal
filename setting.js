/* setting.js */

const SettingLogic = {
    init: async () => {
        // Ensure data is loaded if accessed directly
        if (!AppData.vendors || AppData.vendors.length === 0) {
            AppData = await SupabaseService.fetchAllValues();
        }

        if (!AppState.user || AppState.user.role !== 'admin') {
            alert("⚠️ Admin Access Only");
            window.location.href = 'index.html';
            return;
        }

        // Load Initial Data
        SettingLogic.renderVendors();
        SettingLogic.renderUsers();
        SettingLogic.renderSchedule();
        SettingLogic.loadGlobalConfig();

        // Default Tab
        SettingLogic.switchTab('menu');
    },

    switchTab: (tabName) => {
        // Update Nav
        document.querySelectorAll('.settings-nav li').forEach(li => li.classList.remove('active'));
        const activeLi = Array.from(document.querySelectorAll('.settings-nav li')).find(li => li.innerText.toLowerCase().includes(tabName === 'config' ? 'general' : tabName));
        if (activeLi) activeLi.classList.add('active');

        // Update Content
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        document.getElementById(`tab-${tabName}`).classList.add('active');
    },

    // --- RENDER FUNCTIONS ---
    renderVendors: () => {
        const grid = document.getElementById('vendor-grid');
        grid.innerHTML = AppData.vendors.map(v => `
            <div class="vendor-card" onclick="VendorModal.open(${v.id})">
                <div class="vendor-title">${v.name}</div>
                <div class="vendor-sub">${v.subVendors ? v.subVendors.length + ' Categories' : 'No Categories'}</div>
                <div class="vendor-sub" style="margin-top:5px; color:var(--primary)">${AppData.menu.filter(m => m.vendorId === v.id).length} Menu Items</div>
            </div>
        `).join('');
    },

    renderUsers: () => {
        const tbody = document.querySelector('#setting-user-table tbody');
        tbody.innerHTML = AppData.users.map(u => `
            <tr class="clickable-row" onclick="UserModal.open(${u.id})">
                <td><span style="font-weight:700">${u.name}</span></td>
                <td><span class="status-badge ${u.role === 'admin' ? 'paid' : (u.role === 'collector' ? 'ordered' : 'unpaid')}">${u.role.toUpperCase()}</span></td>
                <td style="font-family:monospace; color:#aaa;">••••••</td>
            </tr>
        `).join('');
    },

    renderSchedule: () => {
        const tbody = document.querySelector('#setting-config-table tbody');
        // Sort by date desc
        const sorted = [...AppData.dailyConfig].sort((a, b) => new Date(b.date) - new Date(a.date));

        tbody.innerHTML = sorted.map((c, index) => {
            const vendor = AppData.vendors.find(v => v.id == c.vendorId);
            const vendorName = vendor ? vendor.name : 'Unknown Vendor';
            const statusClass = c.status === 'Completed' ? 'completed' : (c.status === 'Ordered' ? 'ordered' : 'pending');
            const cutoffDisplay = c.cutoff ? new Date(c.cutoff).toLocaleString() : 'Not Set';

            const statusLabel = (c.status && c.status !== 'Pending')
                ? `<span class="status-badge ${statusClass}" style="transform:scale(0.8)">${c.status}</span>`
                : '';

            return `
            <tr class="clickable-row" onclick="ConfigModal.open(${index})">
                <td><strong>${c.date}</strong> ${statusLabel}</td>
                <td>${vendorName}</td>
                <td>${cutoffDisplay}</td>
            </tr>
            `;
        }).join('');
    },

    loadGlobalConfig: () => {
        const c = AppData.config || {};
        const p = c.payment || {};

        if (document.getElementById('gs-no-service-container')) {
            // GS Banners logic is handled by new render function, but we need to load it here or just call render
            SettingLogic.renderNoServiceBanners();
        }
        if (document.getElementById('gs-announcement')) document.getElementById('gs-announcement').value = c.announcement || '';

        if (document.getElementById('pay-qr')) document.getElementById('pay-qr').value = p.qrUrl || '';
        if (document.getElementById('pay-bank')) document.getElementById('pay-bank').value = p.bankName || '';
        if (document.getElementById('pay-acc')) document.getElementById('pay-acc').value = p.accNo || '';
        if (document.getElementById('pay-holder')) document.getElementById('pay-holder').value = p.holder || '';
    },

    saveGlobal: async () => {
        // Helper to get non-empty values from container
        const getValues = (id) => Array.from(document.querySelectorAll(`#${id} input`)).map(i => i.value.trim()).filter(v => v !== "");
        AppData.config.noServiceBanners = getValues('gs-no-service-container');
        AppData.config.announcement = document.getElementById('gs-announcement').value;

        AppData.config.payment = {
            qrUrl: document.getElementById('pay-qr').value,
            bankName: document.getElementById('pay-bank').value,
            accNo: document.getElementById('pay-acc').value,
            holder: document.getElementById('pay-holder').value
        };

        // SAVE DB
        await SupabaseService.saveGlobalConfig(AppData.config);
        // Utils.saveData();
        Utils.showToast("✅ Global Settings Saved!");
    },

    renderNoServiceBanners: () => {
        const container = document.getElementById('gs-no-service-container');
        if (!AppData.config.noServiceBanners) AppData.config.noServiceBanners = [];
        const banners = AppData.config.noServiceBanners;
        if (banners.length === 0 || banners[banners.length - 1] !== "") banners.push("");

        container.innerHTML = banners.map((url, i) => `
            <div style="display:flex; gap:10px; margin-bottom:5px;">
                <input class="custom-input" placeholder="Image URL" value="${url}" oninput="SettingLogic.onGsBannerInput(${i}, this.value)">
                <button class="btn btn-delete" onclick="SettingLogic.removeGsBanner(${i})" style="visibility:${i === banners.length - 1 ? 'hidden' : 'visible'}">×</button>
            </div>
        `).join('');
    },

    onGsBannerInput: (i, val) => {
        if (!AppData.config.noServiceBanners) AppData.config.noServiceBanners = [];
        AppData.config.noServiceBanners[i] = val;
        // Check if we need to add a new row
        const banners = AppData.config.noServiceBanners;
        if (i === banners.length - 1 && val.trim() !== "") {
            banners.push("");
            // Optimised append - don't kill focus
            const container = document.getElementById('gs-no-service-container');
            const newIndex = banners.length - 1;
            const div = document.createElement('div');
            div.style.cssText = "display:flex; gap:10px; margin-bottom:5px;";
            div.innerHTML = `
                <input class="custom-input" placeholder="Image URL" value="" oninput="SettingLogic.onGsBannerInput(${newIndex}, this.value)">
                <button class="btn btn-delete" onclick="SettingLogic.removeGsBanner(${newIndex})" style="visibility:hidden">×</button>
            `;
            container.appendChild(div);
            // Show delete btn on previous
            const prevBtn = container.children[i].querySelector('.btn-delete');
            if (prevBtn) prevBtn.style.visibility = 'visible';
        }
    },
    removeGsBanner: (i) => {
        AppData.config.noServiceBanners.splice(i, 1);
        SettingLogic.renderNoServiceBanners();
    }
};

// --- MODALS ---

const VendorModal = {
    currentId: null,
    tempBanners: [],
    tempSubs: [],

    open: (id = null) => {
        VendorModal.currentId = id;
        document.getElementById('vendor-modal').classList.add('show');

        if (id) {
            const v = AppData.vendors.find(i => i.id === id);
            document.getElementById('v-name').value = v.name;
            document.getElementById('v-description').value = v.description || "";
            VendorModal.tempBanners = [...(v.banners || [])];
            VendorModal.tempSubs = [...(v.subVendors || [])];
        } else {
            document.getElementById('v-name').value = "";
            document.getElementById('v-description').value = "";
            VendorModal.tempBanners = [];
            VendorModal.tempSubs = [];
        }

        VendorModal.renderBanners();
        VendorModal.renderSubs();
        VendorModal.renderMenuTable();
    },

    close: () => { document.getElementById('vendor-modal').classList.remove('show'); },

    renderBanners: () => {
        const container = document.getElementById('v-banners-container');
        if (VendorModal.tempBanners.length === 0 || VendorModal.tempBanners[VendorModal.tempBanners.length - 1] !== "") {
            VendorModal.tempBanners.push("");
        }

        container.innerHTML = VendorModal.tempBanners.map((url, i) => `
            <div style="display:flex; gap:10px; margin-bottom:5px;">
                <input class="custom-input" placeholder="Image URL" value="${url}" oninput="VendorModal.onBannerInput(${i}, this.value)">
                <button class="btn btn-delete" onclick="VendorModal.removeBanner(${i})" style="visibility:${i === VendorModal.tempBanners.length - 1 ? 'hidden' : 'visible'}">×</button>
            </div>
        `).join('');
    },

    onBannerInput: (i, val) => {
        VendorModal.tempBanners[i] = val;
        if (i === VendorModal.tempBanners.length - 1 && val.trim() !== "") {
            VendorModal.tempBanners.push("");
            const container = document.getElementById('v-banners-container');
            const newIndex = VendorModal.tempBanners.length - 1;
            const div = document.createElement('div');
            div.style.cssText = "display:flex; gap:10px; margin-bottom:5px;";
            div.innerHTML = `
                <input class="custom-input" placeholder="Image URL" value="" oninput="VendorModal.onBannerInput(${newIndex}, this.value)">
                <button class="btn btn-delete" onclick="VendorModal.removeBanner(${newIndex})" style="visibility:hidden">×</button>
            `;
            container.appendChild(div);
            const prevBtn = container.children[i].querySelector('.btn-delete');
            if (prevBtn) prevBtn.style.visibility = 'visible';
        }
    },

    removeBanner: (i) => { VendorModal.tempBanners.splice(i, 1); VendorModal.renderBanners(); },

    renderSubs: () => {
        const container = document.getElementById('v-subs-container');
        if (VendorModal.tempSubs.length === 0 || VendorModal.tempSubs[VendorModal.tempSubs.length - 1] !== "") {
            VendorModal.tempSubs.push("");
        }

        container.innerHTML = VendorModal.tempSubs.map((sub, i) => `
            <div style="display:flex; gap:10px; margin-bottom:5px;">
                <input class="custom-input" placeholder="Category Name" value="${sub}" oninput="VendorModal.onSubInput(${i}, this.value)">
                <button class="btn btn-delete" onclick="VendorModal.removeSub(${i})" style="visibility:${i === VendorModal.tempSubs.length - 1 ? 'hidden' : 'visible'}">×</button>
            </div>
        `).join('');
    },

    onSubInput: (i, val) => {
        VendorModal.tempSubs[i] = val;
        if (i === VendorModal.tempSubs.length - 1 && val.trim() !== "") {
            VendorModal.tempSubs.push("");
            const container = document.getElementById('v-subs-container');
            const newIndex = VendorModal.tempSubs.length - 1;
            const div = document.createElement('div');
            div.style.cssText = "display:flex; gap:10px; margin-bottom:5px;";
            div.innerHTML = `
                <input class="custom-input" placeholder="Category Name" value="" oninput="VendorModal.onSubInput(${newIndex}, this.value)">
                <button class="btn btn-delete" onclick="VendorModal.removeSub(${newIndex})" style="visibility:hidden">×</button>
            `;
            container.appendChild(div);
            const prevBtn = container.children[i].querySelector('.btn-delete');
            if (prevBtn) prevBtn.style.visibility = 'visible';
        }
    },

    removeSub: (i) => { VendorModal.tempSubs.splice(i, 1); VendorModal.renderSubs(); },



    renderMenuTable: () => {
        const tbody = document.querySelector('#vendor-menu-table tbody');
        if (!VendorModal.currentId) {
            tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#aaa">Save vendor first to add menu items.</td></tr>`;
            return;
        }
        const items = AppData.menu.filter(m => m.vendorId === VendorModal.currentId);
        tbody.innerHTML = items.map(m => `
            <tr class="clickable-row" onclick="MenuItemModal.open(${m.id})">
                <td>${m.name} <small style="color:var(--text-light)">(${m.subVendor || 'General'})</small></td>
                <td>${Utils.formatCurrency(m.price)}</td>
            </tr>
        `).join('');
    },

    save: async () => {
        const name = document.getElementById('v-name').value;
        const description = document.getElementById('v-description').value;
        if (!name) return Utils.showToast("⚠️ Name required");

        let vendorObj;
        if (VendorModal.currentId) {
            vendorObj = AppData.vendors.find(i => i.id === VendorModal.currentId);
            vendorObj.name = name;
            vendorObj.description = description;
            vendorObj.banners = VendorModal.tempBanners.filter(b => b.trim() !== "");
            vendorObj.subVendors = VendorModal.tempSubs.filter(s => s.trim() !== "");
            Utils.showToast("✅ Vendor Updated");
        } else {
            const newId = Date.now();
            vendorObj = {
                id: newId,
                name: name,
                description: description,
                banners: VendorModal.tempBanners.filter(b => b.trim() !== ""),
                subVendors: VendorModal.tempSubs.filter(s => s.trim() !== "")
            };
            AppData.vendors.push(vendorObj);
            VendorModal.currentId = newId; // Set ID so menu items can be added
            Utils.showToast("✅ Vendor Created");
        }
        await SupabaseService.saveVendor(vendorObj);
        // Utils.saveData();
        VendorModal.renderMenuTable();
        SettingLogic.renderVendors();
    },

    delete: async () => {
        if (!VendorModal.currentId) return;
        if (!confirm("Delete this Vendor and ALL its menu items?")) return;

        AppData.vendors = AppData.vendors.filter(v => v.id !== VendorModal.currentId);
        AppData.menu = AppData.menu.filter(m => m.vendorId !== VendorModal.currentId);

        await SupabaseService.deleteVendor(VendorModal.currentId);
        // Utils.saveData();
        Utils.showToast("🗑️ Vendor Deleted");
        VendorModal.close();
        SettingLogic.renderVendors();
    }
};

const MenuItemModal = {
    currentId: null,
    tempAddons: [],
    tempVariants: [],

    open: (id = null) => {
        if (!VendorModal.currentId) return Utils.showToast("⚠️ Save Vendor first!");

        MenuItemModal.currentId = id;
        document.getElementById('menu-item-modal').classList.add('show');

        // Populate SubVendor Dropdown
        const subSelect = document.getElementById('mi-subvendor');
        const vendor = AppData.vendors.find(v => v.id === VendorModal.currentId);
        subSelect.innerHTML = `<option value="">-- None --</option>` + (vendor.subVendors || []).map(s => `<option value="${s}">${s}</option>`).join('');

        if (id) {
            const m = AppData.menu.find(i => i.id === id);
            document.getElementById('mi-name').value = m.name;
            document.getElementById('mi-description').value = m.description || "";
            document.getElementById('mi-price').value = m.price;
            subSelect.value = m.subVendor || "";
            MenuItemModal.tempAddons = JSON.parse(JSON.stringify(m.addons || []));
            MenuItemModal.tempVariants = JSON.parse(JSON.stringify(m.variants || []));
        } else {
            document.getElementById('mi-name').value = "";
            document.getElementById('mi-description').value = "";
            document.getElementById('mi-price').value = "";
            subSelect.value = "";
            MenuItemModal.tempAddons = [];
            MenuItemModal.tempVariants = [];
        }
        MenuItemModal.renderAddons();
        MenuItemModal.renderVariants();

        // Toggle Delete Button visibility
        document.getElementById('btn-delete-item').style.display = id ? 'flex' : 'none';
        document.getElementById('btn-save-item').innerText = id ? 'Update Item' : 'Create Item';
    },

    close: () => { document.getElementById('menu-item-modal').classList.remove('show'); },

    // --- ADDONS LOGIC ---
    renderAddons: () => {
        const container = document.getElementById('mi-addons-container');
        if (MenuItemModal.tempAddons.length === 0) MenuItemModal.tempAddons.push({ name: "", price: 0 });

        container.innerHTML = MenuItemModal.tempAddons.map((a, i) => `
            <div style="display:flex; gap:10px; margin-bottom:5px;">
                <input class="custom-input" placeholder="Name" value="${a.name}" oninput="MenuItemModal.handleInput(${i}, 'name', this.value)">
                <input class="custom-input" type="number" placeholder="RM" value="${a.price}" style="width:80px" oninput="MenuItemModal.handleInput(${i}, 'price', this.value)">
                <button class="btn btn-delete" onclick="MenuItemModal.removeAddon(${i})" style="visibility:${i === MenuItemModal.tempAddons.length - 1 ? 'hidden' : 'visible'}">×</button>
            </div>
        `).join('');
    },

    handleInput: (i, field, val) => {
        MenuItemModal.tempAddons[i][field] = field === 'price' ? parseFloat(val) : val;
        const last = MenuItemModal.tempAddons[MenuItemModal.tempAddons.length - 1];
        if (i === MenuItemModal.tempAddons.length - 1 && last.name.trim() !== "") {
            MenuItemModal.tempAddons.push({ name: "", price: 0 });
            const container = document.getElementById('mi-addons-container');
            const newIndex = MenuItemModal.tempAddons.length - 1;
            const div = document.createElement('div');
            div.style.cssText = "display:flex; gap:10px; margin-bottom:5px;";
            div.innerHTML = `
                <input class="custom-input" placeholder="Name" value="" oninput="MenuItemModal.handleInput(${newIndex}, 'name', this.value)">
                <input class="custom-input" type="number" placeholder="RM" value="0" style="width:80px" oninput="MenuItemModal.handleInput(${newIndex}, 'price', this.value)">
                <button class="btn btn-delete" onclick="MenuItemModal.removeAddon(${newIndex})" style="visibility:hidden">×</button>
            `;
            container.appendChild(div);
            const prevBtn = container.children[i].querySelector('.btn-delete');
            if (prevBtn) prevBtn.style.visibility = 'visible';
        }
    },

    removeAddon: (i) => { MenuItemModal.tempAddons.splice(i, 1); MenuItemModal.renderAddons(); },

    // --- VARIANTS LOGIC (Required Selection) ---
    renderVariants: () => {
        const container = document.getElementById('mi-variants-container');
        if (MenuItemModal.tempVariants.length === 0) MenuItemModal.tempVariants.push({ name: "", price: 0 });

        container.innerHTML = MenuItemModal.tempVariants.map((v, i) => `
            <div style="display:flex; gap:10px; margin-bottom:5px;">
                <input class="custom-input" placeholder="Option Name" value="${v.name}" oninput="MenuItemModal.handleVariantInput(${i}, 'name', this.value)">
                <input class="custom-input" type="number" placeholder="RM" value="${v.price}" style="width:80px" oninput="MenuItemModal.handleVariantInput(${i}, 'price', this.value)">
                <button class="btn btn-delete" onclick="MenuItemModal.removeVariant(${i})" style="visibility:${i === MenuItemModal.tempVariants.length - 1 ? 'hidden' : 'visible'}">×</button>
            </div>
        `).join('');
    },

    handleVariantInput: (i, field, val) => {
        MenuItemModal.tempVariants[i][field] = field === 'price' ? parseFloat(val) : val;
        const last = MenuItemModal.tempVariants[MenuItemModal.tempVariants.length - 1];
        if (i === MenuItemModal.tempVariants.length - 1 && last.name.trim() !== "") {
            MenuItemModal.tempVariants.push({ name: "", price: 0 });
            const container = document.getElementById('mi-variants-container');
            const newIndex = MenuItemModal.tempVariants.length - 1;
            const div = document.createElement('div');
            div.style.cssText = "display:flex; gap:10px; margin-bottom:5px;";
            div.innerHTML = `
                <input class="custom-input" placeholder="Option Name" value="" oninput="MenuItemModal.handleVariantInput(${newIndex}, 'name', this.value)">
                <input class="custom-input" type="number" placeholder="RM" value="0" style="width:80px" oninput="MenuItemModal.handleVariantInput(${newIndex}, 'price', this.value)">
                <button class="btn btn-delete" onclick="MenuItemModal.removeVariant(${newIndex})" style="visibility:hidden">×</button>
            `;
            container.appendChild(div);
            const prevBtn = container.children[i].querySelector('.btn-delete');
            if (prevBtn) prevBtn.style.visibility = 'visible';
        }
    },

    removeVariant: (i) => { MenuItemModal.tempVariants.splice(i, 1); MenuItemModal.renderVariants(); },


    save: async () => {
        const name = document.getElementById('mi-name').value;
        const description = document.getElementById('mi-description').value;
        const price = parseFloat(document.getElementById('mi-price').value);
        const sub = document.getElementById('mi-subvendor').value;

        if (!name || isNaN(price)) return Utils.showToast("⚠️ Invalid Input");

        let menuObj;
        const finalAddons = MenuItemModal.tempAddons.filter(a => a.name.trim() !== "");
        const finalVariants = MenuItemModal.tempVariants.filter(v => v.name.trim() !== "");

        if (MenuItemModal.currentId) {
            menuObj = AppData.menu.find(i => i.id === MenuItemModal.currentId);
            menuObj.name = name;
            menuObj.description = description;
            menuObj.price = price;
            menuObj.subVendor = sub;
            menuObj.addons = finalAddons;
            menuObj.variants = finalVariants;
            Utils.showToast("✅ Item Updated");
        } else {
            menuObj = {
                id: Date.now(),
                vendorId: VendorModal.currentId,
                name: name,
                description: description,
                price: price,
                subVendor: sub,
                addons: finalAddons,
                variants: finalVariants
            };
            AppData.menu.push(menuObj);
            Utils.showToast("✅ Item Created");
        }
        await SupabaseService.saveMenuItem(menuObj);
        MenuItemModal.close();
        VendorModal.renderMenuTable();
    },

    delete: async (id) => {
        if (!confirm("Delete this menu item?")) return;
        AppData.menu = AppData.menu.filter(m => m.id !== id);
        await SupabaseService.deleteMenuItem(id);
        Utils.showToast("🗑️ Item Deleted");
        MenuItemModal.close();
        VendorModal.renderMenuTable();
    }
};

const UserModal = {
    currentId: null,
    open: (id = null) => {
        UserModal.currentId = id;
        document.getElementById('user-modal').classList.add('show');
        if (id) {
            const u = AppData.users.find(i => i.id === id);
            document.getElementById('u-name').value = u.name;
            document.getElementById('u-pass').value = u.password;
            document.getElementById('u-role').value = u.role;
        } else {
            document.getElementById('u-name').value = "";
            document.getElementById('u-pass').value = "";
            document.getElementById('u-role').value = "user";
        }
    },
    close: () => { document.getElementById('user-modal').classList.remove('show'); },

    save: async () => {
        const name = document.getElementById('u-name').value;
        const pass = document.getElementById('u-pass').value;
        const role = document.getElementById('u-role').value;

        if (!name || !pass) return Utils.showToast("⚠️ Fields required");

        let userObj;
        if (UserModal.currentId) {
            userObj = AppData.users.find(i => i.id === UserModal.currentId);
            userObj.name = name; userObj.password = pass; userObj.role = role;
            Utils.showToast("✅ User Updated");
        } else {
            userObj = { id: Date.now(), name: name, password: pass, role: role };
            AppData.users.push(userObj);
            Utils.showToast("✅ User Created");
        }
        await SupabaseService.saveUser(userObj);
        // Utils.saveData();
        UserModal.close();
        SettingLogic.renderUsers();
    },

    delete: async (id) => {
        if (!id) return;
        if (AppData.users.find(u => u.id === id).name === 'Admin') return Utils.showToast("⛔ Cannot delete main Admin");
        if (!confirm("Delete user?")) return;
        AppData.users = AppData.users.filter(u => u.id !== id);
        await SupabaseService.deleteUser(id);
        // Utils.saveData();
        Utils.showToast("🗑️ User Deleted");
        UserModal.close();
        SettingLogic.renderUsers();
    }
};

const ConfigModal = {
    currentIndex: null, // Index in array, not ID, as configs might not have unique IDs

    open: (idx = null) => {
        ConfigModal.currentIndex = idx;
        document.getElementById('config-modal').classList.add('show');

        // Populate Vendor Select
        const vSelect = document.getElementById('c-vendor');
        vSelect.innerHTML = AppData.vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');

        if (idx !== null) {
            // Sort logic to find the correct item based on UI index (assuming table matches sorted order)
            // But since we pass index from sorted array render, we need to map back to original?
            // Easier: just find the specific config object. 
            // In renderSchedule, I passed the loop index of the *sorted* array.
            // Let's refactor renderSchedule to pass unique identifier like date, or handle index carefully
            // Actually, let's look at `AppData.dailyConfig`. It has `date` which should be unique.
            // Let's change the render function to pass the DATE string.
            // Wait, I already wrote renderSchedule passing `index`. I should fix that first.
            // Actually, let's treat `idx` as the index in the SORTED array for now, then find it in real array.

            const sorted = [...AppData.dailyConfig].sort((a, b) => new Date(b.date) - new Date(a.date));
            const c = sorted[idx];

            if (c) {
                document.getElementById('c-date').value = c.date;
                document.getElementById('c-date').disabled = true; // Key shouldn't change
                document.getElementById('c-vendor').value = c.vendorId;
                // Format datetime for input
                const dt = new Date(c.cutoff);
                dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
                document.getElementById('c-cutoff').value = dt.toISOString().slice(0, 16);
            }
        } else {
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            // Format for datetime-local: YYYY-MM-DDTHH:mm
            const currentBiosTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);

            document.getElementById('c-date').value = today;
            document.getElementById('c-date').disabled = false;
            document.getElementById('c-cutoff').value = currentBiosTime;
        }
    },

    close: () => { document.getElementById('config-modal').classList.remove('show'); },

    save: async () => {
        const date = document.getElementById('c-date').value;
        const vendorId = parseInt(document.getElementById('c-vendor').value);
        const cutoff = new Date(document.getElementById('c-cutoff').value).toISOString();

        if (!date || !cutoff) return Utils.showToast("⚠️ Fields required");

        const existing = AppData.dailyConfig.find(c => c.date === date);

        let schedObj;
        if (existing) {
            existing.vendorId = vendorId;
            existing.cutoff = cutoff;
            schedObj = existing;
            Utils.showToast("✅ Schedule Updated");
        } else {
            schedObj = { date: date, vendorId: vendorId, cutoff: cutoff, status: 'Pending' };
            AppData.dailyConfig.push(schedObj);
            Utils.showToast("✅ Scheduled Created");
        }
        await SupabaseService.saveSchedule(schedObj);
        // Utils.saveData();
        ConfigModal.close();
        SettingLogic.renderSchedule();
    },

    delete: async (idx) => {
        // This is tricky with index. Let's rely on the date input value since it's populated.
        const date = document.getElementById('c-date').value;
        if (!date) return;

        if (!confirm("Delete schedule for " + date + "?")) return;

        AppData.dailyConfig = AppData.dailyConfig.filter(c => c.date !== date);
        await SupabaseService.deleteSchedule(date);
        // Utils.saveData();
        Utils.showToast("🗑️ Schedule Deleted");
        ConfigModal.close();
        SettingLogic.renderSchedule();
    }
};

document.addEventListener('DOMContentLoaded', SettingLogic.init);