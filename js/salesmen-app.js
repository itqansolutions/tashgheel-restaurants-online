/**
 * Tashgheel Restaurants - Salesmen & Payroll App
 * Manages Staff, Attendance, Financials (Loans/Bonuses), and Payroll.
 * Tracks Achieved Sales instead of Service Visits.
 */

// Global State
let allEmployees = [];
let attendanceData = {}; // Key: "YYYY-MM-DD", Value: { empId: { actualHours: 8, status: 'present' } }
let financialData = []; // Array of Transactions
let payrollData = {}; // Key: "YYYY-MM", Value: { status: 'closed', data: [...] }
let employeeTargets = {}; // Key: "YYYY-MM", Value: { empId: { target: 10000, achieved: 0 } }

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Tabs
  setupTabs();

  // 2. Load Data
  loadAllData();

  // 3. Setup Pickers
  setupDatePickers();
});

function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      // Add active
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}

function setupDatePickers() {
  // Today for Attendance
  document.getElementById('attendance-date').valueAsDate = new Date();

  // Financial Form Date
  document.getElementById('fin-date').valueAsDate = new Date();

  // Payroll Selects
  populateMonthYearSelects('payroll-month', 'payroll-year');
  populateMonthYearSelects('hist-month', 'hist-year');

  // Default Targets Month
  document.getElementById('targets-month-picker').value = new Date().toISOString().slice(0, 7);
}

function populateMonthYearSelects(monthId, yearId) {
  const monthSelect = document.getElementById(monthId);
  const yearSelect = document.getElementById(yearId);

  if (!monthSelect || !yearSelect) return;

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  monthSelect.innerHTML = months.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');

  // Set current month
  monthSelect.value = new Date().getMonth() + 1;

  const currentYear = new Date().getFullYear();
  yearSelect.innerHTML = '';
  for (let y = currentYear - 1; y <= currentYear + 1; y++) {
    yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
  }
  yearSelect.value = currentYear;
}


async function loadAllData() {
  // 1. Employees from DB (Salesmen/Technicians)
  allEmployees = window.DB.getSalesmen() || [];
  renderEmployeesTable();
  populateEmployeeSelects();

  // 2. Attendance
  // Stored in 'config' or new key? Let's use 'expenses' logic or a new key 'attendance'
  // DB.js doesn't have getAttendance. We can use EnhancedSecurity directly for new keys.
  attendanceData = window.EnhancedSecurity.getSecureData('attendance') || {};

  // 3. Financials (Loans/Bonus)
  // We can store this in 'expenses' with a special flag OR new 'emp_financials'
  financialData = window.EnhancedSecurity.getSecureData('emp_financials') || [];
  if (typeof renderFinancialHistory === 'function') {
    renderFinancialHistory();
  }

  // 4. Payroll History
  payrollData = window.EnhancedSecurity.getSecureData('payroll_history') || {};

  // 5. Targets
  employeeTargets = window.EnhancedSecurity.getSecureData('emp_targets') || {};
  loadTargetsTable(); // For default month

  console.log("✅ All Payroll Data Loaded");
}

// ================= TAB 1: STAFF MANAGEMENT =================
function renderEmployeesTable() {
  const tbody = document.getElementById('employees-table-body');
  tbody.innerHTML = '';

  allEmployees.forEach(emp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
            <td>${emp.name}</td>
            <td><span class="badge badge-info">${emp.role || 'Staff'}</span></td>
            <td>${emp.baseSalary || 0}</td>
            <td>${emp.shiftHours || 9}</td>
            <td>${emp.mobile || '-'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editEmployee(${emp.id})">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteEmployee(${emp.id})">🗑️</button>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

// Modal Functions
let editingEmpId = null;

// Open Modal
function openEmployeeModal() {
  editingEmpId = null;
  document.getElementById('employee-form').reset();

  // Populate Linked User Dropdown
  const userSelect = document.getElementById('emp-user-link');
  if (userSelect) {
    userSelect.innerHTML = '<option value="">-- None --</option>';

    let users = [];
    // 1. Try Shared DB Access
    if (window.DB && window.DB.getUsers) {
      users = window.DB.getUsers();
    }

    // 2. Try Secure Storage Direct
    if ((!users || users.length === 0) && window.EnhancedSecurity) {
      users = window.EnhancedSecurity.getSecureData('users') || [];
    }

    // 3. Try LocalStorage Direct
    if (!users || users.length === 0) {
      try {
        users = JSON.parse(localStorage.getItem('users') || '[]');
      } catch (e) { }
    }

    console.log("Employees Page: Loaded Users ->", users);

    if (users && users.length > 0) {
      // Deduplicate
      const seen = new Set();
      users.forEach(u => {
        if (u.username && !seen.has(u.username)) {
          seen.add(u.username);
          const opt = document.createElement('option');
          opt.value = u.username;
          opt.textContent = `${u.username} (${u.role || 'User'})`;
          userSelect.appendChild(opt);
        }
      });
    } else {
      const opt = document.createElement('option');
      opt.value = "";
      opt.textContent = "(No Users Found)";
      opt.disabled = true;
      userSelect.appendChild(opt);
    }
  }

  document.getElementById('employee-modal').style.display = 'flex';
}

function closeEmployeeModal() {
  document.getElementById('employee-modal').style.display = 'none';
}

function editEmployee(id) {
  const emp = allEmployees.find(e => e.id === id);
  if (!emp) return;

  editingEmpId = id;
  document.getElementById('emp-name').value = emp.name;
  document.getElementById('emp-role').value = emp.role || '';
  document.getElementById('emp-nid').value = emp.nationalId || '';
  document.getElementById('emp-phone').value = emp.mobile || '';
  document.getElementById('emp-salary').value = emp.baseSalary || '';
  document.getElementById('emp-days').value = emp.workingDays || 26;
  document.getElementById('emp-hours').value = emp.shiftHours || 9;
  document.getElementById('emp-address').value = emp.address || '';

  document.getElementById('employee-modal').style.display = 'flex';
}

function deleteEmployee(id) {
  if (confirm('Are you sure you want to delete this employee?')) {
    window.DB.deleteSalesman(id);
    loadAllData();
  }
}

// Form Submit
document.getElementById('employee-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const newEmp = {
    id: editingEmpId || Date.now(),
    name: document.getElementById('emp-name').value,
    role: document.getElementById('emp-role').value,
    nationalId: document.getElementById('emp-nid').value,
    mobile: document.getElementById('emp-phone').value,
    baseSalary: parseFloat(document.getElementById('emp-salary').value) || 0,
    workingDays: parseInt(document.getElementById('emp-days').value) || 26,
    shiftHours: parseInt(document.getElementById('emp-hours').value) || 9,
    address: document.getElementById('emp-address').value
  };

  window.DB.saveSalesman(newEmp);
  closeEmployeeModal();
  loadAllData();
});


// ================= TAB 2: ATTENDANCE =================
function loadAttendanceForDate() {
  const date = document.getElementById('attendance-date').value;
  if (!date) return;

  const tbody = document.getElementById('attendance-table-body');
  tbody.innerHTML = '';

  const daysData = attendanceData[date] || {};

  allEmployees.forEach(emp => {
    // Get existing record OR default
    const record = daysData[emp.id] || { actualHours: emp.shiftHours || 9, status: 'present' }; // Default to full shift

    const expected = emp.shiftHours || 9;
    const diff = record.actualHours - expected;
    const statusColor = diff < 0 ? 'red' : (diff > 0 ? 'green' : 'black');
    const diffText = diff > 0 ? `+${diff}` : `${diff}`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
            <td>${emp.name}</td>
            <td>${expected} H</td>
            <td>
                <input type="number" class="form-control" style="width:80px" 
                       value="${record.actualHours}" 
                       min="0" max="24" step="0.5"
                       onchange="updateAttendanceRow(this, ${expected}, ${emp.id})">
            </td>
            <td style="color:${statusColor}; font-weight:bold;">${diffText} H</td>
            <td>
                <select class="form-control" onchange="updateAttendanceStatus(this, ${emp.id})">
                    <option value="present" ${record.status === 'present' ? 'selected' : ''}>Present</option>
                    <option value="absent" ${record.status === 'absent' ? 'selected' : ''}>Absent</option>
                    <option value="leave" ${record.status === 'leave' ? 'selected' : ''}>Sick Leave</option>
                    <option value="off" ${record.status === 'off' ? 'selected' : ''}>Day Off</option>
                </select>
            </td>
        `;
    // Store ref to data
    tr.dataset.empid = emp.id;
    tbody.appendChild(tr);
  });
}

function updateAttendanceRow(input, expected, empId) {
  const actual = parseFloat(input.value) || 0;
  const diff = actual - expected;
  const tdDiff = input.parentElement.nextElementSibling;

  tdDiff.textContent = (diff > 0 ? '+' : '') + diff + ' H';
  tdDiff.style.color = diff < 0 ? 'red' : (diff > 0 ? 'green' : 'black');
}

function saveAttendance() {
  const date = document.getElementById('attendance-date').value;
  if (!date) return;

  const tbody = document.getElementById('attendance-table-body');
  const rows = tbody.querySelectorAll('tr');

  if (!attendanceData[date]) attendanceData[date] = {};

  rows.forEach(row => {
    const empId = row.dataset.empid;
    const actual = parseFloat(row.querySelector('input[type="number"]').value) || 0;
    const status = row.querySelector('select').value;

    attendanceData[date][empId] = {
      actualHours: status === 'absent' ? 0 : actual,
      status: status
    };
  });

  window.EnhancedSecurity.storeSecureData('attendance', attendanceData);
  alert('Attendance Saved Successfully for ' + date);
}

// ================= TAB 2a: TARGETS =================
function loadTargetsTable() {
  const month = document.getElementById('targets-month-picker').value; // YYYY-MM
  if (!month) return;

  const tbody = document.getElementById('targets-table-body');
  tbody.innerHTML = '';

  const monthTargets = employeeTargets[month] || {};

  allEmployees.forEach(emp => {
    const tVal = monthTargets[emp.id] ? monthTargets[emp.id].target : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
            <td>${emp.name}</td>
            <td>
                <input type="number" class="form-control target-input" data-empid="${emp.id}" value="${tVal}">
            </td>
        `;
    tbody.appendChild(tr);
  });
}

function saveTargets() {
  const month = document.getElementById('targets-month-picker').value;
  if (!month) { alert('Select Month'); return; }

  if (!employeeTargets[month]) employeeTargets[month] = {};

  const inputs = document.querySelectorAll('.target-input');
  inputs.forEach(input => {
    const empId = input.dataset.empid;
    const val = parseFloat(input.value) || 0;

    employeeTargets[month][empId] = {
      target: val,
      achieved: 0 // Will be calc'd dynamically
    };
  });

  window.EnhancedSecurity.storeSecureData('emp_targets', employeeTargets);
  alert('Targets Saved!');
}


// ================= TAB 3: FINANCIALS =================
function populateEmployeeSelects() {
  const s1 = document.getElementById('fin-employee');
  s1.innerHTML = '';
  allEmployees.forEach(e => {
    s1.innerHTML += `<option value="${e.id}">${e.name}</option>`;
  });
  // Trigger history load
  loadFinancialHistory();
}

document.getElementById('financial-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const empId = document.getElementById('fin-employee').value;
  const type = document.getElementById('fin-type').value;
  const amount = parseFloat(document.getElementById('fin-amount').value);
  const date = document.getElementById('fin-date').value;
  const reason = document.getElementById('fin-reason').value;

  const emp = allEmployees.find(x => x.id == empId);

  const trans = {
    id: Date.now(),
    empId,
    empName: emp ? emp.name : 'Unknown',
    type,
    amount,
    date,
    reason
  };

  financialData.push(trans);
  window.EnhancedSecurity.storeSecureData('emp_financials', financialData);

  alert('Transaction Added');
  e.target.reset();
  document.getElementById('fin-date').valueAsDate = new Date();
  loadFinancialHistory();
});

function loadFinancialHistory() {
  const m = parseInt(document.getElementById('hist-month').value);
  const y = parseInt(document.getElementById('hist-year').value);

  const tbody = document.getElementById('financials-history-body');
  tbody.innerHTML = '';

  const filtered = financialData.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() + 1 === m && d.getFullYear() === y;
  });

  filtered.forEach(t => {
    const row = document.createElement('tr');
    row.innerHTML = `
            <td>${t.date}</td>
            <td>${t.empName}</td>
            <td><span class="badge ${t.type === 'bonus' ? 'badge-success' : 'badge-danger'}">${t.type.toUpperCase()}</span></td>
            <td>${t.amount}</td>
            <td>${t.reason || '-'}</td>
            <td><button class="btn btn-sm btn-danger" onclick="deleteTransaction(${t.id})">x</button></td>
        `;
    tbody.appendChild(row);
  });
}

function deleteTransaction(id) {
  if (confirm('Delete this transaction?')) {
    financialData = financialData.filter(t => t.id !== id);
    window.EnhancedSecurity.storeSecureData('emp_financials', financialData);
    loadFinancialHistory();
  }
}

// ================= TAB 4: PAYROLL CALCULATION =================
let currentPayrollCalculation = [];

async function calculatePayrollPreview() {
  const m = parseInt(document.getElementById('payroll-month').value);
  const y = parseInt(document.getElementById('payroll-year').value);
  const payrollKey = `${y}-${String(m).padStart(2, '0')}`;

  console.log(`Calculating Payroll for ${payrollKey}`);

  // Check if valid period
  if (payrollData[payrollKey] && payrollData[payrollKey].status === 'closed') {
    renderClosedPayroll(payrollData[payrollKey]);
    return;
  }

  // Prepare Calculation
  const reportDate = new Date().toLocaleDateString();
  document.getElementById('print-date').textContent = `Period: ${m}/${y} - Generated: ${reportDate}`;

  const tbody = document.getElementById('payroll-preview-body');
  tbody.innerHTML = '<tr><td colspan="8">Calculating...</td></tr>';

  // Fetch necessary data
  // 1. Sales (Restaurants: Sales Orders)
  const allSales = window.DB.getSales() || [];
  const monthSales = allSales.filter(s => {
    if (!s.date) return false;
    const d = new Date(s.date);
    return d.getMonth() + 1 === m && d.getFullYear() === y;
  });

  // 2. Financials
  const monthFinancials = financialData.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() + 1 === m && d.getFullYear() === y;
  });

  // 3. Attendance
  // Filter attendance keys that match YYYY-MM
  // attendanceData keys are YYYY-MM-DD
  const monthAttendance = {};
  Object.keys(attendanceData).forEach(dateStr => {
    const d = new Date(dateStr);
    if (d.getMonth() + 1 === m && d.getFullYear() === y) {
      // Merge inner data
      const dayData = attendanceData[dateStr];
      Object.keys(dayData).forEach(empId => {
        if (!monthAttendance[empId]) monthAttendance[empId] = { totalHours: 0, presentDays: 0, absentDays: 0 };
        const record = dayData[empId];
        if (record.status === 'present' || record.status === 'leave') {
          monthAttendance[empId].totalHours += parseFloat(record.actualHours || 0);
          monthAttendance[empId].presentDays++;
        } else if (record.status === 'absent') {
          monthAttendance[empId].absentDays++;
        }
      });
    }
  });

  currentPayrollCalculation = [];

  // Calculate per Employee
  allEmployees.forEach(emp => {
    // A. Basic Info
    const baseSalary = parseFloat(emp.baseSalary) || 0;
    const expectedDays = parseFloat(emp.workingDays) || 26;
    const shiftHours = parseFloat(emp.shiftHours) || 9;

    // Hourly Rate (Simplistic: Base / (Days * Hours))
    // Or Base / 30 / Hours?
    // Let's use Base / (ExpectedDays * ShiftHours)
    let hourlyRate = 0;
    if (expectedDays > 0 && shiftHours > 0) {
      hourlyRate = baseSalary / (expectedDays * shiftHours);
    }

    // B. Attendance Calc
    const att = monthAttendance[emp.id] || { totalHours: 0, presentDays: 0 };
    const expectedMonthHours = expectedDays * shiftHours;
    const diffHours = att.totalHours - expectedMonthHours;

    // Value of Diff
    // Overtime = Rate * 1.5? (Configurable?) Let's assume 1.0 for simplicity or 1.5 for positive
    let diffValue = diffHours * hourlyRate;
    // If negative (shortage), usually 1.0 rate deduction.
    // If positive (overtime), maybe 1.5 rate?
    if (diffHours > 0) diffValue = diffHours * (hourlyRate); // * 1.5 for OT?

    // C. Financials
    const empTrans = monthFinancials.filter(t => t.empId == emp.id);
    const deductions = empTrans.filter(t => t.type === 'deduction').reduce((sum, t) => sum + t.amount, 0);
    const bonuses = empTrans.filter(t => t.type === 'bonus').reduce((sum, t) => sum + t.amount, 0);

    // D. Sales Commission
    // Filter Sales where salesman OR cashier is this employee
    const empSales = monthSales.filter(s =>
      (s.salesman && s.salesman === emp.name) ||
      (s.cashier && s.cashier === emp.name)
    );
    const achievedSales = empSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);

    // Target Logic
    let commission = 0;
    const targetObj = employeeTargets[payrollKey] ? employeeTargets[payrollKey][emp.id] : null;
    if (targetObj && targetObj.target > 0) {
      if (achievedSales >= targetObj.target) {
        // Reached Target!
        // 1% Commission? 0.5%?
        commission = achievedSales * 0.01; // Example 1%
      }
    }

    // Final Salary
    // Formula: Base + DiffValue(OT/Shortage) - Deductions + Bonuses + Commission
    const finalSalary = baseSalary + diffValue - deductions + bonuses + commission;

    currentPayrollCalculation.push({
      empId: emp.id,
      name: emp.name,
      baseSalary: baseSalary.toFixed(2),
      actualHours: att.totalHours,
      diffHours: diffHours.toFixed(1),
      diffValue: diffValue.toFixed(2),
      deductions: deductions.toFixed(2),
      bonuses: bonuses.toFixed(2),
      achievedSales: achievedSales.toFixed(2),
      commission: commission.toFixed(2),
      finalSalary: Math.max(0, finalSalary).toFixed(2) // No negative salary
    });
  });

  renderPayrollTable(currentPayrollCalculation, false);
}

function renderPayrollTable(data, isClosed) {
  const tbody = document.getElementById('payroll-preview-body');
  tbody.innerHTML = '';

  // UI Controls
  const banner = document.getElementById('payroll-status-banner');
  const closeBtn = document.getElementById('btn-close-payroll');

  if (isClosed) {
    banner.className = 'alert alert-success';
    banner.textContent = '🔒 This Payroll Period is CLOSED.';
    banner.style.display = 'block';
    closeBtn.style.display = 'none';

    // Disable inputs?
  } else {
    banner.style.display = 'none';
    closeBtn.style.display = 'inline-block';
  }

  let grandTotal = 0;

  data.forEach(row => {
    grandTotal += parseFloat(row.finalSalary);

    const tr = document.createElement('tr');
    tr.innerHTML = `
            <td><strong>${row.name}</strong></td>
            <td>${row.baseSalary}</td>
            <td>${row.actualHours}</td>
            <td style="color:${parseFloat(row.diffValue) < 0 ? 'red' : 'green'}">
                ${row.diffValue}
            </td>
            <td style="color:red">- ${row.deductions}</td>
            <td style="color:green">+ ${row.bonuses}</td>
            <td>
                ${row.achievedSales} <br>
                <small style="color:green; font-weight:bold;">(Comm: ${row.commission})</small>
            </td>
            <td class="final-salary">${row.finalSalary}</td>
        `;
    tbody.appendChild(tr);
  });

  // Footer Row
  const ftr = document.createElement('tr');
  ftr.style.background = '#f8f9fa';
  ftr.innerHTML = `
        <td colspan="7" style="text-align:right; font-weight:bold;">TOTAL PAYOUT:</td>
        <td class="final-salary">${grandTotal.toFixed(2)}</td>
    `;
  tbody.appendChild(ftr);
}

function renderClosedPayroll(record) {
  document.getElementById('payroll-status-banner').textContent = `Closed on ${new Date(record.closedAt).toLocaleDateString()}`;
  currentPayrollCalculation = record.data;
  renderPayrollTable(record.data, true);
}

function closePayrollPeriod() {
  if (!currentPayrollCalculation || currentPayrollCalculation.length === 0) {
    alert('Please Calculate Preview first.');
    return;
  }

  if (!confirm('Are you sure you want to CLOSE this payroll period? This action is irreversible.')) return;

  const m = parseInt(document.getElementById('payroll-month').value);
  const y = parseInt(document.getElementById('payroll-year').value);
  const payrollKey = `${y}-${String(m).padStart(2, '0')}`;

  payrollData[payrollKey] = {
    status: 'closed',
    closedAt: new Date().toISOString(),
    closedBy: 'admin', // Get current user
    data: currentPayrollCalculation
  };

  window.EnhancedSecurity.storeSecureData('payroll_history', payrollData);

  // Optionally: Automatically archive transactions as 'paid'?
  // For now, we leave them in history.

  alert('Payroll Period Closed Successfully.');
  renderPayrollTable(currentPayrollCalculation, true);
}

// Print
function printPayrollReport() {
  window.print();
}

// Translations helper (placeholder if not exists)
// We rely on window.t from translations.js
