const sessionStr = localStorage.getItem('target_session');
if (!sessionStr) window.location.href = 'index.html';
const session = JSON.parse(sessionStr);
if (new Date().getTime() > session.expires || session.role !== 'admin') {
    localStorage.removeItem('target_session');
    window.location.href = 'index.html';
}

const SUPABASE_URL = 'https://dbdbmbtveftcxcnmqobs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiZGJtYnR2ZWZ0Y3hjbm1xb2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3OTg0OTUsImV4cCI6MjA5NTM3NDQ5NX0.k9EugAVx97AlWFpPdy5xNqsqA7WrhamHZVIs-Rqt3J0';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let masterData = [];
let sortCol = 'status'; 
let sortAsc = true;
let searchTerm = '';
let statusFilter = 'ALL';
let columnFilters = {};
let filterDebounceTimer = null;

// Base layoutfor standard tables
const baseColumns = [
    { key: 'derived_entity', label: 'KPI / Title' },
    { key: 'derived_rep', label: 'Rep Name' },
    { key: 'derived_city', label: 'City' },
    { key: 'derived_team', label: 'Team / Line' },
    { key: 'derived_date', label: 'Quarter' },
    { key: 'target_per_month', label: 'target_per_month' },
    { key: 'status', label: 'Status' }
];

// Custom layout specifically for Liquidation (Product)
const liquidationProductColumns = [
    { key: 'derived_product', label: 'Product Name' },
    { key: 'derived_measure', label: 'Measure Unit' },
    { key: 'derived_rep', label: 'Rep Name' },
    { key: 'derived_city', label: 'City' },
    { key: 'derived_team', label: 'Team / Line' },
    { key: 'derived_date', label: 'Quarter' },
    { key: 'target_per_month', label: 'target_per_month' },
    { key: 'status', label: 'Status' }
];

const tableColumns = {
    doctor: baseColumns,
    coaching: baseColumns,
    pharmacy: baseColumns,
    rtd: baseColumns,
    rx: baseColumns,
    tl_calls: baseColumns,
    liquidation_per_product: liquidationProductColumns,
    liquidation_per_employee: baseColumns
};

// Non-blocking Toast Notification Helper
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const colors = {
        success: 'bg-emerald-600 text-white border-emerald-700',
        error: 'bg-rose-600 text-white border-rose-700',
        info: 'bg-slate-900 text-white border-slate-800'
    };

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto px-4 py-3 rounded-lg shadow-lg border text-xs sm:text-sm font-bold flex items-center justify-between transition-all duration-300 transform translate-y-2 opacity-0 ${colors[type] || colors.info}`;
    toast.innerHTML = `
        <span class="pr-3">${message}</span>
        <button onclick="this.parentElement.remove()" class="text-white/70 hover:text-white font-bold text-base leading-none">&times;</button>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('userNameDisplay').textContent = session.username;
    
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('target_session');
        window.location.href = 'index.html';
    });

    document.getElementById('tableSelector').addEventListener('change', (e) => {
        window.fetchAdminQueue(e.target.value, false);
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            window.updateFilterResetButton();
            clearTimeout(filterDebounceTimer);
            filterDebounceTimer = setTimeout(() => {
                renderBody();
            }, 150);
        });
    }

    window.fetchAdminQueue('doctor', false);
});

function renderSkeleton(tableName) {
    const baseCols = tableColumns[tableName] || tableColumns['doctor'];
    const cols = [{ key: 'company_line', label: 'Line' }, ...baseCols];
    const tableBody = document.getElementById('tableBody');
    let html = '';
    for (let i = 0; i < 6; i++) {
        html += `<tr class="animate-pulse"><td class="px-5 py-4"><div class="h-4 w-4 bg-slate-200 rounded"></div></td>`;
        cols.forEach(() => {
            html += `<td class="px-5 py-4"><div class="h-4 bg-slate-200 rounded w-24"></div></td>`;
        });
        html += `<td class="px-5 py-4 text-right"><div class="h-4 bg-slate-200 rounded w-16 ml-auto"></div></td></tr>`;
    }
    tableBody.innerHTML = html;
}

window.fetchAdminQueue = async function(tableName, preserveFilters = false) {
    const emptyState = document.getElementById('emptyState');
    const tableBody = document.getElementById('tableBody');
    
    if (!preserveFilters) {
        searchTerm = '';
        statusFilter = 'ALL';
        columnFilters = {};
        document.getElementById('searchInput').value = '';
        window.updateStatusPillStyles();
        window.updateFilterResetButton();
        renderHeader(tableName);
        renderSkeleton(tableName);
    }

    emptyState.classList.add('hidden');
    window.updateBulkUI();

    try {
        const { data, error } = await supabaseClient.rpc('get_admin_data', {
            p_user_id: session.user_id,
            p_table_name: tableName
        });

        if (error) throw error;

        if (!data || data.length === 0) {
            masterData = [];
            tableBody.innerHTML = '';
            window.updateStatusCounts([]);
            emptyState.innerHTML = `<p class="text-sm text-slate-500 font-medium">No data found in this module.</p>`;
            emptyState.classList.remove('hidden');
            return;
        }

        masterData = data.map(row => {
            return {
                ...row,
                derived_entity: row.title || row.kpi || row.kpi_code || 'N/A',
                derived_product: row.product_name || 'N/A',
                derived_measure: row['Measure Unit'] || row.measure_unit || 'N/A',
                derived_rep: row.rep_name || 'N/A',
                derived_date: row.date || 'N/A',
                derived_city: row.city || row.region || 'N/A',
                derived_team: row.team || row.company_line || 'N/A',
                selected: false 
            };
        });

        if (!preserveFilters) {
            sortCol = 'status';
            sortAsc = true;
            updateSortIcons();
        }
        renderBody();

    } catch (err) {
        console.error("Fetch Error:", err);
        tableBody.innerHTML = '';
        emptyState.innerHTML = `<p class="text-sm text-rose-500 font-bold">Failed to load queue data.</p>`;
        emptyState.classList.remove('hidden');
        window.showToast("Failed to load queue data.", "error");
    }
};

function getFilteredData() {
    return masterData.filter(row => {
        const rowStatus = row.status || 'EMPTY';
        if (statusFilter !== 'ALL' && rowStatus !== statusFilter) {
            return false;
        }

        if (searchTerm) {
            const matchesGlobal = Object.values(row).some(val => 
                val !== null && val !== undefined && String(val).toLowerCase().includes(searchTerm)
            );
            if (!matchesGlobal) return false;
        }
        
        for (const key in columnFilters) {
            const filterText = columnFilters[key];
            if (filterText) {
                let cellValue = row[key];
                if (cellValue === null || cellValue === undefined || !String(cellValue).toLowerCase().includes(filterText)) {
                    return false;
                }
            }
        }
        return true;
    });
}

window.filterByStatus = function(status) {
    statusFilter = (statusFilter === status && status !== 'ALL') ? 'ALL' : status;
    window.updateStatusPillStyles();
    window.updateFilterResetButton();
    renderBody();
};

window.updateStatusPillStyles = function() {
    const statuses = ['ALL', 'EMPTY', 'PENDING', 'APPROVED', 'REJECTED'];
    statuses.forEach(s => {
        const pill = document.getElementById(`pill-${s}`);
        if (!pill) return;
        if (s === statusFilter) {
            pill.classList.add('ring-2', 'ring-offset-1', 'ring-rose-500');
        } else {
            pill.classList.remove('ring-2', 'ring-offset-1', 'ring-rose-500');
        }
    });
};

window.clearAllFilters = function() {
    searchTerm = '';
    statusFilter = 'ALL';
    columnFilters = {};
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('[id^="filter-"]').forEach(inp => { inp.value = ''; });
    window.updateStatusPillStyles();
    window.updateFilterResetButton();
    renderBody();
};

window.updateFilterResetButton = function() {
    const btn = document.getElementById('clearFiltersBtn');
    if (!btn) return;
    const hasColFilter = Object.values(columnFilters).some(v => v && v.length > 0);
    if (searchTerm || statusFilter !== 'ALL' || hasColFilter) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
};

window.updateColumnFilter = function(colKey, val) {
    columnFilters[colKey] = val.toLowerCase();
    window.updateFilterResetButton();
    clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(() => {
        renderBody();
    }, 150);
};

window.sortData = function(column) {
    if (sortCol === column) {
        sortAsc = !sortAsc;
    } else {
        sortCol = column;
        sortAsc = true;
    }
    updateSortIcons();
    renderBody();
};

function updateSortIcons() {
    document.querySelectorAll('[id^="sort-icon-"]').forEach(el => {
        const key = el.id.replace('sort-icon-', '');
        if (key === sortCol) {
            el.textContent = sortAsc ? ' ↑' : ' ↓';
            el.className = 'text-rose-600 font-extrabold';
        } else {
            el.textContent = ' ↕';
            el.className = 'text-slate-400';
        }
    });
}

window.updateStatusCounts = function(data) {
    const counts = { EMPTY: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 };
    data.forEach(row => {
        const s = row.status || 'EMPTY';
        if (counts[s] !== undefined) {
            counts[s]++;
        } else {
            counts.EMPTY++;
        }
    });

    const total = data.length;
    const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val.toLocaleString('en-US');
    };

    setEl('countTotal', total);
    setEl('countEmpty', counts.EMPTY);
    setEl('countPending', counts.PENDING);
    setEl('countApproved', counts.APPROVED);
    setEl('countRejected', counts.REJECTED);

    // Update Segmented Progress Bar
    const pct = (val) => total > 0 ? ((val / total) * 100).toFixed(1) : 0;
    const barApproved = document.getElementById('barApproved');
    const barPending = document.getElementById('barPending');
    const barRejected = document.getElementById('barRejected');
    const barEmpty = document.getElementById('barEmpty');
    const completionPct = document.getElementById('completionPct');

    if (barApproved) barApproved.style.width = `${pct(counts.APPROVED)}%`;
    if (barPending) barPending.style.width = `${pct(counts.PENDING)}%`;
    if (barRejected) barRejected.style.width = `${pct(counts.REJECTED)}%`;
    if (barEmpty) barEmpty.style.width = `${total > 0 ? pct(counts.EMPTY) : 100}%`;
    if (completionPct) {
        const approvedPct = total > 0 ? Math.round((counts.APPROVED / total) * 100) : 0;
        completionPct.textContent = `${approvedPct}%`;
    }
};

// Build <thead> once per module switch so column filter inputs never lose focus
function renderHeader(tableName) {
    const currentTable = tableName || document.getElementById('tableSelector').value;
    const theadRow = document.getElementById('theadRow') || document.querySelector('thead tr');
    const baseCols = tableColumns[currentTable] || tableColumns['doctor'];
    const cols = [{ key: 'company_line', label: 'Line' }, ...baseCols];

    let thHtml = `<th class="px-5 py-3.5 text-left w-12 align-top bg-slate-100/95">
        <input type="checkbox" id="masterCheckbox" class="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer mt-7" onchange="window.toggleAllAdmin(this.checked)">
    </th>`;
    
    cols.forEach(col => {
        let currentFilter = columnFilters[col.key] || '';
        thHtml += `<th class="px-5 py-3.5 text-left align-top bg-slate-100/95">
            <div class="text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:text-rose-600 transition-colors mb-2 select-none" onclick="window.sortData('${col.key}')">
                <span>${col.label}</span><span id="sort-icon-${col.key}" class="text-slate-400"> ↕</span>
            </div>
            <input type="text" id="filter-${col.key}" placeholder="Filter..." value="${currentFilter}"
                class="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 outline-none font-normal text-slate-900 bg-white shadow-sm transition-all"
                onclick="event.stopPropagation()"
                oninput="window.updateColumnFilter('${col.key}', this.value)">
        </th>`;
    });
    thHtml += `<th class="px-5 py-3.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider align-top bg-slate-100/95">Actions</th>`;
    theadRow.innerHTML = thHtml;
    updateSortIcons();
}

// Fast <tbody> rendering using DocumentFragment
function renderBody() {
    const tableName = document.getElementById('tableSelector').value;
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    
    const baseCols = tableColumns[tableName] || tableColumns['doctor'];
    const cols = [{ key: 'company_line', label: 'Line' }, ...baseCols];

    let displayData = getFilteredData();
    window.updateStatusCounts(displayData);

    displayData.sort((a, b) => {
        let valA = a[sortCol] !== undefined && a[sortCol] !== null ? a[sortCol] : '';
        let valB = b[sortCol] !== undefined && b[sortCol] !== null ? b[sortCol] : '';
        
        if (sortCol === 'target_per_month') {
            valA = Number(a.target_per_month || 0);
            valB = Number(b.target_per_month || 0);
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    tableBody.innerHTML = '';

    if (displayData.length === 0) {
        emptyState.innerHTML = `<p class="text-sm text-slate-500 font-medium">No matching records found.</p>`;
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
    }

    const fragment = document.createDocumentFragment();

    displayData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/90 transition-colors";
        
        const isPending = row.status === 'PENDING';
        const statusColor = getStatusColor(row.status);

        let checkboxHtml = `<input type="checkbox" value="${row.sub_id}" data-sub-id="${row.sub_id}"
               class="row-checkbox w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer ${!isPending ? 'opacity-30 cursor-not-allowed' : ''}" 
               ${!isPending ? 'disabled' : ''} ${row.selected ? 'checked' : ''} onchange="window.toggleSelectionAdmin('${row.sub_id}', this.checked)">`;

        let tdHtml = `<td class="px-5 py-3.5 whitespace-nowrap">${checkboxHtml}</td>`;
        
        cols.forEach(col => {
            if (col.key === 'status') {
                tdHtml += `<td class="px-5 py-3.5 whitespace-nowrap">
                    <span class="px-2.5 py-1 inline-flex text-xs leading-4 font-bold rounded-full ${statusColor} shadow-sm border">${row.status || 'EMPTY'}</span>
                </td>`;
            } else if (col.key === 'target_per_month') {
                tdHtml += `<td class="px-5 py-3.5 whitespace-nowrap text-sm font-mono tabular-nums font-bold text-slate-900">${Number(row[col.key] || 0).toLocaleString('en-US')}</td>`;
            } else {
                const textColor = col.key === 'company_line' ? 'text-sky-600 font-bold' : 'text-slate-800 font-semibold';
                tdHtml += `<td class="px-5 py-3.5 whitespace-nowrap text-sm ${textColor}">${row[col.key] || 'N/A'}</td>`;
            }
        });

        // Action Pills + Undo Reject Logic
        let actionButtons = `<span class="text-xs font-medium text-slate-400">Locked</span>`;
        if (isPending) {
            actionButtons = `
                <div class="inline-flex items-center space-x-1.5">
                    <button onclick="window.updateStatus('${tableName}', '${row.sub_id}', 'APPROVED')" class="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 transition-colors shadow-sm">Approve</button>
                    <button onclick="window.updateStatus('${tableName}', '${row.sub_id}', 'REJECTED')" class="px-2.5 py-1 text-xs font-bold rounded-md bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-200 transition-colors shadow-sm">Reject</button>
                </div>
            `;
        } else if (row.status === 'REJECTED') {
            actionButtons = `
                <button onclick="window.updateStatus('${tableName}', '${row.sub_id}', 'PENDING')" class="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white border border-amber-200 transition-colors shadow-sm">Undo Reject</button>
            `;
        }
        
        tdHtml += `<td class="px-5 py-3.5 whitespace-nowrap text-right">${actionButtons}</td>`;

        tr.innerHTML = tdHtml;
        fragment.appendChild(tr);
    });

    tableBody.appendChild(fragment);
    window.syncMasterCheckboxAdmin();
    window.updateBulkUI();
}

function renderTable() {
    renderBody();
}

window.syncMasterCheckboxAdmin = function() {
    const masterCb = document.getElementById('masterCheckbox');
    if (!masterCb) return;
    const allCheckboxes = document.querySelectorAll('.row-checkbox:not(:disabled)');
    const checkedBoxes = document.querySelectorAll('.row-checkbox:checked:not(:disabled)');
    masterCb.checked = (allCheckboxes.length > 0 && allCheckboxes.length === checkedBoxes.length);
};

window.toggleSelectionAdmin = function(subId, isChecked) {
    const item = masterData.find(d => d.sub_id === subId);
    if (item) item.selected = isChecked;
    window.syncMasterCheckboxAdmin();
    window.updateBulkUI();
};

window.toggleAllAdmin = function(isChecked) {
    let displayData = getFilteredData();
    const visibleIds = new Set();

    displayData.forEach(item => {
        if (item.status === 'PENDING') {
            item.selected = isChecked;
            visibleIds.add(item.sub_id);
        }
    });

    document.querySelectorAll('.row-checkbox:not(:disabled)').forEach(cb => {
        if (visibleIds.has(cb.dataset.subId)) {
            cb.checked = isChecked;
        }
    });
    window.updateBulkUI();
};

window.updateBulkUI = function() {
    const selectedCount = masterData.filter(d => d.selected).length;
    const bulkBar = document.getElementById('bulkActions');
    const countDisplay = document.getElementById('selectedCount');
    
    if (selectedCount > 0) {
        bulkBar.classList.remove('hidden');
        countDisplay.textContent = selectedCount;
    } else {
        bulkBar.classList.add('hidden');
    }
};

function getStatusColor(status) {
    if (status === 'APPROVED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'PENDING') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (status === 'REJECTED') return 'bg-rose-50 text-rose-700 border-rose-200';
    return 'bg-slate-100 text-slate-600 border-slate-200'; 
}

window.updateStatus = async function(tableName, subId, newStatus) {
    try {
        const { error } = await supabaseClient.rpc('admin_set_status', {
            p_user_id: session.user_id,
            p_table_name: tableName,
            p_sub_id: subId,
            p_new_status: newStatus
        });
        if (error) throw error;
        window.showToast(`Record marked as ${newStatus}.`, newStatus === 'APPROVED' ? 'success' : 'info');
        window.fetchAdminQueue(tableName, true);
    } catch (err) {
        console.error("Status Update Error:", err.message);
        window.showToast(`Failed to update status: ${err.message}`, "error");
    }
};

window.submitBulk = async function(newStatus) {
    const subIds = masterData.filter(d => d.selected).map(d => d.sub_id);
    const tableName = document.getElementById('tableSelector').value;

    if (subIds.length === 0) return;

    try {
        const { error } = await supabaseClient.rpc('admin_set_status_bulk', {
            p_user_id: session.user_id,
            p_table_name: tableName,
            p_sub_ids: subIds, 
            p_new_status: newStatus
        });
        if (error) throw error;
        window.showToast(`Updated ${subIds.length} records to ${newStatus}.`, newStatus === 'APPROVED' ? 'success' : 'info');
        window.fetchAdminQueue(tableName, true);
    } catch (err) {
        console.error("Bulk Update Error:", err.message);
        window.showToast(`Failed to update records: ${err.message}`, "error");
    }
};

// ==========================================
// EXCEL EXPORT & BULK IMPORT
// ==========================================

window.exportToExcel = function() {
    const dataToExport = (typeof getFilteredData === 'function') ? getFilteredData() : masterData;
    
    if (!dataToExport || dataToExport.length === 0) {
        window.showToast("No data available to export.", "error");
        return;
    }

    const tableName = document.getElementById('tableSelector').value;
    const internalKeys = [
        'selected', 'current_input', 'derived_entity', 'derived_product', 
        'derived_measure', 'derived_rep', 'derived_date', 'derived_city', 'derived_team'
    ];
    
    const cleanData = dataToExport.map(row => {
        const cleanRow = { ...row };
        internalKeys.forEach(k => delete cleanRow[k]);
        return cleanRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(cleanData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Targets");

    XLSX.writeFile(workbook, `${tableName}_export.xlsx`);
    window.showToast(`Exported ${cleanData.length} rows to ${tableName}_export.xlsx`, "success");
};

window.importFromExcel = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const currentTable = document.getElementById('tableSelector').value;
    const expectedName = `${currentTable}_export.xlsx`;

    // 1. Strict Filename Guardrail
    if (file.name !== expectedName) {
        window.showToast(`Upload blocked: Expected "${expectedName}"`, "error");
        alert(`Upload blocked: Invalid file name.\nPlease upload the exact file for this module: "${expectedName}"`);
        event.target.value = '';
        return;
    }

    const importBtn = document.getElementById('importBtn');
    const originalBtnHtml = importBtn ? importBtn.innerHTML : 'Import';
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rawJson = XLSX.utils.sheet_to_json(worksheet);

            // 2. Extract only sub_id and valid target_per_month values
            const updates = [];
            rawJson.forEach(row => {
                if (!row.sub_id) return;
                
                const rawTarget = row.target_per_month;
                if (rawTarget === undefined || rawTarget === null || String(rawTarget).trim() === '') return;

                const cleanTarget = Number(String(rawTarget).replace(/,/g, '').trim());
                if (!isNaN(cleanTarget)) {
                    updates.push({
                        sub_id: String(row.sub_id).trim(),
                        target_per_month: cleanTarget
                    });
                }
            });

            if (updates.length === 0) {
                window.showToast("No valid target values found in the Excel file.", "error");
                return;
            }

            // 3. Send bulk payload to Supabase RPC
            const { error } = await supabaseClient.rpc('submit_bulk_targets', {
                p_user_id: session.user_id,
                p_table_name: currentTable,
                p_payload: updates
            });

            if (error) throw error;

            window.showToast(`Successfully imported and submitted ${updates.length} targets!`, "success");
            window.fetchAdminQueue(currentTable, true);

        } catch (err) {
            console.error("Excel Import Error:", err);
            window.showToast(`Import failed: ${err.message || 'Invalid Excel format.'}`, "error");
        } finally {
            event.target.value = '';
            if (importBtn) {
                importBtn.disabled = false;
                importBtn.innerHTML = originalBtnHtml;
            }
        }
    };

    reader.readAsArrayBuffer(file);
};
