/**
 * TASGHHEEL REPORTS ENGINE
 * Core Logic, Data Aggregation, and Math Layer
 * Phase 7: Separation of Concerns
 */

// === DATE HELPERS ===
window.ReportDateUtils = {
    timezone: 'Africa/Cairo',
    formatLocalDate(date) {
        const parts = new Intl.DateTimeFormat('en-CA', {timeZone:this.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
        const get = key => parts.find(part=>part.type===key).value;
        return `${get('year')}-${get('month')}-${get('day')}`;
    },
    parseLocalDate(value, end = false) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Invalid report date');
        const [year,month,day] = value.split('-').map(Number);
        const wall = Date.UTC(year,month-1,day,end?23:0,end?59:0,end?59:0,end?999:0);
        let instant = wall;
        for (let attempt=0;attempt<4;attempt++) {
            const parts = new Intl.DateTimeFormat('en-US',{timeZone:this.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
            const get = key => Number(parts.find(part=>part.type===key).value);
            const rendered = Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second'),end?999:0);
            const delta = wall - rendered;
            instant += delta;
            if (!delta) break;
        }
        const date = new Date(instant);
        if (this.formatLocalDate(date) !== value) throw new Error('Invalid report date');
        return date;
    },
    getRange(preset) {
        const now = new Date(new Date().toLocaleString('en-US',{timeZone:this.timezone}));
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
                start.setDate(1);
                start.setMonth(now.getMonth() - 1);
                start.setHours(0, 0, 0, 0);
                end.setDate(0); // Last day of prev month
                end.setHours(23, 59, 59, 999);
                break;
            case 'thisYear':
                start.setMonth(0, 1);
                start.setHours(0, 0, 0, 0);
                break;
        }
        const calendarDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
        return { start:this.parseLocalDate(calendarDate(start)), end:this.parseLocalDate(calendarDate(end),true) };
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

// Do not silently turn unavailable or truncated history into a zero-sales report.
async function fetchReportSales(filters) {
    if (!window.electronAPI?.isWebAdapter || !window.apiFetch) {
        if (!window.electronAPI?.getSalesHistory) throw new Error('Sales history is unavailable');
        return window.electronAPI.getSalesHistory(filters);
    }
    const sales = [];
    const asOf = new Date().toISOString();
    let page = 1;
    while (true) {
        const params = new URLSearchParams({ ...filters, limit: 500, page, asOf });
        const result = await window.apiFetch(`/reports/history?${params}`);
        if (!result || !Array.isArray(result.sales) || !Number.isFinite(result.total)) throw new Error('Incomplete sales history response');
        sales.push(...result.sales);
        if (sales.length >= result.total) return sales;
        if (!result.sales.length || page >= 2000) throw new Error('Sales history is incomplete; narrow the report period');
        page++;
    }
}

async function fetchReturnEvents(filters) {
    if (!window.electronAPI?.isWebAdapter || !window.apiFetch) throw new Error('Dated return events require an online connection');
    const events = []; let page = 1;
    while (true) {
        const result = await window.apiFetch(`/reports/return-events?${new URLSearchParams({...filters, page})}`);
        if (!Array.isArray(result?.events) || !Number.isFinite(result.total)) throw new Error('Incomplete return events');
        events.push(...result.events);
        if (events.length >= result.total) return events;
        if (!result.events.length || page >= 2000) throw new Error('Return events incomplete; narrow report range');
        page++;
    }
}

// === MAIN DATA FETCH & AGGREGATE ===
async function buildReportContext() {
    // 1. Get Filters
    const branchId = document.getElementById('branchFilter').value;
    const datePreset = document.getElementById('datePreset').value;

    // Resolve Dates
    let fromDate, toDate;
    if (datePreset === 'custom') {
        fromDate = window.ReportDateUtils.parseLocalDate(document.getElementById('startDate').value);
        toDate = window.ReportDateUtils.parseLocalDate(document.getElementById('endDate').value, true);
    } else {
        const range = window.ReportDateUtils.getRange(datePreset);
        fromDate = range.start;
        toDate = range.end;

        // Update inputs for visibility
        document.getElementById('startDate').value = window.ReportDateUtils.formatLocalDate(fromDate);
        document.getElementById('endDate').value = window.ReportDateUtils.formatLocalDate(toDate);
    }

    if (fromDate > toDate) throw new Error('Report start date must not follow end date');

    // Branch-explicit live inventory. Never use the POS active-branch catalog as an all-branch balance.
    const inventory = await window.apiFetch(`/reports/inventory?${new URLSearchParams({branchId})}`);
    if (!Array.isArray(inventory?.products) || !Array.isArray(inventory?.ingredients)) throw new Error('Inventory report unavailable');
    if (inventory.unknownBalances) throw new Error('Legacy inventory has no verified selected-branch balance; manual review required');
    // 2. Data Fetching (Current Period)
    const [receipts, rawProducts, rawExpenses, shifts, rawIngredients, returnEvents] = await Promise.all([
        fetchReportSales({ branchId, from: fromDate.toISOString(), to: toDate.toISOString() }),
        Promise.resolve(inventory.products),
        window.apiFetch(`/reports/expenses?${new URLSearchParams({branchId,from:window.ReportDateUtils.formatLocalDate(fromDate),to:window.ReportDateUtils.formatLocalDate(toDate)})}`),
        window.electronAPI.getShifts ? window.electronAPI.getShifts({ branchId }) : [],
        Promise.resolve(inventory.ingredients),
        fetchReturnEvents({branchId, from:fromDate.toISOString(), to:toDate.toISOString()})
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
    const prevReceipts = await fetchReportSales({ branchId, from: prevRange.start.toISOString(), to: prevRange.end.toISOString() });
    const prevReturnEvents = await fetchReturnEvents({branchId, from:prevRange.start.toISOString(), to:prevRange.end.toISOString()});
    const prevExpenses = await window.apiFetch(`/reports/expenses?${new URLSearchParams({branchId,from:window.ReportDateUtils.formatLocalDate(prevRange.start),to:window.ReportDateUtils.formatLocalDate(prevRange.end)})}`);
    if (!Array.isArray(rawExpenses) || !Array.isArray(prevExpenses)) throw new Error('Expenses report unavailable');

    // 3. Calculation Helpers
    const processSales = (data, events) => {
        let gross = 0, net = 0, discounts = 0, returns = 0, tax = 0, cogs = 0, retainedReturnCost = 0;
        const validSales = [];

        data.forEach(r => {
            if (!['finished', 'refunded'].includes(r.status)) return;
            validSales.push(r);

            // Receipt Totals
            gross += Number(r.subtotal ?? r.total) || 0; // Fallback
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

        for (const event of events) {
            if (!Number.isFinite(event.total) || !Number.isFinite(event.recoveredCost)) throw new Error('Historical return cost needs manual reconciliation; report cannot be certified');
            returns += event.total;
            cogs -= event.recoveredCost;
            retainedReturnCost += Number(event.retainedCost) || 0;
        }
        return {
            gross,
            discounts,
            returns,
            tax,
            net: validSales.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0) - returns,
            cogs,
            retainedReturnCost,
            profit: validSales.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0) - returns - cogs,
            count: validSales.length
        };
    };

    const processExpenses = (data) => {
        return data.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    };

    // 4. Process Current Period
    const currentStats = processSales(receipts, returnEvents);
    const totalExpenses = processExpenses(rawExpenses);
    const netProfit = currentStats.profit - totalExpenses;

    // 5. Process Previous Period (For Trends)
    const prevStats = processSales(prevReceipts, prevReturnEvents);
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
    const finishedSales = receipts.filter(r => ['finished', 'refunded'].includes(r.status));

    const catMap = {}, cashierMap = {}, prodMap = {}, payMap = {};
    const stockCatMap = {}, agingBuckets = { '0-7': 0, '8-30': 0, '31-90': 0, '90+': 0 };
    let totalStockCost = 0, totalRetailValue = 0, lowStockCount = 0;

    // Sales Aggregation
    finishedSales.forEach(r => {
        // Payment
        const pKey = r.method || r.paymentMethod || 'unclassified';
        if (pKey === 'split') { payMap.cash = (payMap.cash || 0) + (Number(r.splitCash) || 0); payMap.card = (payMap.card || 0) + (Number(r.splitCard) || 0); }
        else payMap[pKey] = (payMap[pKey] || 0) + r.total;

        // Cashier
        const cKey = r.cashier || r.createdBy || 'Unknown';
        if (!cashierMap[cKey]) cashierMap[cKey] = { count: 0, gross: 0, net: 0, discounts: 0 };
        cashierMap[cKey].count++;
        cashierMap[cKey].gross += Number(r.subtotal ?? r.total) || 0;
        cashierMap[cKey].discounts += (r.discount || 0);
        cashierMap[cKey].net += Number(r.total) || 0;

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

    // Preserve exact headline totals without inventing per-product allocations of
    // invoice discounts, delivery, tax or historic return events.
    const adjustmentLabel = 'Invoice / return adjustments (not allocated to products)';
    for (const map of [catMap, prodMap]) {
        const sumNet=Object.values(map).reduce((sum,row)=>sum+row.net,0);
        const sumCost=Object.values(map).reduce((sum,row)=>sum+row.cost,0);
        const net=currentStats.net-sumNet, cost=currentStats.cogs-sumCost;
        if(Math.abs(net)>0.000001 || Math.abs(cost)>0.000001) map[adjustmentLabel]={qty:0,gross:0,net,cost,profit:net-cost};
    }
    const cashierNet=Object.values(cashierMap).reduce((sum,row)=>sum+row.net,0);
    if(Math.abs(currentStats.net-cashierNet)>0.000001) cashierMap['Return events (not allocated to cashier)']={count:0,gross:0,net:currentStats.net-cashierNet,discounts:0};

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
            const qty = parseFloat(ing.stock ?? ing.qty) || 0;
            // Only include if positive stock or valid item
            if (qty > 0 || ing.minStock > 0) {
                combinedInventory.push({
                    name: ing.name,
                    category: ing.category || 'Raw Materials',
                    qty: qty,
                    cost: parseFloat(ing.cost) || parseFloat(ing.unitCost) || 0,
                    price: 0, // Ingredients have no retail price
                    minStock: parseFloat(ing.minStock) || 0,
                    lastSoldAt: ing.lastUsedAt || ing.updatedAt || ing.createdAt, // Use update time as proxy for activity
                    _isIngredient: true
                });
            }
        });
    }

    const shopSettings = window.EnhancedSecurity?.getSecureData('shop_settings') || {};
    const deadStockDays = parseInt(shopSettings.deadStockDays) || 30;

    combinedInventory.forEach(p => {
        const qty = parseFloat(p.stock ?? p.qty) || 0;
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
        const activityAt = p.lastSoldAt || p.updatedAt || p.createdAt;
        if (activityAt) {
            const diff = new Date() - new Date(activityAt);
            daysIdle = Math.floor(diff / (1000 * 60 * 60 * 24));
        }

        // Aging Logic
        if (daysIdle <= 7) agingBuckets['0-7']++;
        else if (daysIdle <= deadStockDays) agingBuckets['8-30']++;
        else if (daysIdle <= 90) agingBuckets['31-90']++;
        else agingBuckets['90+']++;

        p._computed = {
            stockCost: qty * cost,
            retailValue: qty * price,
            daysIdle,
            health: daysIdle <= 7 ? 'Healthy' : (daysIdle <= deadStockDays ? 'Slow' : 'Dead')
        };
    });

    // Replace the rawProducts list with combined for the renderer
    rawProducts.length = 0;
    rawProducts.push(...combinedInventory);

    // 8. Final Bundle
    // DELIVERY AGGREGATION
    const deliveryReceipts = receipts.filter(r => r.orderType === 'delivery' && ['finished', 'refunded'].includes(r.status));

    // 1. Delivery KPIs
    let totalDeliveryFees = 0;
    let totalDeliveryRevenue = 0;
    let totalDeliveryOrders = deliveryReceipts.length;

    // 2. Maps
    const deliveryDailyFees = {};
    const deliveryBySource = {};
    const deliveryByDriver = {};

    deliveryReceipts.forEach(r => {
        // Fee & Revenue
        const fee = parseFloat(r.deliveryFee || 0);
        totalDeliveryFees += fee;
        totalDeliveryRevenue += (r.total || 0);

        // Daily Fees Trend
        const dateKey = new Date(r.date).toLocaleDateString();
        deliveryDailyFees[dateKey] = (deliveryDailyFees[dateKey] || 0) + fee;

        // Source Distribution
        // Source defaults to 'Pos' if not set (legacy or internal)
        let source = r.source || 'POS';
        // Normalization: 'pos' -> 'POS', 'talabat' -> 'Talabat'
        if (source.toLowerCase() === 'pos') source = 'POS';
        else source = source.charAt(0).toUpperCase() + source.slice(1);

        if (!deliveryBySource[source]) deliveryBySource[source] = { count: 0, sales: 0 };
        deliveryBySource[source].count++;
        deliveryBySource[source].sales += (r.total || 0);

        // Driver Performance (Only for Internal POS orders)
        // If source is POS, 'salesman' is the driver name.
        // If source is Aggregator, 'salesman' is the provider name (which is redundant with source).
        if (source === 'POS') {
            const driver = r.salesman || 'Unassigned';
            if (!deliveryByDriver[driver]) deliveryByDriver[driver] = { count: 0, fees: 0, total: 0 };
            deliveryByDriver[driver].count++;
            deliveryByDriver[driver].fees += fee;
            deliveryByDriver[driver].total += (r.total || 0);
        }
    });

    // 3. Attach to Aggrs
    const deliveryStats = {
        totalFees: totalDeliveryFees,
        totalRevenue: totalDeliveryRevenue,
        count: totalDeliveryOrders,
        avgFee: totalDeliveryOrders > 0 ? (totalDeliveryFees / totalDeliveryOrders) : 0,
        dailyFees: deliveryDailyFees,
        bySource: deliveryBySource,
        byDriver: deliveryByDriver
    };

    return {
        meta: { branchId, fromDate, toDate, prevFromDate: prevRange.start, prevToDate: prevRange.end },
        receipts: finishedSales,
        allReceipts: receipts,
        returnEvents,
        expenses: rawExpenses,
        products: rawProducts,

        totals: {
            grossSales: currentStats.gross,
            netSales: currentStats.net,
            discounts: currentStats.discounts,
            returns: currentStats.returns,
            tax: currentStats.tax,
            cogs: currentStats.cogs,
            retainedReturnCost: currentStats.retainedReturnCost,
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

        delivery: deliveryStats, // Attached New Section

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

// Expose globally
window.buildReportContext = buildReportContext;
