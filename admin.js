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
let columnFilters = {};
let activeFilterId = null;

const baseColumns = [
    { key: 'derived_entity', label: 'KPI / Title' },
    { key: 'derived_rep', label: 'Rep Name' },
    { key: 'derived_city', label: 'City' },
    { key: 'derived_team', label: 'Team / Line' },
    { key: 'derived_date', label: 'Date' },
    { key: 'target', label: 'Monthly Target' },
    { key: 'daily_target', label: 'Daily Target' },
    { key: 'status', label: 'Status' }
];

const tableColumns = {
    doctor: baseColumns,
    coaching: baseColumns,
    pharmacy: baseColumns,
    rtd: baseColumns,
    rx: baseColumns,
    tl_calls: baseColumns,
    liquidation_per_product: baseColumns,
    liquidation_per_employee: baseColumns
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('userNameDisplay').textContent = session.username;
    
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('target_session');
        window.location.href = 'index.html';
    });

    document.getElementById('tableSelector').addEventListener('change', (e) => {
        window.fetchAdminQueue(e.target.value);
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            renderTable();
        });
    }

    window.fetchAdminQueue('doctor');
});

window.fetchAdminQueue = async function(tableName) {
    const emptyState = document.getElementById('emptyState');
    
    searchTerm = '';
    columnFilters = {};
    activeFilterId = null;
    document.getElementById('searchInput').value = '';
    window.updateBulkUI();

    try {
        const { data, error } = await supabaseClient.rpc('get_admin_data', {
            p_user_id: session.user_id,
            p_table_name: tableName
        });

        if (error) throw error;

        if (!data || data.length === 0) {
            masterData = [];
            document.getElementById('tableBody').innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        
        masterData = data.map(row => {
            return {
                ...row,
                derived_entity: row.title || row.kpi || row.kpi_code || 'N/A',
                derived_rep: row.rep_name || 'N/A',
                derived_date: row.date || 'N/A',
                derived_city: row.city || row.region || 'N/A',
                derived_team: row.team || row.company_line || 'N/A',
                selected: false 
            };
        });

        sortCol = 'status'; 
        renderTable();

    } catch (err) {
        console.error("Fetch Error:", err);
        alert("Failed to load data.");
    }
};

function getFilteredData() {
    return masterData.filter(row => {
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

window.updateColumnFilter = function(colKey, val) {
    columnFilters[colKey] = val.toLowerCase();
    activeFilterId = colKey;
    renderTable();
};

window.sortData = function(column) {
    if (sortCol === column) {
        sortAsc = !sortAsc;
    } else {
        sortCol = column;
        sortAsc = true;
    }
    renderTable();
};

function renderTable() {
    const tableName = document.getElementById('tableSelector').value;
    const theadRow = document.querySelector('thead tr');
    const tableBody = document.getElementById('tableBody');
    
    const baseCols = tableColumns[tableName] || tableColumns['doctor'];
    const cols = [{ key: 'company_line', label: 'Line' }, ...baseCols];

    let thHtml = `<th class="px-6 py-3 text-left w-12 align-top">
        <input type="checkbox" id="masterCheckbox" class="w-4 h-4 text-sky-600 rounded focus:ring-sky-500 cursor-pointer mt-7" onchange="window.toggleAllAdmin(this.checked)">
    </th>`;
    
    cols.forEach(col => {
        let currentFilter = columnFilters[col.key] || '';
        thHtml += `<th class="px-6 py-3 text-left align-top">
            <div class="text-xs font-bold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-sky-600 transition-colors mb-2 block" onclick="window.sortData('${col.key}')">${col.label} ↕</div>
            <input type="text" id="filter-${col.key}" placeholder="Filter..." value="${currentFilter}"
                class="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none font-normal text-gray-900 bg-white shadow-sm"
                onclick="event.stopPropagation()"
                oninput="window.updateColumnFilter('${col.key}', this.value)">
        </th>`;
    });
    thHtml += `<th class="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider align-top">Actions</th>`;
    theadRow.innerHTML = thHtml;

    let displayData = getFilteredData();

    displayData.sort((a, b) => {
        let valA = a[sortCol] !== undefined && a[sortCol] !== null ? a[sortCol] : '';
        let valB = b[sortCol] !== undefined && b[sortCol] !== null ? b[sortCol] : '';
        
        if (sortCol === 'target') {
            valA = Number(a.target || 0);
            valB = Number(b.target || 0);
        } else if (sortCol === 'daily_target') {
            valA = Number(a.daily_target || 0);
            valB = Number(b.daily_target || 0);
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    tableBody.innerHTML = '';

    displayData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition-colors";
        
        const isPending = row.status === 'PENDING';
        const statusColor = getStatusColor(row.status);

        let checkboxHtml = `<input type="checkbox" value="${row.sub_id}" 
               class="row-checkbox w-4 h-4 text-sky-600 rounded focus:ring-sky-500 cursor-pointer ${!isPending ? 'opacity-30' : ''}" 
               ${!isPending ? 'disabled' : ''} ${row.selected ? 'checked' : ''} onchange="window.toggleSelectionAdmin('${row.sub_id}', this.checked)">`;

        let tdHtml = `<td class="px-6 py-4 whitespace-nowrap">${checkboxHtml}</td>`;
        
        cols.forEach(col => {
            if (col.key === 'status') {
                tdHtml += `<td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${statusColor} shadow-sm border">${row.status || 'EMPTY'}</span>
                </td>`;
            } else if (col.key === 'target' || col.key === 'daily_target') {
                tdHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">${row[col.key] || 0}</td>`;
            } else {
                const textColor = col.key === 'company_line' ? 'text-sky-600' : 'text-gray-900';
                tdHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm font-bold ${textColor}">${row[col.key] || 'N/A'}</td>`;
            }
        });

        let actionButtons = `<span class="text-xs text-gray-400">Locked</span>`;
        if (isPending) {
            actionButtons = `
                <button onclick="window.updateStatus('${tableName}', '${row.sub_id}', 'APPROVED')" class="mr-3 text-sm font-bold text-emerald-600 hover:text-emerald-800 transition-colors">Approve</button>
                <button onclick="window.updateStatus('${tableName}', '${row.sub_id}', 'REJECTED')" class="text-sm font-bold text-rose-600 hover:text-rose-800 transition-colors">Reject</button>
            `;
        }
        tdHtml += `<td class="px-6 py-4 whitespace-nowrap text-right">${actionButtons}</td>`;

        tr.innerHTML = tdHtml;
        tableBody.appendChild(tr);
    });

    const masterCb = document.getElementById('masterCheckbox');
    const allCheckboxes = document.querySelectorAll('.row-checkbox:not(:disabled)');
    const checkedBoxes = document.querySelectorAll('.row-checkbox:checked:not(:disabled)');
    if (allCheckboxes.length > 0 && allCheckboxes.length === checkedBoxes.length) {
        masterCb.checked = true;
    } else {
        masterCb.checked = false;
    }
    
    window.updateBulkUI();

    if (activeFilterId) {
        const activeInput = document.getElementById('filter-' + activeFilterId);
        if (activeInput) {
            activeInput.focus();
            const valLen = activeInput.value.length;
            activeInput.setSelectionRange(valLen, valLen);
        }
    }
}

window.toggleSelectionAdmin = function(subId, isChecked) {
    const item = masterData.find(d => d.sub_id === subId);
    if (item) item.selected = isChecked;
    window.updateBulkUI();
};

window.toggleAllAdmin = function(isChecked) {
    let displayData = getFilteredData();

    displayData.forEach(item => {
        if (item.status === 'PENDING') {
            item.selected = isChecked;
        }
    });
    renderTable();
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
    return 'bg-gray-50 text-gray-600 border-gray-200'; 
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
        window.fetchAdminQueue(tableName);
    } catch (err) {
        console.error("Status Update Error:", err.message);
        alert(`Failed to update status: ${err.message}`);
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
        window.fetchAdminQueue(tableName);
    } catch (err) {
        console.error("Bulk Update Error:", err.message);
        alert(`Failed to update records: ${err.message}`);
    }
};