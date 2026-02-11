/**
 * TASGHHEEL REPORTS ENGINE
 * Core Logic, Data Aggregation, and Math Layer
 * Phase 7: Separation of Concerns
 */

// === DATE HELPERS ===
window.ReportDateUtils = {
    getRange(preset) {
        const now = new Date();
        const start = new Date(now);
        const end = new Date(now);

        switch (preset) {
            case 'today':
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'yesterday':
                start.setDate(now.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                end.setDate(start.getDate());
                end.setHours(23, 59, 59, 999);
                break;
            case 'thisWeek': // Start Monday
                const day = now.getDay() || 7;
                if (day !== 1) start.setHours(-24 * (day - 1));
                start.setHours(0, 0, 0, 0);
                break;
            case 'lastWeek':
                const day2 = now.getDay() || 7;
                start.setDate(now.getDate() - day2 - 6);
                start.setHours(0, 0, 0, 0);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
                break;
            case 'thisMonth':
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                break;
            case 'lastMonth':
                start.setMonth(now.getMonth() - 1);
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                end.setDate(0); // Last day of prev month
                end.setHours(23, 59, 59, 999);
                break;
            case 'thisYear':
                start.setMonth(0, 1);
                start.setHours(0, 0, 0, 0);
                break;
        }
        return { start, end };
    },

    // For Trends: Get the previous period based on current duration
    getPreviousPeriod(start, end) {
        const duration = end.getTime() - start.getTime();
        const prevEnd = new Date(start.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - duration);
        return { start: prevStart, end: prevEnd };
    }
};

// === TREND ENGINE ===
function calcTrend(current, previous) {
    if (previous === 0) return { pct: current === 0 ? 0 : 100, dir: "up", symbol: "▲", color: "text-green-500" };
    const diff = current - previous;
    const pct = ((diff / previous) * 100).toFixed(1);
    const isPositive = diff >= 0;

    return {
        pct: Math.abs(pct),
        dir: isPositive ? "up" : "down",
        symbol: isPositive ? "▲" : "▼",
        color: isPositive ? "text-green-500" : "text-red-500",
        rawDiff: diff
    };
}

// === MAIN DATA FETCH & AGGREGATE ===
async function buildReportContext() {
    // 1. Get Filters
    const branchId = document.getElementById('branchFilter').value;
    const datePreset = document.getElementById('datePreset').value;

    // Resolve Dates
    let fromDate, toDate;
    if (datePreset === 'custom') {
        fromDate = new Date(document.getElementById('startDate').value);
        toDate = new Date(document.getElementById('endDate').value);
        // Fix end date to end of day
        toDate.setHours(23, 59, 59, 999);
    } else {
        const range = window.ReportDateUtils.getRange(datePreset);
        fromDate = range.start;
        toDate = range.end;

        // Update inputs for visibility
        document.getElementById('startDate').valueAsDate = fromDate;
        document.getElementById('endDate').valueAsDate = toDate;
    }

    // 2. Data Fetching (Current Period)
    const [receipts, rawProducts, rawExpenses, shifts, rawIngredients] = await Promise.all([
        window.electronAPI.getSalesHistory ? window.electronAPI.getSalesHistory({ branchId, from: fromDate.toISOString(), to: toDate.toISOString() }) : [],
        window.electronAPI.readData ? window.electronAPI.readData('products') : [],
        window.DataCache && window.DataCache.expenses ? window.DataCache.expenses.filter(e => {
            const d = new Date(e.date);
            return (!branchId || branchId === 'all' || e.branchId == branchId) && d >= fromDate && d <= toDate;
        }) : [],
        window.electronAPI.getShifts ? window.electronAPI.getShifts({ branchId }) : [],
        window.electronAPI.readData ? window.electronAPI.readData('ingredients') : (window.DB ? window.DB.getIngredients() : [])
    ]);

    // Helper: Dynamic Cost Engine
    const getProductCost = (product) => {
        if (product.type === 'composite' && product.recipe && product.recipe.length > 0) {
            return product.recipe.reduce((total, item) => {
                const ing = rawIngredients.find(i => i.id == item.ingredientId);
                const unitCost = ing ? parseFloat(ing.cost || 0) : 0;
                // Handle Waste/Yield if needed (assuming recipe qty is gross or simple)
                return total + (unitCost * parseFloat(item.qty));
            }, 0);
        }
        return parseFloat(product.cost || product.unitCost) || 0;
    };

    // 2b. Trend Step: Fetch Previous Period Data?
    // For MVP performance, we might simulate or just skip if too heavy. 
    // Let's try to do it right.
    const prevRange = window.ReportDateUtils.getPreviousPeriod(fromDate, toDate);
    // Only basic sales history needed for trends
    const prevReceipts = window.electronAPI.getSalesHistory ? await window.electronAPI.getSalesHistory({ branchId, from: prevRange.start.toISOString(), to: prevRange.end.toISOString() }) : [];
    const prevExpenses = window.DataCache && window.DataCache.expenses ? window.DataCache.expenses.filter(e => {
        const d = new Date(e.date);
        return (!branchId || branchId === 'all' || e.branchId == branchId) && d >= prevRange.start && d <= prevRange.end;
    }) : [];

    // 3. Calculation Helpers
    const processSales = (data) => {
        let gross = 0, net = 0, discounts = 0, returns = 0, tax = 0, cogs = 0;
        const validSales = [];

        data.forEach(r => {
            if (r.status === 'void') return;
            if (r.status === 'refund') {
                returns += r.total;
                return;
            }
            validSales.push(r);

            // Receipt Totals
            gross += (r.subtotal || r.total); // Fallback
            discounts += (r.discount || 0);
            tax += (r.tax || 0);

            // COGS Calculation
            if (r.items) {
                r.items.forEach(item => {
                    if (item.code && item.code.startsWith('SVC-')) return;
                    const cost = item.cost || item.unitCost || 0;
                    cogs += (cost * (item.qty || 1));
                });
            }
        });

        return {
            gross,
            discounts,
            returns,
            tax,
            net: gross - discounts - returns,
            cogs,
            profit: (gross - discounts - returns) - cogs,
            count: validSales.length
        };
    };

    const processExpenses = (data) => {
        return data.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    };

    // 4. Process Current Period
    const currentStats = processSales(receipts);
    const totalExpenses = processExpenses(rawExpenses);
    const netProfit = currentStats.profit - totalExpenses;

    // 5. Process Previous Period (For Trends)
    const prevStats = processSales(prevReceipts);
    const prevTotalExpenses = processExpenses(prevExpenses);
    const prevNetProfit = prevStats.profit - prevTotalExpenses;

    // 6. Calculate Trends
    const trends = {
        netSales: calcTrend(currentStats.net, prevStats.net),
        grossProfit: calcTrend(currentStats.profit, prevStats.profit),
        orders: calcTrend(currentStats.count, prevStats.count),
        avgTicket: calcTrend(
            currentStats.count ? currentStats.net / currentStats.count : 0,
            prevStats.count ? prevStats.net / prevStats.count : 0
        ),
        expenses: calcTrend(totalExpenses, prevTotalExpenses), // Note: Up is bad for expenses? handled in renderer
        netProfit: calcTrend(netProfit, prevNetProfit)
    };

    // 7. Aggregations (Categories, Cashiers, etc.) - Only for Current Period
    const finishedSales = receipts.filter(r => r.status !== 'void' && r.status !== 'refund');

    const catMap = {}, cashierMap = {}, prodMap = {}, payMap = {};
    const stockCatMap = {}, agingBuckets = { '0-7': 0, '8-30': 0, '31-90': 0, '90+': 0 };
    let totalStockCost = 0, totalRetailValue = 0, lowStockCount = 0;

    // Sales Aggregation
    finishedSales.forEach(r => {
        // Payment
        const pKey = r.paymentMethod || 'cash';
        payMap[pKey] = (payMap[pKey] || 0) + r.total;

        // Cashier
        const cKey = r.cashier || r.createdBy || 'Unknown';
        if (!cashierMap[cKey]) cashierMap[cKey] = { count: 0, gross: 0, net: 0, discounts: 0 };
        cashierMap[cKey].count++;
        cashierMap[cKey].gross += (r.subtotal || r.total);
        cashierMap[cKey].discounts += (r.discount || 0);
        cashierMap[cKey].net += (r.subtotal - r.discount);

        // Items
        if (r.items) {
            r.items.forEach(item => {
                if (item.code && item.code.startsWith('SVC-')) return;
                const qty = item.qty || 1;
                const price = item.price || 0;
                const cost = item.cost || item.unitCost || 0;
                const lineTotal = price * qty;
                const lineCost = cost * qty;
                const lineProfit = lineTotal - lineCost;

                // Product
                const pName = item.name || item.description || 'Unknown';
                if (!prodMap[pName]) prodMap[pName] = { qty: 0, gross: 0, net: 0, cost: 0, profit: 0 };
                prodMap[pName].qty += qty;
                prodMap[pName].gross += lineTotal;
                prodMap[pName].net += lineTotal;
                prodMap[pName].cost += lineCost;
                prodMap[pName].profit += lineProfit;

                // Category
                const cat = item.category || 'Uncategorized';
                if (!catMap[cat]) catMap[cat] = { qty: 0, gross: 0, net: 0, cost: 0, profit: 0 };
                catMap[cat].qty += qty;
                catMap[cat].gross += lineTotal;
                catMap[cat].net += lineTotal;
                catMap[cat].cost += lineCost;
                catMap[cat].profit += lineProfit;
            });
        }
    });

    // Expenses Aggregation
    const expCatMap = {}, dailyExpMap = {};
    let largestExp = 0, largestExpName = '-';

    rawExpenses.forEach(e => {
        const amt = parseFloat(e.amount) || 0;
        const cat = e.category || 'Other';
        expCatMap[cat] = (expCatMap[cat] || 0) + amt;

        const day = new Date(e.date).toLocaleDateString();
        dailyExpMap[day] = (dailyExpMap[day] || 0) + amt;

        if (amt > largestExp) { largestExp = amt; largestExpName = e.description || e.category; }
    });

    // Inventory Aggregation
    // Inventory Aggregation (Unified Products + Ingredients)
    const combinedInventory = [...rawProducts];

    // Normalize Ingredients
    if (rawIngredients && Array.isArray(rawIngredients)) {
        rawIngredients.forEach(ing => {
            const qty = parseFloat(ing.stock) || parseFloat(ing.qty) || 0;
            // Only include if positive stock or valid item
            if (qty > 0 || ing.minStock > 0) {
                combinedInventory.push({
                    name: ing.name,
                    category: ing.category || 'Raw Materials',
                    qty: qty,
                    cost: parseFloat(ing.cost) || parseFloat(ing.unitCost) || 0,
                    price: 0, // Ingredients have no retail price
                    minStock: parseFloat(ing.minStock) || 0,
                    lastSoldAt: ing.updatedAt, // Use update time as proxy for activity
                    _isIngredient: true
                });
            }
        });
    }

    combinedInventory.forEach(p => {
        const qty = parseFloat(p.qty) || 0;
        const cost = getProductCost(p); // Use Dynamic Cost Logic
        const price = parseFloat(p.price) || 0;
        const min = parseFloat(p.minStock || 5);

        if (qty > 0) {
            totalStockCost += (qty * cost);
            // Only count Retail Value and Expected Profit for sellable items
            if (price > 0) {
                totalRetailValue += (qty * price);
            }

            const cat = p.category || 'Uncategorized';
            stockCatMap[cat] = (stockCatMap[cat] || 0) + (qty * cost);
        }

        if (qty <= min) lowStockCount++;

        let daysIdle = 999;
        if (p.lastSoldAt) {
            const diff = new Date() - new Date(p.lastSoldAt);
            daysIdle = Math.floor(diff / (1000 * 60 * 60 * 24));
        }

        // Aging Logic
        if (daysIdle <= 7) agingBuckets['0-7']++;
        else if (daysIdle <= 30) agingBuckets['8-30']++;
        else if (daysIdle <= 90) agingBuckets['31-90']++;
        else agingBuckets['90+']++;

        p._computed = {
            stockCost: qty * cost,
            retailValue: qty * price,
            daysIdle,
            health: daysIdle <= 7 ? 'Healthy' : (daysIdle <= 30 ? 'Slow' : 'Dead')
        };
    });

    // Replace the rawProducts list with combined for the renderer
    rawProducts.length = 0;
    rawProducts.push(...combinedInventory);

    // 8. Final Bundle
    return {
        meta: { branchId, fromDate, toDate, prevFromDate: prevRange.start, prevToDate: prevRange.end },
        receipts: finishedSales,
        allReceipts: receipts,
        expenses: rawExpenses,
        products: rawProducts,

        totals: {
            grossSales: currentStats.gross,
            netSales: currentStats.net,
            discounts: currentStats.discounts,
            returns: currentStats.returns,
            tax: currentStats.tax,
            cogs: currentStats.cogs,
            profit: currentStats.profit,
            expenses: totalExpenses,
            netProfit: netProfit,
            marginPercent: currentStats.net > 0 ? (netProfit / currentStats.net) * 100 : 0,

            // Expense details
            largestExpense: largestExp,
            largestExpenseName: largestExpName,

            // Inventory
            stockCost: totalStockCost,
            retailValue: totalRetailValue,
            expectedStockProfit: totalRetailValue - totalStockCost,
            lowStockCount
        },

        trends, // The new Trend Engine Result

        aggs: {
            category: catMap,
            cashier: cashierMap,
            product: prodMap,
            payment: payMap,
            expenseCategory: expCatMap,
            expenseDaily: dailyExpMap,
            stockCategory: stockCatMap,
            stockAging: agingBuckets
        }
    };
}
