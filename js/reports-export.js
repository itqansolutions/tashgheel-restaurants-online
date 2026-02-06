/**
 * TASGHHEEL REPORTS EXPORT ENGINE
 * PDF, Excel, and Print Functionality
 * Phase 7: Separation of Concerns
 */

window.ReportExport = {
    // === EXCEL EXPORT ===
    exportToExcel(activeTab) {
        if (typeof XLSX === 'undefined') {
            alert('Excel library not loaded. Please check connection.');
            return;
        }

        let tableId = '';
        let title = 'Report';

        switch (activeTab) {
            case 'live': tableId = 'table-recent-orders'; title = 'Live_Monitor_Report'; break;
            case 'sales': tableId = 'table-category-perf'; title = 'Sales_Performance'; break;
            case 'cogs': tableId = 'table-cogs-products'; title = 'COGS_Analysis'; break;
            case 'expenses': tableId = 'table-expenses'; title = 'Expense_Report'; break;
            case 'inventory-report': tableId = 'table-inventory-health'; title = 'Inventory_Health'; break;
            default: alert("No exportable table in this view"); return;
        }

        const table = document.getElementById(tableId);
        if (!table || table.rows.length === 0) {
            alert('No data to export.');
            return;
        }

        const wb = XLSX.utils.table_to_book(table, { sheet: "Sheet1" });
        XLSX.writeFile(wb, `${title}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    },

    // === PDF EXPORT ===
    exportToPDF(activeTab) {
        if (typeof html2pdf === 'undefined') {
            alert('PDF library not loaded.');
            return;
        }

        let elementId = '';
        let title = 'Report';

        switch (activeTab) {
            case 'live': elementId = 'card-live-monitor'; title = 'Live_Monitor'; break;
            case 'sales': elementId = 'card-sales-stats'; title = 'Sales_Report'; break;
            case 'cogs': elementId = 'card-cogs'; title = 'COGS_Report'; break;
            case 'expenses': elementId = 'card-expenses'; title = 'Expenses_Report'; break;
            case 'inventory-report': elementId = 'card-inventory-report'; title = 'Inventory_Report'; break;
        }

        const element = document.getElementById(elementId);
        if (!element) return;

        const opt = {
            margin: 0.2,
            filename: `${title}_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
        };

        html2pdf().set(opt).from(element).save();
    },

    // === PRINT ===
    printCurrentView(activeTab) {
        let elementId = '';
        switch (activeTab) {
            case 'live': elementId = 'card-live-monitor'; break;
            case 'sales': elementId = 'card-sales-stats'; break;
            case 'cogs': elementId = 'card-cogs'; break;
            case 'expenses': elementId = 'card-expenses'; break;
            case 'inventory-report': elementId = 'card-inventory-report'; break;
        }

        const element = document.getElementById(elementId);
        if (!element) return;

        const printWindow = window.open('', '', 'height=700,width=1000');
        printWindow.document.write('<html><head><title>Print</title>');
        printWindow.document.write('<style>body{font-family:sans-serif;padding:20px;} table{width:100%;border-collapse:collapse;font-size:12px;} th,td{border:1px solid #ddd;padding:8px;} .hidden{display:none!important;}</style>');
        printWindow.document.write('</head><body>');
        printWindow.document.write(element.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
    }
};
