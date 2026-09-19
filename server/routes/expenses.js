const express = require('express');
const router = express.Router();
const prisma = require('../prisma');

// GET /api/expenses
router.get('/', async (req, res) => {
    try {
        const { tenantId } = req;
        const { from, to, category, branchId: queryBranchId } = req.query;

        const filter = {
            tenantId,
            method: { not: 'credit' } // Unpaid credit purchases are vendor liabilities, not paid expenses
        };
        
        // Use queryBranchId if 'all' isn't requested, or fallback to session branchId
        if (queryBranchId && queryBranchId !== 'all') {
            filter.branchId = queryBranchId;
        } else if (req.branchId && queryBranchId !== 'all') {
            // Include session branch, default branch, or general expenses
            filter.OR = [
                { branchId: req.branchId },
                { branchId: 'default' },
                { branchId: null }
            ];
        }

        if (from || to) {
            filter.date = {};
            if (from) filter.date.gte = String(from);
            if (to) filter.date.lte = String(to);
        }

        if (category) filter.category = category;

        // One-time cleanup of any legacy credit purchase expense records
        try {
            await prisma.expense.deleteMany({
                where: { tenantId, method: 'credit' }
            });
        } catch (e) {}

        const expenses = await prisma.expense.findMany({
            where: filter,
            orderBy: { date: 'desc' }
        });
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/expenses
router.post('/', async (req, res) => {
    try {
        const { description, amount, date, seller, method, notes, category, type } = req.body;
        const { branchId, tenantId, username } = req; // auth middleware sets req.username

        if (!description || !amount || !date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let targetBranchId = branchId;
        if (!targetBranchId || targetBranchId === 'default') {
            const fallbackBranch = await prisma.branch.findFirst({
                where: { tenantId },
                select: { id: true }
            });
            targetBranchId = fallbackBranch?.id || 'default';
        }

        const activeShift = await prisma.shift.findFirst({
            where: {
                tenantId,
                branchId: targetBranchId,
                status: 'open',
                OR: [
                    { cashierId: req.userId },
                    { cashiers: { path: [], array_contains: req.userId } }
                ]
            }
        });

        const expense = await prisma.expense.create({
            data: {
                description,
                amount: parseFloat(amount),
                date: String(date),
                seller: seller || null,
                method: method || 'cash',
                notes: notes || null,
                category: category || 'General',
                type: type || 'expense',
                tenantId,
                branchId: targetBranchId,
                shiftId: activeShift ? activeShift.id : null,
                createdBy: username || 'system'
            }
        });

        res.status(201).json(expense);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { branchId, tenantId } = req;

        const expense = await prisma.expense.findUnique({ where: { id } });
        if (!expense || expense.tenantId !== tenantId || expense.branchId !== branchId) {
            return res.status(404).json({ error: 'Expense not found' });
        }

        await prisma.expense.delete({ where: { id } });
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
