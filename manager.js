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
let columnFilters = {}; 
let activeFilterId = null; 

// NEW: Added daily_target to the global schema
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
            renderTable();
        });
    }
});

window.fetchTargets = async function(tableName) {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    
    searchTerm = '';
    columnFilters = {};
    activeFilterId = null;
    document.getElementById('searchInput').value = '';
    window.updateBulkUI();

    tableBody.innerHTML = ''; 
    emptyState.classList.add('hidden');

    try {
        const { data, error } = await supabaseClient.rpc('get_manager_data', {
            p_user_id: session.user_id,
            p_table_name: tableName
        });

        if (error) throw error;

        if (!data || data.length === 0) {
            masterData = [];
            emptyState.classList.remove('hidden');
            return;
        }

       masterData = data.map(row => {
            return {
                ...row,
                derived_entity: row.title || row.kpi || row.kpi_code || 'N/A',
                derived_rep: row.rep_name || 'N/A',
                derived_date: row.date || 'N/A',
                derived_city: row.city || row.region || 'N/A',
                derived_team: row.team || row.company_line || 'N/A',
                current_input: row.target !== null && row.target !== undefined ? row.target : '',
                current_daily_input: row.daily_target !== null && row.daily_target !== undefined ? row.daily_target : '',
                selected: false
            };
        });

        sortCol = 'derived_date'; 
        renderTable();

    } catch (err) {
        console.error("Fetch Error:", err.message);
        emptyState.innerHTML = `<p class="text-sm text-rose-500 font-bold">Failed to load targets.</p>`;
        emptyState.classList.remove('hidden');
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
                // Route target logic to the correct tracked input state
                let cellValue = row[key];
                if (key === 'target' && row.current_input !== undefined) cellValue = row.current_input;
                if (key === 'daily_target' && row.current_daily_input !== undefined) cellValue = row.current_daily_input;

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
    
    const cols = tableColumns[tableName] || tableColumns['doctor'];

    let thHtml = `<th class="px-6 py-3 text-left w-12 align-top">
        <input type="checkbox" id="masterCheckbox" class="w-4 h-4 text-sky-600 rounded focus:ring-sky-500 cursor-pointer mt-7" onchange="window.toggleAll(this.checked)">
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
    theadRow.innerHTML = thHtml;

    let displayData = getFilteredData();

    displayData.sort((a, b) => {
        let valA = a[sortCol] !== undefined && a[sortCol] !== null ? a[sortCol] : '';
        let valB = b[sortCol] !== undefined && b[sortCol] !== null ? b[sortCol] : '';
        
        if (sortCol === 'target') {
            valA = Number(a.current_input || 0);
            valB = Number(b.current_input || 0);
        } else if (sortCol === 'daily_target') {
            valA = Number(a.current_daily_input || 0);
            valB = Number(b.current_daily_input || 0);
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    tableBody.innerHTML = '';

    displayData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition-colors";
        
        const isLocked = (row.status === 'APPROVED' || row.status === 'PENDING');
        const inputClass = isLocked 
            ? "w-full bg-gray-100 border-transparent text-gray-500 cursor-not-allowed rounded px-3 py-2" 
            : "w-full bg-white border border-gray-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded px-3 py-2 outline-none transition-all shadow-sm";
        const statusColor = getStatusColor(row.status);

        let tdHtml = `<td class="px-6 py-4 whitespace-nowrap">
            <input type="checkbox" class="row-checkbox w-4 h-4 text-sky-600 rounded focus:ring-sky-500 cursor-pointer ${isLocked ? 'opacity-30' : ''}" 
                ${isLocked ? 'disabled' : ''} ${row.selected ? 'checked' : ''} 
                onchange="window.toggleSelection('${row.sub_id}', this.checked)">
        </td>`;

        cols.forEach(col => {
            if (col.key === 'target' || col.key === 'daily_target') {
                const dataKey = col.key === 'target' ? 'current_input' : 'current_daily_input';
                tdHtml += `<td class="px-6 py-4 whitespace-nowrap">
                    <input type="number" class="target-input ${inputClass}" 
                        value="${row[dataKey]}" placeholder="0" ${isLocked ? 'disabled' : ''}
                        oninput="window.updateLocalData('${row.sub_id}', '${dataKey}', this.value)">
                </td>`;
            } else if (col.key === 'status') {
                tdHtml += `<td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${statusColor} shadow-sm border">${row.status || 'EMPTY'}</span>
                </td>`;
            } else {
                tdHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">${row[col.key] || 'N/A'}</td>`;
            }
        });

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

// Updated to accept the specific data key
window.updateLocalData = function(subId, dataKey, val) {
    const item = masterData.find(d => d.sub_id === subId);
    if (item) item[dataKey] = val;
};

window.toggleSelection = function(subId, isChecked) {
    const item = masterData.find(d => d.sub_id === subId);
    if (item) item.selected = isChecked;
    window.updateBulkUI();
};

window.toggleAll = function(isChecked) {
    let displayData = getFilteredData();
    displayData.forEach(item => {
        if (item.status === 'EMPTY' || item.status === 'REJECTED') {
            item.selected = isChecked;
        }
    });
    renderTable();
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
    const bulkDaily = document.getElementById('bulkDailyValue')?.value;
    
    masterData.forEach(item => {
        if (item.selected) {
            if (bulkMonth) item.current_input = bulkMonth;
            if (bulkDaily) item.current_daily_input = bulkDaily;
        }
    });
    renderTable(); 
};

function getStatusColor(status) {
    if (status === 'APPROVED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'PENDING') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (status === 'REJECTED') return 'bg-rose-50 text-rose-700 border-rose-200';
    return 'bg-gray-50 text-gray-600 border-gray-200';
}

document.getElementById('submitBtn').addEventListener('click', async () => {
    const btn = document.getElementById('submitBtn');
    const msg = document.getElementById('statusMessage');
    const currentTable = document.getElementById('tableSelector').value;
    
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    const updates = masterData
        .filter(item => (item.status === 'EMPTY' || item.status === 'REJECTED') && (item.current_input !== '' || item.current_daily_input !== ''))
        .map(item => ({
            sub_id: item.sub_id,
            target: Number(item.current_input || 0),
            daily_target: Number(item.current_daily_input || 0)
        }));

    if (updates.length === 0) {
        msg.textContent = "No targets to submit.";
        msg.className = "text-sm font-medium text-gray-500 transition-opacity opacity-100";
        btn.disabled = false;
        btn.textContent = 'Submit Targets';
        setTimeout(() => msg.classList.replace('opacity-100', 'opacity-0'), 3000);
        return;
    }

    try {
        const { error } = await supabaseClient.rpc('submit_dynamic_targets', {
            p_user_id: session.user_id,
            p_table_name: currentTable,
            p_updates: updates
        });

        if (error) throw error;

        msg.textContent = "Targets successfully submitted!";
        msg.className = "text-sm font-bold text-emerald-600 transition-opacity opacity-100";
        btn.textContent = 'Submit Targets';
        
        setTimeout(() => {
            msg.classList.replace('opacity-100', 'opacity-0');
            window.fetchTargets(currentTable);
            btn.disabled = false;
        }, 2000);

    } catch (err) {
        console.error("Update Error:", err.message);
        msg.textContent = "Database error saving targets.";
        msg.className = "text-sm font-bold text-rose-600 transition-opacity opacity-100";
        btn.disabled = false;
        btn.textContent = 'Submit Targets';
    }
});