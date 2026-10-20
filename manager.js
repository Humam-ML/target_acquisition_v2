const sessionStr = localStorage.getItem('target_session');
if (!sessionStr) window.location.href = 'index.html';

const session = JSON.parse(sessionStr);

if (new Date().getTime() > session.expires) {
    localStorage.removeItem('target_session');
    window.location.href = 'index.html';
}

const SUPABASE_URL = 'https://dbdbmbtveftcxcnmqobs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiZGJtYnR2ZWZ0Y3hjbm1xb2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3OTg0OTUsImV4cCI6MjA5NTM3NDQ5NX0.k9EugAVx97AlWFpPdy5xNqsqA7WrhamHZVIs-Rqt3J0';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let masterData = [];
let sortCol = 'derived_date';
let sortAsc = true;
let searchTerm = '';
let statusFilter = 'ALL';
let columnFilters = {};
let filterDebounceTimer = null;

// Base layout for standard tables
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
    }, 4000);
};

// Formats input with commas (e.g., 1000000 -> 1,000,000)
window.formatNumberInput = function(inputElem) {
    let rawValue = inputElem.value.replace(/\D/g, '');
    if (rawValue === '') {
        inputElem.value = '';
        return;
    }
    inputElem.value = Number(rawValue).toLocaleString('en-US');
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('userNameDisplay').textContent = session.username;
    document.getElementById('userLineDisplay').textContent = session.company_line;
    
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('target_session');
        window.location.href = 'index.html';
    });

    const tableSelector = document.getElementById('tableSelector');
    if (tableSelector) {
        tableSelector.addEventListener('change', (e) => {
            window.fetchTargets(e.target.value);
        });
        window.fetchTargets(tableSelector.value);
    }

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
});

// Skeleton Loader while fetching from Supabase
function renderSkeleton(tableName) {
    const cols = tableColumns[tableName] || tableColumns['doctor'];
    const tableBody = document.getElementById('tableBody');
    let html = '';
    for (let i = 0; i < 6; i++) {
        html += `<tr class="animate-pulse"><td class="px-6 py-4"><div class="h-4 w-4 bg-slate-200 rounded"></div></td>`;
        cols.forEach(() => {
            html += `<td class="px-6 py-4"><div class="h-4 bg-slate-200 rounded w-24"></div></td>`;
        });
        html += `</tr>`;
    }
    tableBody.innerHTML = html;
}

window.fetchTargets = async function(tableName) {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    
    searchTerm = '';
    statusFilter = 'ALL';
    columnFilters = {};
    document.getElementById('searchInput').value = '';
    window.updateStatusPillStyles();
    window.updateFilterResetButton();
    window.updateBulkUI();

    emptyState.classList.add('hidden');
    renderHeader(tableName);
    renderSkeleton(tableName);

    try {
        const { data, error } = await supabaseClient.rpc('get_manager_data', {
            p_user_id: session.user_id,
            p_table_name: tableName
        });

        if (error) throw error;

        if (!data || data.length === 0) {
            masterData = [];
            tableBody.innerHTML = '';
            window.updateStatusCounts([]);
            window.updateUnsavedBadge();
            emptyState.innerHTML = `<p class="text-sm text-slate-500 font-medium">No targets found for this module.</p>`;
            emptyState.classList.remove('hidden');
            return;
        }

        masterData = data.map(row => {
            const initVal = row.target_per_month !== null && row.target_per_month !== undefined ? String(row.target_per_month) : '';
            return {
                ...row,
                derived_entity: row.title || row.kpi || row.kpi_code || 'N/A',
                derived_product: row.product_name || 'N/A', 
                derived_measure: row['Measure Unit'] || row.measure_unit || 'N/A', 
                derived_rep: row.rep_name || 'N/A',
                derived_date: row.date || 'N/A',
                derived_city: row.city || row.region || 'N/A',
                derived_team: row.team || row.company_line || 'N/A',
                original_input: initVal,
                current_input: initVal,
                selected: false
            };
        });

        sortCol = 'derived_date';
        sortAsc = true;
        updateSortIcons();
        renderBody();
        window.updateUnsavedBadge();

    } catch (err) {
        console.error("Fetch Error:", err.message);
        tableBody.innerHTML = '';
        emptyState.innerHTML = `<p class="text-sm text-rose-500 font-bold">Failed to load targets.</p>`;
        emptyState.classList.remove('hidden');
        window.showToast("Failed to load targets from database.", "error");
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
                if (key === 'target_per_month' && row.current_input !== undefined) cellValue = row.current_input;

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
            pill.classList.add('ring-2', 'ring-offset-1', 'ring-sky-500');
        } else {
            pill.classList.remove('ring-2', 'ring-offset-1', 'ring-sky-500');
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
            el.className = 'text-sky-600 font-extrabold';
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
        const donePct = total > 0 ? Math.round(((counts.APPROVED + counts.PENDING) / total) * 100) : 0;
        completionPct.textContent = `${donePct}%`;
    }
};

// Build <thead> once per module switch so column filter inputs never lose focus
function renderHeader(tableName) {
    const currentTable = tableName || document.getElementById('tableSelector').value;
    const theadRow = document.getElementById('theadRow') || document.querySelector('thead tr');
    const cols = tableColumns[currentTable] || tableColumns['doctor'];

    let thHtml = `<th class="px-5 py-3.5 text-left w-12 align-top bg-slate-50">
        <input type="checkbox" id="masterCheckbox" class="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer mt-7" onchange="window.toggleAll(this.checked)">
    </th>`;
    
    cols.forEach(col => {
        let currentFilter = columnFilters[col.key] || '';
        thHtml += `<th class="px-5 py-3.5 text-left align-top bg-slate-50">
            <div class="text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:text-sky-600 transition-colors mb-2 select-none" onclick="window.sortData('${col.key}')">
                <span>${col.label}</span><span id="sort-icon-${col.key}" class="text-slate-400"> ↕</span>
            </div>
            <input type="text" id="filter-${col.key}" placeholder="Filter..." value="${currentFilter}"
                class="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none font-normal text-slate-900 bg-white shadow-sm transition-all"
                onclick="event.stopPropagation()"
                oninput="window.updateColumnFilter('${col.key}', this.value)">
        </th>`;
    });
    theadRow.innerHTML = thHtml;
    updateSortIcons();
}

// Fast <tbody> rendering using DocumentFragment
function renderBody() {
    const tableName = document.getElementById('tableSelector').value;
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    const cols = tableColumns[tableName] || tableColumns['doctor'];

    // Update status counts based on search + column filters (or active view)
    let displayData = getFilteredData();
    window.updateStatusCounts(displayData);

    displayData.sort((a, b) => {
        let valA = a[sortCol] !== undefined && a[sortCol] !== null ? a[sortCol] : '';
        let valB = b[sortCol] !== undefined && b[sortCol] !== null ? b[sortCol] : '';
        
        if (sortCol === 'target_per_month') {
            valA = Number(a.current_input || 0);
            valB = Number(b.current_input || 0);
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    tableBody.innerHTML = '';

    if (displayData.length === 0) {
        emptyState.innerHTML = `<p class="text-sm text-slate-500 font-medium">No matching targets found.</p>`;
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
    }

    const fragment = document.createDocumentFragment();

    displayData.forEach(row => {
        const tr = document.createElement('tr');
        tr.id = `row-${row.sub_id}`;
        
        const isLocked = (row.status === 'APPROVED' || row.status === 'PENDING');
        const isReadyToSubmit = (!isLocked && row.current_input !== '' && String(row.current_input) !== String(row.original_input));
        
        tr.className = isReadyToSubmit
            ? "bg-amber-50/40 hover:bg-amber-50/70 transition-colors"
            : "hover:bg-slate-50/90 transition-colors";
        
        const inputClass = isLocked 
            ? "w-40 bg-slate-100 border border-transparent text-slate-400 font-mono tabular-nums cursor-not-allowed rounded-lg px-3 py-1.5 text-sm" 
            : (isReadyToSubmit
                ? "w-40 bg-white border-2 border-amber-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 font-mono tabular-nums rounded-lg px-3 py-1.5 text-sm outline-none transition-all shadow-sm font-semibold text-slate-900"
                : "w-40 bg-white border border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 font-mono tabular-nums rounded-lg px-3 py-1.5 text-sm outline-none transition-all shadow-sm font-semibold text-slate-900");
        
        const statusColor = getStatusColor(row.status);

        let tdHtml = `<td class="px-5 py-3.5 whitespace-nowrap">
            <input type="checkbox" data-sub-id="${row.sub_id}" class="row-checkbox w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer ${isLocked ? 'opacity-30 cursor-not-allowed' : ''}" 
                ${isLocked ? 'disabled' : ''} ${row.selected ? 'checked' : ''} 
                onchange="window.toggleSelection('${row.sub_id}', this.checked)">
        </td>`;

        cols.forEach(col => {
            if (col.key === 'target_per_month') {
                const dataKey = 'current_input';
                let displayVal = row[dataKey] !== '' && row[dataKey] !== null && row[dataKey] !== undefined
                    ? Number(row[dataKey]).toLocaleString('en-US')
                    : '';
                
                tdHtml += `<td class="px-5 py-3.5 whitespace-nowrap">
                    <input type="text" data-input-sub-id="${row.sub_id}" class="target-input ${inputClass}" 
                        value="${displayVal}" placeholder="0" ${isLocked ? 'disabled' : ''}
                         onkeydown="window.handleInputKeydown(event)"
                        oninput="window.formatNumberInput(this); window.updateLocalData('${row.sub_id}', '${dataKey}', this.value, this)">
                </td>`;
            } else if (col.key === 'status') {
                tdHtml += `<td class="px-5 py-3.5 whitespace-nowrap">
                    <span class="px-2.5 py-1 inline-flex text-xs leading-4 font-bold rounded-full ${statusColor} shadow-sm border">${row.status || 'EMPTY'}</span>
                </td>`;
            } else {
                tdHtml += `<td class="px-5 py-3.5 whitespace-nowrap text-sm font-semibold text-slate-800">${row[col.key] || 'N/A'}</td>`;
            }
        });

        tr.innerHTML = tdHtml;
        fragment.appendChild(tr);
    });

    tableBody.appendChild(fragment);
    window.syncMasterCheckbox();
    window.updateBulkUI();
}

// Keep renderTable alias for backwards compatibility
function renderTable() {
    renderBody();
}

// Excel-style Enter / ArrowDown / ArrowUp navigation between editable target inputs
window.handleInputKeydown = function(event) {
    if (event.key !== 'Enter' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();

    const enabledInputs = Array.from(document.querySelectorAll('.target-input:not(:disabled)'));
    const currentIndex = enabledInputs.indexOf(event.target);
    if (currentIndex === -1) return;

    const nextIndex = (event.key === 'ArrowUp') ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex >= 0 && nextIndex < enabledInputs.length) {
        const nextInput = enabledInputs[nextIndex];
        nextInput.focus();
        nextInput.select();
    }
};

window.updateLocalData = function(subId, dataKey, val, inputElem) {
    const item = masterData.find(d => d.sub_id === subId);
    if (item) {
        // Strip commas so the stored variable remains math-ready
        item[dataKey] = val.replace(/,/g, '');
        
        // Highlight row in-place if modified
        const tr = document.getElementById(`row-${subId}`);
        const isEdited = item.current_input !== '' && String(item.current_input) !== String(item.original_input);
        if (tr) {
            tr.className = isEdited
                ? "bg-amber-50/40 hover:bg-amber-50/70 transition-colors"
                : "hover:bg-slate-50/90 transition-colors";
        }
        if (inputElem) {
            if (isEdited) {
                inputElem.classList.add('border-2', 'border-amber-400');
                inputElem.classList.remove('border-slate-300');
            } else {
                inputElem.classList.remove('border-2', 'border-amber-400');
                inputElem.classList.add('border-slate-300');
            }
        }
        window.updateUnsavedBadge();
    }
};

window.updateUnsavedBadge = function() {
    const badge = document.getElementById('unsavedCountBadge');
    if (!badge) return;
    const readyCount = masterData.filter(
        item => (item.status === 'EMPTY' || item.status === 'REJECTED') && item.current_input !== ''
    ).length;

    if (readyCount > 0) {
        badge.textContent = readyCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
};

window.syncMasterCheckbox = function() {
    const masterCb = document.getElementById('masterCheckbox');
    if (!masterCb) return;
    const allCheckboxes = document.querySelectorAll('.row-checkbox:not(:disabled)');
    const checkedBoxes = document.querySelectorAll('.row-checkbox:checked:not(:disabled)');
    masterCb.checked = (allCheckboxes.length > 0 && allCheckboxes.length === checkedBoxes.length);
};

window.toggleSelection = function(subId, isChecked) {
    const item = masterData.find(d => d.sub_id === subId);
    if (item) item.selected = isChecked;
    window.syncMasterCheckbox();
    window.updateBulkUI();
};

window.toggleAll = function(isChecked) {
    let displayData = getFilteredData();
    const visibleIds = new Set();
    displayData.forEach(item => {
        if (item.status === 'EMPTY' || item.status === 'REJECTED') {
            item.selected = isChecked;
            visibleIds.add(item.sub_id);
        }
    });
    // Update checkboxes in-place without rebuilding DOM
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
    if (selectedCount > 0) {
        bulkBar.classList.remove('hidden');
        document.getElementById('selectedCount').textContent = selectedCount;
    } else {
        bulkBar.classList.add('hidden');
    }
};

window.applyBulk = function() {
    const bulkMonth = document.getElementById('bulkTargetValue')?.value;
    const cleanBulk = bulkMonth ? bulkMonth.replace(/,/g, '') : '';
    if (!cleanBulk) {
        window.showToast("Enter a target value to bulk fill.", "info");
        return;
    }
    
    let updated = 0;
    masterData.forEach(item => {
        if (item.selected) {
            item.current_input = cleanBulk;
            updated++;
        }
    });
    renderBody();
    window.updateUnsavedBadge();
    window.showToast(`Applied ${Number(cleanBulk).toLocaleString('en-US')} to ${updated} selected rows.`, "success");
};

function getStatusColor(status) {
    if (status === 'APPROVED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'PENDING') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (status === 'REJECTED') return 'bg-rose-50 text-rose-700 border-rose-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
}

document.getElementById('submitBtn').addEventListener('click', async () => {
    const btn = document.getElementById('submitBtn');
    const msg = document.getElementById('statusMessage');
    const currentTable = document.getElementById('tableSelector').value;
    
    const updates = masterData
        .filter(item => (item.status === 'EMPTY' || item.status === 'REJECTED') && item.current_input !== '')
        .map(item => ({
            sub_id: item.sub_id,
            target_per_month: Number(item.current_input || 0)
        }));

    if (updates.length === 0) {
        msg.textContent = "No targets to submit.";
        msg.className = "text-sm font-medium text-slate-500 transition-opacity opacity-100";
        window.showToast("No editable targets to submit.", "info");
        setTimeout(() => msg.classList.replace('opacity-100', 'opacity-0'), 3000);
        return;
    }

    btn.disabled = true;
    const originalBtnHtml = btn.innerHTML;
    btn.innerHTML = `<span>Saving ${updates.length}...</span>`;

    try {
        const { error } = await supabaseClient.rpc('submit_dynamic_targets', {
            p_user_id: session.user_id,
            p_table_name: currentTable,
            p_updates: updates
        });

        if (error) throw error;

        msg.textContent = "Targets successfully submitted!";
        msg.className = "text-sm font-bold text-emerald-600 transition-opacity opacity-100";
        window.showToast(`Submitted ${updates.length} targets for approval!`, "success");
        
        setTimeout(() => {
            msg.classList.replace('opacity-100', 'opacity-0');
            window.fetchTargets(currentTable);
            btn.disabled = false;
            btn.innerHTML = originalBtnHtml;
        }, 1200);

    } catch (err) {
        console.error("Update Error:", err.message);
        msg.textContent = "Database error saving targets.";
        msg.className = "text-sm font-bold text-rose-600 transition-opacity opacity-100";
        window.showToast(`Error saving targets: ${err.message}`, "error");
        btn.disabled = false;
        btn.innerHTML = originalBtnHtml;
    }
});

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
        'selected', 'original_input', 'current_input', 'derived_entity', 'derived_product', 
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
    const msg = document.getElementById('statusMessage');
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

            // 2. Strip extra columns and keep only sub_id + valid target_per_month
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

            // 3. Submit bulk updates directly to Supabase
            const { error } = await supabaseClient.rpc('submit_bulk_targets', {
                p_user_id: session.user_id,
                p_table_name: currentTable,
                p_payload: updates
            });

            if (error) throw error;

            if (msg) {
                msg.textContent = `Imported ${updates.length} targets!`;
                msg.className = "text-sm font-bold text-emerald-600 transition-opacity opacity-100";
                setTimeout(() => msg.classList.replace('opacity-100', 'opacity-0'), 3000);
            }
            window.showToast(`Successfully imported and submitted ${updates.length} targets!`, "success");
            window.fetchTargets(currentTable);

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
