const HistoryLogic = {
    currentPage: 1, itemsPerPage: 5,
    sortField: 'date', sortOrder: 'desc',
    adminSelectedUser: null, // For Admin to view specific user

    selectedVendorId: 'all', 

    toggleVendorSelect: () => { 
        document.getElementById('vendor-dropdown').classList.toggle('show'); 
        document.getElementById('ms-dropdown').classList.remove('show'); 
    },

    // Function to handle choosing one vendor
    selectVendor: (id, name) => {
        HistoryLogic.selectedVendorId = id;
        document.getElementById('vendor-filter-btn').innerText = name + " ▼";
        document.getElementById('vendor-dropdown').classList.remove('show');
        HistoryLogic.renderSummary();
    },
        
    init: async () => {
        if (!AppState.user) {
            alert("Please login.");
            window.location.href = 'index.html';
            return;
        }

        if (!AppData.orders || AppData.orders.length === 0) {
            AppData = await SupabaseService.fetchAllValues();
        }

        HistoryLogic.renderPaymentDashboard();
        const filter = document.getElementById('status-filter');
        if (filter) filter.innerHTML = `<option value="all">All Status</option><option value="Unpaid">Unpaid</option><option value="Paid">Paid (Pending)</option><option value="Completed">Completed</option>`;

        // 🔒 Daily Summary & Admin Controls
        const isSuper = AppState.user.role === 'admin' || AppState.user.role === 'collector';
        const sumSection = document.querySelector('.summary-section');
        if (sumSection) sumSection.style.display = isSuper ? 'block' : 'none';

        if (isSuper) {
            HistoryLogic.initSummaryTable();
            // Populate Admin User Selector
            const userSelector = document.getElementById('admin-user-filter');
            if (userSelector) {
                const users = [...new Set(AppData.orders.map(o => o.payer || o.user))].sort();
                userSelector.innerHTML = `<option value="">-- Check User Balance --</option>` +
                    users.map(u => `<option value="${u}">${u}</option>`).join('');
                document.getElementById('admin-dashboard').style.display = 'block'; // Ensure admin dash is visible
            }
        
        }

        HistoryLogic.renderTable();

        document.getElementById('search-input').addEventListener('keyup', HistoryLogic.renderTable);
        document.getElementById('status-filter').addEventListener('change', HistoryLogic.renderTable);
    },

    onAdminUserChange: (val) => {
        HistoryLogic.adminSelectedUser = val && val !== "" ? val : null;
        HistoryLogic.currentPage = 1;
        HistoryLogic.renderTable();
    },

    renderPaymentDashboard: () => {
        const config = AppData.config.payment || {};
        document.getElementById('pd-qr').src = config.qrUrl || 'https://via.placeholder.com/150?text=QR+Code';
        document.getElementById('pd-bank').innerText = config.bankName || '-';
        document.getElementById('pd-acc').innerText = config.accNo || '-';
        document.getElementById('pd-holder').innerText = config.holder || '-';
    },

    renderTable: () => {
        const tbody = document.getElementById('history-body');
        const filterText = document.getElementById('search-input').value.toLowerCase();
        const filterStatus = document.getElementById('status-filter').value;
        const isSuper = AppState.user.role === 'admin' || AppState.user.role === 'collector';

        // Determine which user's data to show
        // If Admin selected a user, show ONLY that user.
        // If Admin (no selection), show ALL.
        // If User, show ONLY their own.

        let targetUser = isSuper ? HistoryLogic.adminSelectedUser : AppState.user.name;

        let data = AppData.orders;

        if (targetUser) {
            // Filter for specific user (either self or admin selection)
            data = data.filter(h => h.payer === targetUser || h.user === targetUser);
        } else if (!isSuper) {
            // Fallback for safety, though handled above
            data = data.filter(h => h.payer === AppState.user.name || h.user === AppState.user.name);
        }
        // If isSuper and !targetUser (Admin viewing all), we don't filter by user yet.

        // Apply Search & Status Filters
        data = data.filter(h => {
            const matchesSearch = h.item.toLowerCase().includes(filterText) || h.user.toLowerCase().includes(filterText);
            const matchesStatus = filterStatus === 'all' || (h.status || 'Unpaid') === filterStatus;
            return matchesSearch && matchesStatus && h.status !== 'Cancelled';
        });

        // SORTING
        const field = HistoryLogic.sortField;
        const order = HistoryLogic.sortOrder === 'asc' ? 1 : -1;
        data.sort((a, b) => {
            let valA = a[field] || '';
            let valB = b[field] || '';

            if (field === 'price') {
                return (parseFloat(valA) - parseFloat(valB)) * order;
            }
            if (field === 'date') {
                return (new Date(valA) - new Date(valB)) * order;
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return -1 * order;
            if (valA > valB) return 1 * order;
            return 0;
        });

        const start = (HistoryLogic.currentPage - 1) * HistoryLogic.itemsPerPage;
        const paginatedData = data.slice(start, start + HistoryLogic.itemsPerPage);

        if (paginatedData.length === 0) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px;">No records found.</td></tr>`; }
        else {
            tbody.innerHTML = paginatedData.map(row => {
                const status = row.status || 'Unpaid';
                let checkboxDisabled = true;
                if (status === 'Unpaid') checkboxDisabled = false;
                if (status === 'Paid' && isSuper) checkboxDisabled = false;

                const isChecked = AppState.selectedHistoryIds && AppState.selectedHistoryIds.includes(row.id);
                const displayUser = row.payer !== row.user ? `${row.user} <small style='color:#aaa'>(${row.payer})</small>` : row.user;

                return `<tr class="clickable-row ${status === 'Unpaid' ? 'row-unpaid' : ''}" onclick="DetailsModal.open(${row.id})"><td onclick="event.stopPropagation()"><input type="checkbox" value="${row.id}" ${checkboxDisabled ? 'disabled' : ''} ${isChecked ? 'checked' : ''} onchange="HistoryLogic.selectRow(this)"></td><td>${row.date || '-'}</td><td class="col-user">${displayUser}</td><td class="col-ref">${row.paymentRef || '-'}</td><td><strong>${Utils.formatCurrency(row.price)}</strong></td><td><span class="status-badge ${status.toLowerCase()}">${status}</span></td></tr>`;
            }).join('');
        }
        HistoryLogic.renderPaginationControls(data.length);
        HistoryLogic.updateDashboard(data); // Pass filtered data for context if needed, but dashboard usually aggregates global or specific user
    },
    renderPaginationControls: (totalItems) => {
        const container = document.getElementById('history-pagination');
        if (!container) return;
        const totalPages = Math.ceil(totalItems / HistoryLogic.itemsPerPage);
        container.innerHTML = `<button class="btn btn-sm btn-secondary" ${HistoryLogic.currentPage === 1 ? 'disabled' : ''} onclick="HistoryLogic.changePage(-1)">Prev</button><span class="page-info">Page ${HistoryLogic.currentPage} of ${totalPages || 1}</span><button class="btn btn-sm btn-secondary" ${HistoryLogic.currentPage >= totalPages ? 'disabled' : ''} onclick="HistoryLogic.changePage(1)">Next</button>`;
    },
    changePage: (dir) => { HistoryLogic.currentPage += dir; HistoryLogic.renderTable(); },

    initSummaryTable: () => {
    // 1. Populate Users (Checkbox style - keep as is)
        const userDropdown = document.getElementById('ms-dropdown');
        const users = [...new Set(AppData.orders.map(o => o.payer || o.user))];
        userDropdown.innerHTML = users.map(u => `<label class="multi-select-option"><input type="checkbox" value="${u}"> ${u}</label>`).join('');
    
    // 2. Populate Vendors (Single-click style)
        const vendorDropdown = document.getElementById('vendor-dropdown');
        if (AppData.vendors) {
            let vendorHtml = `<div class="multi-select-option" onclick="HistoryLogic.selectVendor('all', 'All Vendors')">All Vendors</div>`;
            vendorHtml += AppData.vendors.map(v => 
               `<div class="multi-select-option" onclick="HistoryLogic.selectVendor('${v.id}', '${v.name}')">${v.name}</div>`
            ).join('');
            vendorDropdown.innerHTML = vendorHtml;
        }

    // 3. Listeners for other filters
        document.getElementById('sum-start').addEventListener('change', HistoryLogic.renderSummary);
        document.getElementById('sum-end').addEventListener('change', HistoryLogic.renderSummary);
        userDropdown.querySelectorAll('input').forEach(cb => cb.addEventListener('change', HistoryLogic.renderSummary));

        HistoryLogic.renderSummary();
    },
        toggleMultiSelect: () => { document.getElementById('ms-dropdown').classList.toggle('show'); },
        toggleVendorSelect: () => { document.getElementById('vendor-dropdown').classList.toggle('show'); document.getElementById('ms-dropdown').classList.remove('show'); // Close other if open
    },    
renderSummary: async () => {
    const start = document.getElementById('sum-start').value;
    const end = document.getElementById('sum-end').value;
    const excludedUsers = Array.from(document.querySelectorAll('#ms-dropdown input:checked')).map(cb => cb.value);
    
    const tbody = document.getElementById('summary-body');
    
    // 1. Filter Orders by Date and Excluded Users
    const filteredOrders = AppData.orders.filter(o => {
        const d = o.date;
        const matchesDate = (!start || d >= start) && (!end || d <= end);
        const matchesUser = !excludedUsers.includes(o.payer);
        return matchesDate && matchesUser && o.status !== 'Cancelled';
    });

    // 2. Group by Date
    const grouped = filteredOrders.reduce((acc, row) => {
        const date = row.date;
        if (!acc[date]) acc[date] = { count: 0, total: 0 };
        acc[date].count += 1; 
        acc[date].total += row.price; 
        return acc;
    }, {});

    // 3. Render Rows with Single Vendor Filter
    const rows = Object.keys(grouped).sort().reverse().map(date => {
        const dayConfig = AppData.dailyConfig.find(c => c.date === date);
        const dayStatus = dayConfig ? (dayConfig.status || 'Pending') : 'Pending';
        
        const vendorId = dayConfig ? dayConfig.vendorId : null;
        const vendorObj = AppData.vendors ? AppData.vendors.find(v => v.id == vendorId) : null;
        const vendorName = vendorObj ? vendorObj.name : 'Unknown';

        // --- SINGLE VENDOR FILTER CHECK ---
        if (HistoryLogic.selectedVendorId !== 'all' && vendorId != HistoryLogic.selectedVendorId) {
            return null;
        }

        const badgeClass = dayStatus === 'Completed' ? 'completed' : (dayStatus === 'Ordered' ? 'ordered' : 'pending');
        
        return `
            <tr class="clickable-row" onclick="DailyManageModal.open('${date}')">
                <td>📅 ${date}</td>
                <td>${vendorName}</td>
                <td>${grouped[date].count} Orders</td>
                <td style="text-align:right">
                    <strong>${Utils.formatCurrency(grouped[date].total)}</strong> 
                    <span class="status-badge ${badgeClass}">${dayStatus}</span>
                </td>
            </tr>`;
    }).filter(r => r !== null).join('');

    tbody.innerHTML = rows || `<tr><td colspan="4" style="text-align:center; padding:20px; color:#aaa;">No data found.</td></tr>`;
    
    // 4. Calculate Grand Total (Visible Only)
    const grandTotal = filteredOrders.reduce((acc, o) => {
        const dCfg = AppData.dailyConfig.find(c => c.date === o.date);
        const vId = dCfg ? dCfg.vendorId : null;
        if (HistoryLogic.selectedVendorId !== 'all' && vId != HistoryLogic.selectedVendorId) return acc;
        return acc + o.price;
    }, 0);

    document.getElementById('summary-grand-total').innerText = Utils.formatCurrency(grandTotal);
    },
    updateDashboard: (filteredData) => {
        // userForCalc: The user whose debt we are showing.
        // If Admin selected someone, show THEIR debt.
        // If Normal User, show THEIR debt.
        // If Admin and NO selection, show... maybe 0? Or total of all? 
        // Let's stick to: Admin sees 0 or specific user debt in the card. Global debt is in "Overview" section.

        const isSuper = AppState.user.role === 'admin' || AppState.user.role === 'collector';
        let targetUser = isSuper ? HistoryLogic.adminSelectedUser : AppState.user.name.toLowerCase();

        // Calculate "Total Due"
        let totalDue = 0;
        if (targetUser) {
            // Calculate specifically for target
            // Case insensitive match
            const tUser = targetUser.toLowerCase();
            totalDue = AppData.orders
                .filter(h => h.payer.toLowerCase() === tUser && (h.status || 'Unpaid') === 'Unpaid')
                .reduce((sum, h) => sum + parseFloat(h.price || 0), 0);
        }

        // Calculate "Total Selected"
        // Based on checkboxes.
        const selectedIds = AppState.selectedHistoryIds || [];
        const selectedTotal = AppData.orders
            .filter(h => selectedIds.includes(h.id))
            .reduce((sum, h) => sum + parseFloat(h.price || 0), 0);

        // Update UI: Total Due
        const balEl = document.getElementById('user-outstanding');
        balEl.innerText = Utils.formatCurrency(totalDue);
        balEl.style.color = totalDue > 0 ? '#ff5252' : '#4caf50';

        // Update UI: Total Selected
        const selEl = document.getElementById('user-selected-total');
        if (selEl) {
            selEl.innerText = Utils.formatCurrency(selectedTotal);
            selEl.style.color = selectedTotal > 0 ? 'var(--primary)' : '#aaa';
        }

        // Update Card Title if viewing specific user
        const cardTitle = document.querySelector('.balance-card h2');
        if (cardTitle) {
            if (isSuper && targetUser) {
                cardTitle.innerHTML = `<span class="anim-float">💰</span> Balance: ${targetUser}`;
            } else {
                cardTitle.innerHTML = `<span class="anim-float">💰</span> Outstanding Balance`;
            }
        }

        // Dynamic Card Style
        const balCard = document.querySelector('.balance-card');
        if (balCard) {
            if (totalDue > 0) {
                balCard.classList.add('has-debt');
                balCard.classList.remove('is-clear');
            } else {
                balCard.classList.add('is-clear');
                balCard.classList.remove('has-debt');
            }
        }

        // Admin Stats (Global) - Unaffected by user selection, always shows global
        if (isSuper) {
            const totalUnpaid = AppData.orders.filter(h => (h.status || 'Unpaid') === 'Unpaid').reduce((s, h) => s + h.price, 0);
            const totalPendingCount = AppData.orders.filter(h => h.status === 'Paid').length;
            document.getElementById('adm-total-unpaid').innerText = Utils.formatCurrency(totalUnpaid);
            document.getElementById('adm-total-orders').innerText = `${totalPendingCount} Items`;

            // Adjust "Pay Total Due" text for Admin?
            // If Admin selected a user, "Pay Total Due" should pay THAT user's total due.
            // Logic in PaymentModal.payAll() will handle this by checking HistoryLogic.adminSelectedUser matches.
        }
    },
    toggleAll: (source) => {
        document.querySelectorAll('#history-body input[type="checkbox"]:not(:disabled)').forEach(cb => {
            cb.checked = source.checked;
            HistoryLogic.selectRow(cb); // This updates IDs list
        });
        // Logic.selectRow calls updateDashboard internally, but toggleAll calls it many times.
        // Better to call updateDashboard once at end? 
        // selectRow updates state, so it's fine.
    },
    selectRow: (cb) => {
        const id = parseInt(cb.value);
        if (cb.checked) { if (!AppState.selectedHistoryIds) AppState.selectedHistoryIds = []; if (!AppState.selectedHistoryIds.includes(id)) AppState.selectedHistoryIds.push(id); }
        else { AppState.selectedHistoryIds = AppState.selectedHistoryIds.filter(idx => idx !== id); }

        // Recalculate Dashboard (Total Selected)
        // Pass dummy data as we don't need to filter list again for this update
        HistoryLogic.updateDashboard([]);
    },
    sortBy: (key) => {
        if (HistoryLogic.sortField === key) {
            HistoryLogic.sortOrder = HistoryLogic.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            HistoryLogic.sortField = key;
            HistoryLogic.sortOrder = 'asc';
        }
        HistoryLogic.renderTable();
    }
    
};


const DailyManageModal = {
    currentDate: null,
    open: (date) => { DailyManageModal.currentDate = date; document.getElementById('daily-manage-modal').classList.add('show'); document.getElementById('dm-title').innerText = `Manage: ${date}`; const orders = AppData.orders.filter(o => o.date === date && o.status !== 'Cancelled'); document.getElementById('dm-content').innerHTML = orders.map(o => `<div class="detail-row"><span>${o.item} (${o.user})</span><span>${o.status}</span></div>`).join(''); },
    close: () => { document.getElementById('daily-manage-modal').classList.remove('show'); },
    setStatus: async (status) => { if (!confirm(`Set orders on ${DailyManageModal.currentDate} to ${status}?`)) return; let dayConfig = AppData.dailyConfig.find(c => c.date === DailyManageModal.currentDate); if (!dayConfig) { dayConfig = { date: DailyManageModal.currentDate, vendorId: 1, cutoff: '', status: status }; AppData.dailyConfig.push(dayConfig); } else { dayConfig.status = status; } await SupabaseService.saveSchedule(dayConfig); Utils.showToast("✅ Updated"); DailyManageModal.close(); HistoryLogic.renderSummary(); },
    cancelDay: async () => { if (!confirm(`⚠ CANCEL ALL ORDERS for ${DailyManageModal.currentDate}?`)) return; const promises = []; AppData.orders.forEach(o => { if (o.date === DailyManageModal.currentDate) { o.status = 'Cancelled'; promises.push(SupabaseService.updateOrder(o)); } }); await Promise.all(promises); Utils.showToast("🗑️ Day Cancelled"); DailyManageModal.close(); HistoryLogic.renderTable(); HistoryLogic.renderSummary(); }
};
const DetailsModal = {
    open: (id) => {
        const item = AppData.orders.find(h => h.id === id); if (!item) return;
        const status = item.status || 'Unpaid';
        document.getElementById('d-title').innerText = `Order #${item.id}`;
        document.getElementById('d-status').innerText = status;
        document.getElementById('d-content').innerHTML = `
            <div class="detail-row"><span class="detail-label">Created By</span><span class="detail-val">${item.createdBy || item.payer || item.user}</span></div>
            <div class="detail-row"><span class="detail-label">Payer</span><span class="detail-val">${item.payer || item.user}</span></div>
            <div class="detail-row"><span class="detail-label">Order For</span><span class="detail-val">${item.user}</span></div>
            <div class="detail-row"><span class="detail-label">Item</span><span class="detail-val">${item.item}</span></div>
            <div class="detail-row"><span class="detail-label">Notes</span><span class="detail-val">${item.remarks || '-'}</span></div>
            <div class="detail-row"><span class="detail-label">Price</span><span class="detail-val">${Utils.formatCurrency(item.price)}</span></div>
            <div class="detail-row"><span class="detail-label">Payment Ref</span><span class="detail-val">${item.paymentRef || 'Not set'}</span></div>
            ${item.paidAt ? `<div class="detail-row"><span class="detail-label">Paid At</span><span class="detail-val">${new Date(item.paidAt).toLocaleString()}</span></div>` : (status === 'Paid' ? `<div class="detail-row"><span class="detail-label">Paid At</span><span class="detail-val" style="color:#999">Not recorded</span></div>` : '')}
            <div class="detail-row"><span class="detail-label">Date</span><span class="detail-val">${item.date}</span></div>
        `;
        const footer = document.getElementById('d-footer');
        let btnHtml = `<button class="btn btn-secondary" onclick="DetailsModal.close()">Close</button>`;
        const isSuper = AppState.user.role === 'admin' || AppState.user.role === 'collector';
        if (isSuper) { btnHtml += `<button class="btn btn-primary" style="margin-left:10px;" onclick="EditModal.open(${item.id})">Edit Status</button>`; }
        else if (status === 'Unpaid') { btnHtml += `<button class="btn btn-primary" style="margin-left:10px;" onclick="PaymentModal.openSingle(${item.id}, ${item.price})">Pay Now</button>`; }
        footer.innerHTML = btnHtml;
        document.getElementById('details-modal').classList.add('show');
    },
    close: () => { document.getElementById('details-modal').classList.remove('show'); }
};
const EditModal = {
    currentId: null,
    open: (id) => { EditModal.currentId = id; DetailsModal.close(); const item = AppData.orders.find(h => h.id === id); if (!item) return; document.getElementById('edit-status-select').value = item.status || 'Unpaid'; document.getElementById('edit-payment-ref').value = item.paymentRef || ''; document.getElementById('edit-status-modal').classList.add('show'); },
    close: () => { document.getElementById('edit-status-modal').classList.remove('show'); },
    save: async () => { const item = AppData.orders.find(h => h.id === EditModal.currentId); if (item) { item.status = document.getElementById('edit-status-select').value; item.paymentRef = document.getElementById('edit-payment-ref').value; await SupabaseService.updateOrder(item); Utils.showToast("✅ Status Updated"); HistoryLogic.renderTable(); EditModal.close(); } }
};
const PaymentModal = {
    el: document.getElementById('payment-modal'), amount: 0, targetIds: [],
    openSingle: (id, price) => { DetailsModal.close(); PaymentModal.targetIds = [id]; PaymentModal.amount = price; PaymentModal.show(); },
    openBatch: () => {
        if (!AppState.selectedHistoryIds || AppState.selectedHistoryIds.length === 0) return Utils.showToast("⚠️ Select items first.");
        PaymentModal.targetIds = [...AppState.selectedHistoryIds];
        const isSuper = AppState.user.role === 'admin' || AppState.user.role === 'collector';
        if (isSuper) { if (confirm(`Mark ${PaymentModal.targetIds.length} orders as COMPLETED?`)) PaymentModal.confirmAdmin(); }
        else { PaymentModal.amount = AppData.orders.filter(h => PaymentModal.targetIds.includes(h.id)).reduce((sum, h) => sum + h.price, 0); PaymentModal.show(); }
    },
    payAll: () => {
        // Pay ALL unpaid items for current user (or Admin selected user)
        const isSuper = AppState.user.role === 'admin' || AppState.user.role === 'collector';
        const targetUser = (isSuper && HistoryLogic.adminSelectedUser) ? HistoryLogic.adminSelectedUser : AppState.user.name;

        const unpaidOrders = AppData.orders.filter(h =>
            (h.payer === targetUser || h.user === targetUser) &&
            (h.status || 'Unpaid') === 'Unpaid' &&
            h.status !== 'Cancelled'
        );

        if (unpaidOrders.length === 0) return Utils.showToast("✅ No outstanding balance!");

        PaymentModal.targetIds = unpaidOrders.map(o => o.id);
        PaymentModal.amount = unpaidOrders.reduce((sum, o) => sum + o.price, 0);

        // Auto-select these rows effectively
        AppState.selectedHistoryIds = [...PaymentModal.targetIds];
        HistoryLogic.renderTable(); // Refresh UI checkboxes

        PaymentModal.show();
    },
    show: () => { document.getElementById('pay-amount').innerText = Utils.formatCurrency(PaymentModal.amount); document.getElementById('pay-ref').value = ""; PaymentModal.el.classList.add('show'); },
    close: () => { PaymentModal.el.classList.remove('show'); },
    confirm: async () => { const ref = document.getElementById('pay-ref').value; const promises = []; AppData.orders.forEach(h => { if (PaymentModal.targetIds.includes(h.id) && (h.status || 'Unpaid') === 'Unpaid') { h.status = 'Paid'; h.paymentRef = ref; h.paidAt = new Date().toISOString(); promises.push(SupabaseService.updateOrder(h)); } }); await Promise.all(promises); Utils.showToast("✅ Payment Submitted!"); PaymentModal.close(); AppState.selectedHistoryIds = []; HistoryLogic.renderTable(); },
    confirmAdmin: async () => { const promises = []; AppData.orders.forEach(h => { if (PaymentModal.targetIds.includes(h.id)) { h.status = 'Completed'; promises.push(SupabaseService.updateOrder(h)); } }); await Promise.all(promises); Utils.showToast("✅ Marked Completed."); AppState.selectedHistoryIds = []; HistoryLogic.renderTable(); }
};
document.addEventListener('DOMContentLoaded', HistoryLogic.init);
