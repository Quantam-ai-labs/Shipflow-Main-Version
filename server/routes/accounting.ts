import { Express, Request, Response } from "express";
import { db } from "../db";
import { eq, and, desc, sql, gte, lte, sum, count } from "drizzle-orm";
import {
  parties, insertPartySchema,
  partyBalances,
  cashAccounts, insertCashAccountSchema,
  cashMovements,
  expenseTypes, insertExpenseTypeSchema,
  expenses,
  expensePayments,
  accountingProducts, insertAccountingProductSchema,
  stockReceipts,
  sales,
  courierSettlements,
  ledgerEntries,
  accountingAuditLog,
  accountingSettings,
  orders,
  shipments,
  codReconciliation,
  teamMembers,
} from "../../shared/schema";
import type {
  Party, CashAccount, AccountingProduct,
} from "../../shared/schema";

function isAuthenticated(req: any, res: Response, next: Function) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

async function getMerchantId(req: any): Promise<string> {
  const userId = req.session?.userId;
  if (!userId) throw new Error("No user session");
  const [membership] = await db.select().from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)));
  if (!membership?.merchantId) throw new Error("No merchant access");
  return membership.merchantId;
}

async function getOrCreatePartyBalance(merchantId: string, partyId: string): Promise<string> {
  const [existing] = await db.select().from(partyBalances)
    .where(and(eq(partyBalances.merchantId, merchantId), eq(partyBalances.partyId, partyId)));
  if (existing) return existing.balance;
  await db.insert(partyBalances).values({ merchantId, partyId, balance: "0" });
  return "0";
}

async function updatePartyBalance(merchantId: string, partyId: string, delta: number) {
  const current = parseFloat(await getOrCreatePartyBalance(merchantId, partyId));
  const newBal = current + delta;
  await db.update(partyBalances).set({ balance: newBal.toFixed(2), updatedAt: new Date() })
    .where(and(eq(partyBalances.merchantId, merchantId), eq(partyBalances.partyId, partyId)));
  return { before: current, after: newBal };
}

async function updateCashAccountBalance(accountId: string, delta: number) {
  const [acct] = await db.select().from(cashAccounts).where(eq(cashAccounts.id, accountId));
  if (!acct) throw new Error("Account not found");
  const before = parseFloat(acct.balance);
  const after = before + delta;
  await db.update(cashAccounts).set({ balance: after.toFixed(2), updatedAt: new Date() })
    .where(eq(cashAccounts.id, accountId));
  return { before, after, accountName: acct.name };
}

async function createLedgerEntry(merchantId: string, date: Date, description: string,
  debitAccount: string, creditAccount: string, amount: number,
  referenceType?: string, referenceId?: string) {
  await db.insert(ledgerEntries).values({
    merchantId, date, description, debitAccount, creditAccount,
    amount: amount.toFixed(2), referenceType, referenceId,
  });
}

async function createAuditEntry(merchantId: string, eventType: string, entityType: string,
  entityId: string, description: string, balancesBefore: any, balancesAfter: any,
  actorUserId?: string, metadata?: any) {
  await db.insert(accountingAuditLog).values({
    merchantId, eventType, entityType, entityId, description,
    balancesBefore, balancesAfter, actorUserId, metadata,
  });
}

export function registerAccountingRoutes(app: Express) {

  // ========== ACCOUNTING SETTINGS ==========
  app.get("/api/accounting/settings", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      let [settings] = await db.select().from(accountingSettings)
        .where(eq(accountingSettings.merchantId, merchantId));
      if (!settings) {
        [settings] = await db.insert(accountingSettings).values({ merchantId }).returning();
      }
      res.json(settings);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/accounting/settings", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { advancedMode, defaultCashAccountId, defaultCurrency, financialYearStart } = req.body;
      const [settings] = await db.update(accountingSettings)
        .set({ advancedMode, defaultCashAccountId, defaultCurrency, financialYearStart, updatedAt: new Date() })
        .where(eq(accountingSettings.merchantId, merchantId)).returning();
      if (!settings) {
        const [created] = await db.insert(accountingSettings)
          .values({ merchantId, advancedMode, defaultCashAccountId, defaultCurrency, financialYearStart }).returning();
        return res.json(created);
      }
      res.json(settings);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== PARTIES ==========
  app.get("/api/accounting/parties", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { type } = req.query;
      const conditions: any[] = [eq(parties.merchantId, merchantId)];
      if (type && type !== "all") conditions.push(eq(parties.type, type as string));
      const results = await db.select({
        party: parties,
        balance: partyBalances.balance,
      }).from(parties)
        .leftJoin(partyBalances, and(eq(partyBalances.partyId, parties.id), eq(partyBalances.merchantId, parties.merchantId)))
        .where(and(...conditions))
        .orderBy(desc(parties.createdAt));
      res.json(results.map(r => ({ ...r.party, balance: r.balance || "0" })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/accounting/parties", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [party] = await db.insert(parties).values({ ...req.body, merchantId }).returning();
      await db.insert(partyBalances).values({ merchantId, partyId: party.id, balance: req.body.openingBalance || "0" });
      if (req.body.openingBalance && parseFloat(req.body.openingBalance) !== 0) {
        await createAuditEntry(merchantId, "OPENING_BALANCE", "party", party.id,
          `Opening balance set for ${party.name}`, {}, { balance: req.body.openingBalance }, req.user?.id);
      }
      res.json({ ...party, balance: req.body.openingBalance || "0" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/accounting/parties/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { name, type, phone, email, address, tags, notes, isActive } = req.body;
      const [party] = await db.update(parties).set({ name, type, phone, email, address, tags, notes, isActive, updatedAt: new Date() })
        .where(and(eq(parties.id, req.params.id), eq(parties.merchantId, merchantId))).returning();
      res.json(party);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/accounting/parties/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      await db.delete(parties).where(and(eq(parties.id, req.params.id), eq(parties.merchantId, merchantId)));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/accounting/parties/:id/balance", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const balance = await getOrCreatePartyBalance(merchantId, req.params.id);
      res.json({ balance });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== CASH ACCOUNTS ==========
  app.get("/api/accounting/cash-accounts", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const results = await db.select().from(cashAccounts)
        .where(eq(cashAccounts.merchantId, merchantId))
        .orderBy(desc(cashAccounts.createdAt));
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/accounting/cash-accounts", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [account] = await db.insert(cashAccounts).values({
        ...req.body, merchantId, balance: req.body.openingBalance || "0",
      }).returning();
      if (req.body.openingBalance && parseFloat(req.body.openingBalance) !== 0) {
        await createAuditEntry(merchantId, "OPENING_BALANCE", "cash_account", account.id,
          `Opening balance set for ${account.name}`, {}, { balance: req.body.openingBalance }, req.user?.id);
      }
      res.json(account);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/accounting/cash-accounts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { name, type, bankName, accountNumber, isActive } = req.body;
      const [account] = await db.update(cashAccounts)
        .set({ name, type, bankName, accountNumber, isActive, updatedAt: new Date() })
        .where(and(eq(cashAccounts.id, req.params.id), eq(cashAccounts.merchantId, merchantId))).returning();
      res.json(account);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== EXPENSE TYPES ==========
  app.get("/api/accounting/expense-types", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const results = await db.select().from(expenseTypes)
        .where(eq(expenseTypes.merchantId, merchantId));
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/accounting/expense-types", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [result] = await db.insert(expenseTypes).values({ ...req.body, merchantId }).returning();
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== MONEY IN ==========
  app.post("/api/accounting/money-in", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { partyId, amount, cashAccountId, date, note } = req.body;
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) return res.status(400).json({ message: "Invalid amount" });

      const partyDelta = await updatePartyBalance(merchantId, partyId, -amt);
      const acctDelta = await updateCashAccountBalance(cashAccountId, amt);

      const [movement] = await db.insert(cashMovements).values({
        merchantId, cashAccountId, type: "in", amount: amt.toFixed(2),
        balanceAfter: acctDelta.after.toFixed(2), partyId,
        description: note || "Money received", date: new Date(date),
      }).returning();

      await createLedgerEntry(merchantId, new Date(date), `Money In from party`,
        `cash:${cashAccountId}`, `receivable:${partyId}`, amt, "money_in", movement.id);

      await createAuditEntry(merchantId, "MONEY_IN", "cash_movement", movement.id,
        `Received ${amt} into ${acctDelta.accountName}`,
        { partyBalance: partyDelta.before, accountBalance: acctDelta.before },
        { partyBalance: partyDelta.after, accountBalance: acctDelta.after },
        req.user?.id);

      res.json({
        movement,
        partyBalanceBefore: partyDelta.before, partyBalanceAfter: partyDelta.after,
        accountBalanceBefore: acctDelta.before, accountBalanceAfter: acctDelta.after,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== MONEY OUT: PAY EXPENSE ==========
  app.post("/api/accounting/money-out/pay-expense", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { expenseId, amount, cashAccountId, date, note } = req.body;
      const amt = parseFloat(amount);

      const [expense] = await db.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.merchantId, merchantId)));
      if (!expense) return res.status(404).json({ message: "Expense not found" });

      const remaining = parseFloat(expense.remainingDue || expense.amount);
      if (amt > remaining + 0.01) return res.status(400).json({ message: "Amount exceeds remaining due" });

      const acctDelta = await updateCashAccountBalance(cashAccountId, -amt);

      let partyDelta = null;
      if (expense.partyId) {
        partyDelta = await updatePartyBalance(merchantId, expense.partyId, amt);
      }

      const newPaid = parseFloat(expense.paidAmount || "0") + amt;
      const newRemaining = parseFloat(expense.amount) - newPaid;
      const status = newRemaining <= 0.01 ? "paid" : "partial";

      await db.update(expenses).set({
        paidAmount: newPaid.toFixed(2), remainingDue: Math.max(0, newRemaining).toFixed(2),
        paymentStatus: status, updatedAt: new Date(),
      }).where(eq(expenses.id, expenseId));

      await db.insert(expensePayments).values({
        merchantId, expenseId, cashAccountId, partyId: expense.partyId,
        amount: amt.toFixed(2), date: new Date(date), note,
      });

      const [movement] = await db.insert(cashMovements).values({
        merchantId, cashAccountId, type: "out", amount: amt.toFixed(2),
        balanceAfter: acctDelta.after.toFixed(2), partyId: expense.partyId,
        relatedExpenseId: expenseId, description: `Paid expense: ${expense.title}`,
        date: new Date(date),
      }).returning();

      await createLedgerEntry(merchantId, new Date(date), `Expense payment: ${expense.title}`,
        `expense:${expense.category}`, `cash:${cashAccountId}`, amt, "expense_payment", movement.id);

      await createAuditEntry(merchantId, "EXPENSE_PAYMENT", "expense", expenseId,
        `Paid ${amt} for ${expense.title}`,
        { accountBalance: acctDelta.before, partyBalance: partyDelta?.before },
        { accountBalance: acctDelta.after, partyBalance: partyDelta?.after },
        req.user?.id);

      res.json({ success: true, accountBalanceAfter: acctDelta.after, partyBalanceAfter: partyDelta?.after, expenseStatus: status });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== MONEY OUT: NEW EXPENSE (PAID NOW) ==========
  app.post("/api/accounting/money-out/new-expense", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { title, category, amount, partyId, cashAccountId, date, note } = req.body;
      const amt = parseFloat(amount);

      const [expense] = await db.insert(expenses).values({
        merchantId, title, category, amount: amt.toFixed(2),
        paidAmount: amt.toFixed(2), remainingDue: "0", paymentStatus: "paid",
        partyId, cashAccountId, date: new Date(date), notes: note,
      }).returning();

      const acctDelta = await updateCashAccountBalance(cashAccountId, -amt);

      let partyDelta = null;
      if (partyId) {
        partyDelta = await updatePartyBalance(merchantId, partyId, amt);
      }

      const [movement] = await db.insert(cashMovements).values({
        merchantId, cashAccountId, type: "out", amount: amt.toFixed(2),
        balanceAfter: acctDelta.after.toFixed(2), partyId,
        relatedExpenseId: expense.id, description: `New expense: ${title}`,
        date: new Date(date),
      }).returning();

      await db.insert(expensePayments).values({
        merchantId, expenseId: expense.id, cashAccountId, partyId,
        amount: amt.toFixed(2), date: new Date(date), note,
      });

      await createLedgerEntry(merchantId, new Date(date), `Expense: ${title}`,
        `expense:${category}`, `cash:${cashAccountId}`, amt, "expense", expense.id);

      await createAuditEntry(merchantId, "NEW_EXPENSE_PAID", "expense", expense.id,
        `New expense ${title} paid: ${amt}`,
        { accountBalance: acctDelta.before, partyBalance: partyDelta?.before },
        { accountBalance: acctDelta.after, partyBalance: partyDelta?.after },
        req.user?.id);

      res.json({ expense, accountBalanceAfter: acctDelta.after, partyBalanceAfter: partyDelta?.after });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== MONEY OUT: PAY PARTY (ADVANCE) ==========
  app.post("/api/accounting/money-out/pay-party", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { partyId, amount, cashAccountId, date, note } = req.body;
      const amt = parseFloat(amount);

      const acctDelta = await updateCashAccountBalance(cashAccountId, -amt);
      const partyDelta = await updatePartyBalance(merchantId, partyId, amt);

      const [movement] = await db.insert(cashMovements).values({
        merchantId, cashAccountId, type: "out", amount: amt.toFixed(2),
        balanceAfter: acctDelta.after.toFixed(2), partyId,
        description: note || "Payment to party", date: new Date(date),
      }).returning();

      await createLedgerEntry(merchantId, new Date(date), `Payment to party`,
        `payable:${partyId}`, `cash:${cashAccountId}`, amt, "party_payment", movement.id);

      await createAuditEntry(merchantId, "PAY_PARTY", "cash_movement", movement.id,
        `Paid ${amt} to party`,
        { accountBalance: acctDelta.before, partyBalance: partyDelta.before },
        { accountBalance: acctDelta.after, partyBalance: partyDelta.after },
        req.user?.id);

      res.json({ accountBalanceAfter: acctDelta.after, partyBalanceAfter: partyDelta.after });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== MONEY OUT: TRANSFER ==========
  app.post("/api/accounting/money-out/transfer", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { fromAccountId, toAccountId, amount, date, note } = req.body;
      const amt = parseFloat(amount);

      const fromDelta = await updateCashAccountBalance(fromAccountId, -amt);
      const toDelta = await updateCashAccountBalance(toAccountId, amt);

      await db.insert(cashMovements).values({
        merchantId, cashAccountId: fromAccountId, type: "out", amount: amt.toFixed(2),
        balanceAfter: fromDelta.after.toFixed(2),
        description: `Transfer to ${toDelta.accountName}`, date: new Date(date),
      });
      await db.insert(cashMovements).values({
        merchantId, cashAccountId: toAccountId, type: "in", amount: amt.toFixed(2),
        balanceAfter: toDelta.after.toFixed(2),
        description: `Transfer from ${fromDelta.accountName}`, date: new Date(date),
      });

      await createLedgerEntry(merchantId, new Date(date), `Transfer between accounts`,
        `cash:${toAccountId}`, `cash:${fromAccountId}`, amt, "transfer", null as any);

      await createAuditEntry(merchantId, "TRANSFER", "cash_account", fromAccountId,
        `Transferred ${amt} from ${fromDelta.accountName} to ${toDelta.accountName}`,
        { fromBalance: fromDelta.before, toBalance: toDelta.before },
        { fromBalance: fromDelta.after, toBalance: toDelta.after },
        req.user?.id);

      res.json({ fromBalanceAfter: fromDelta.after, toBalanceAfter: toDelta.after });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== MONEY OUT: COURIER SETTLEMENT ==========
  app.post("/api/accounting/money-out/courier-settlement", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { courierPartyId, type, amount, cashAccountId, statementRef, date, notes } = req.body;
      const amt = parseFloat(amount);

      let acctDelta, partyDelta;
      if (type === "cod_received") {
        acctDelta = await updateCashAccountBalance(cashAccountId, amt);
        partyDelta = await updatePartyBalance(merchantId, courierPartyId, -amt);
      } else if (type === "charges_paid") {
        acctDelta = await updateCashAccountBalance(cashAccountId, -amt);
        partyDelta = await updatePartyBalance(merchantId, courierPartyId, amt);
      } else {
        acctDelta = await updateCashAccountBalance(cashAccountId, amt);
        partyDelta = await updatePartyBalance(merchantId, courierPartyId, -amt);
      }

      const [settlement] = await db.insert(courierSettlements).values({
        merchantId, courierPartyId, type, amount: amt.toFixed(2),
        cashAccountId, statementRef, date: new Date(date), notes,
      }).returning();

      const [movement] = await db.insert(cashMovements).values({
        merchantId, cashAccountId, type: type === "charges_paid" ? "out" : "in",
        amount: amt.toFixed(2), balanceAfter: acctDelta.after.toFixed(2),
        partyId: courierPartyId, relatedSettlementId: settlement.id,
        description: `Courier settlement: ${type}`, date: new Date(date),
      }).returning();

      await createLedgerEntry(merchantId, new Date(date), `Courier settlement: ${type}`,
        type === "charges_paid" ? `courier_charges:${courierPartyId}` : `cash:${cashAccountId}`,
        type === "charges_paid" ? `cash:${cashAccountId}` : `courier_cod:${courierPartyId}`,
        amt, "courier_settlement", settlement.id);

      await createAuditEntry(merchantId, "COURIER_SETTLEMENT", "courier_settlement", settlement.id,
        `Courier settlement: ${type} - ${amt}`,
        { accountBalance: acctDelta.before, partyBalance: partyDelta.before },
        { accountBalance: acctDelta.after, partyBalance: partyDelta.after },
        req.user?.id);

      res.json({
        settlement, accountBalanceAfter: acctDelta.after, partyBalanceAfter: partyDelta.after,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== EXPENSES: UNPAID LIST ==========
  app.get("/api/accounting/expenses/unpaid", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const results = await db.select({
        expense: expenses,
        partyBalance: partyBalances.balance,
        partyName: parties.name,
      }).from(expenses)
        .leftJoin(parties, eq(parties.id, expenses.partyId))
        .leftJoin(partyBalances, and(eq(partyBalances.partyId, expenses.partyId), eq(partyBalances.merchantId, expenses.merchantId)))
        .where(and(
          eq(expenses.merchantId, merchantId),
          sql`${expenses.paymentStatus} != 'paid'`
        ))
        .orderBy(desc(expenses.date));
      res.json(results.map(r => ({
        ...r.expense, partyBalance: r.partyBalance || "0", partyName: r.partyName,
      })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== EXPENSE PAYMENTS HISTORY ==========
  app.get("/api/accounting/expenses/:id/payments", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const results = await db.select().from(expensePayments)
        .where(and(eq(expensePayments.expenseId, req.params.id), eq(expensePayments.merchantId, merchantId)))
        .orderBy(desc(expensePayments.date));
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== CREATE UNPAID EXPENSE ==========
  app.post("/api/accounting/expenses/create-unpaid", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { title, category, amount, partyId, date, note } = req.body;
      const amt = parseFloat(amount);

      const [expense] = await db.insert(expenses).values({
        merchantId, title, category, amount: amt.toFixed(2),
        paidAmount: "0", remainingDue: amt.toFixed(2), paymentStatus: "unpaid",
        partyId, date: new Date(date), notes: note,
      }).returning();

      if (partyId) {
        await updatePartyBalance(merchantId, partyId, amt);
      }

      await createLedgerEntry(merchantId, new Date(date), `Expense recorded: ${title}`,
        `expense:${category}`, `payable:${partyId || 'general'}`, amt, "expense", expense.id);

      await createAuditEntry(merchantId, "EXPENSE_RECORDED", "expense", expense.id,
        `Expense recorded: ${title} - ${amt} (unpaid)`, {}, {}, req.user?.id);

      res.json(expense);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== ACCOUNTING PRODUCTS ==========
  app.get("/api/accounting/products", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const results = await db.select().from(accountingProducts)
        .where(eq(accountingProducts.merchantId, merchantId))
        .orderBy(desc(accountingProducts.createdAt));
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/accounting/products", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [product] = await db.insert(accountingProducts).values({ ...req.body, merchantId }).returning();
      res.json(product);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/accounting/products/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { name, sku, sellingPrice, isActive } = req.body;
      const [product] = await db.update(accountingProducts)
        .set({ name, sku, sellingPrice, isActive, updatedAt: new Date() })
        .where(and(eq(accountingProducts.id, req.params.id), eq(accountingProducts.merchantId, merchantId))).returning();
      res.json(product);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== ADD STOCK (RECEIPT) ==========
  app.post("/api/accounting/stock-receipts", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { productId, supplierId, quantity, unitCost, extraCosts, paidNow, cashAccountId, date, notes } = req.body;
      const qty = parseInt(quantity);
      const cost = parseFloat(unitCost);
      const totalCost = qty * cost;

      let extraTotal = 0;
      let landedExtraCosts: any[] = [];
      if (extraCosts && Array.isArray(extraCosts)) {
        for (const ec of extraCosts) {
          const ecAmt = parseFloat(ec.amount);
          extraTotal += ec.addToProductCost ? ecAmt : 0;
          landedExtraCosts.push(ec);

          if (ec.paidNow && ec.cashAccountId) {
            await updateCashAccountBalance(ec.cashAccountId, -ecAmt);
            await db.insert(cashMovements).values({
              merchantId, cashAccountId: ec.cashAccountId, type: "out",
              amount: ecAmt.toFixed(2), description: `Extra cost: ${ec.name}`,
              date: new Date(date),
            });
          }
          if (ec.vendorPartyId) {
            await updatePartyBalance(merchantId, ec.vendorPartyId, ec.paidNow ? 0 : ecAmt);
          }
        }
      }

      const landedTotal = totalCost + extraTotal;
      const landedUnitCost = landedTotal / qty;

      const [product] = await db.select().from(accountingProducts).where(eq(accountingProducts.id, productId));
      if (!product) return res.status(404).json({ message: "Product not found" });

      const oldQty = product.stockQty;
      const oldAvg = parseFloat(product.avgUnitCost);
      const newQty = oldQty + qty;
      const newAvg = newQty > 0 ? ((oldQty * oldAvg) + landedTotal) / newQty : landedUnitCost;

      await db.update(accountingProducts).set({
        stockQty: newQty, avgUnitCost: newAvg.toFixed(2), updatedAt: new Date(),
      }).where(eq(accountingProducts.id, productId));

      const [receipt] = await db.insert(stockReceipts).values({
        merchantId, productId, supplierId, quantity: qty,
        unitCost: cost.toFixed(2), totalCost: totalCost.toFixed(2),
        landedCost: landedTotal.toFixed(2), landedUnitCost: landedUnitCost.toFixed(2),
        extraCosts: landedExtraCosts, paidNow, cashAccountId, date: new Date(date), notes,
      }).returning();

      if (paidNow && cashAccountId) {
        await updateCashAccountBalance(cashAccountId, -totalCost);
        await db.insert(cashMovements).values({
          merchantId, cashAccountId, type: "out", amount: totalCost.toFixed(2),
          relatedReceiptId: receipt.id, description: `Stock purchase: ${product.name}`,
          date: new Date(date),
        });
      }
      if (supplierId) {
        await updatePartyBalance(merchantId, supplierId, paidNow ? 0 : totalCost);
      }

      await createLedgerEntry(merchantId, new Date(date), `Stock receipt: ${product.name} x${qty}`,
        `inventory:${productId}`, paidNow ? `cash:${cashAccountId}` : `payable:${supplierId}`,
        landedTotal, "stock_receipt", receipt.id);

      await createAuditEntry(merchantId, "STOCK_RECEIPT", "stock_receipt", receipt.id,
        `Received ${qty} x ${product.name} at ${cost}/unit (landed: ${landedUnitCost.toFixed(2)}/unit)`,
        { stockQty: oldQty, avgCost: oldAvg },
        { stockQty: newQty, avgCost: newAvg },
        req.user?.id);

      res.json({
        receipt, stockBefore: oldQty, stockAfter: newQty,
        avgCostBefore: oldAvg, avgCostAfter: newAvg,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== SELL ==========
  app.post("/api/accounting/sales", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { productId, customerId, quantity, unitPrice, paidNow, cashAccountId, date, notes } = req.body;
      const qty = parseInt(quantity);
      const price = parseFloat(unitPrice);
      const totalRevenue = qty * price;

      const [product] = await db.select().from(accountingProducts).where(eq(accountingProducts.id, productId));
      if (!product) return res.status(404).json({ message: "Product not found" });
      if (product.stockQty < qty) return res.status(400).json({ message: "Insufficient stock" });

      const avgCost = parseFloat(product.avgUnitCost);
      const cogsTotal = qty * avgCost;
      const grossProfit = totalRevenue - cogsTotal;
      const newQty = product.stockQty - qty;

      await db.update(accountingProducts).set({
        stockQty: newQty, updatedAt: new Date(),
      }).where(eq(accountingProducts.id, productId));

      const [sale] = await db.insert(sales).values({
        merchantId, productId, customerId, quantity: qty,
        unitPrice: price.toFixed(2), totalRevenue: totalRevenue.toFixed(2),
        cogsTotal: cogsTotal.toFixed(2), grossProfit: grossProfit.toFixed(2),
        paidNow, cashAccountId, date: new Date(date), notes,
      }).returning();

      if (paidNow && cashAccountId) {
        const acctDelta = await updateCashAccountBalance(cashAccountId, totalRevenue);
        await db.insert(cashMovements).values({
          merchantId, cashAccountId, type: "in", amount: totalRevenue.toFixed(2),
          balanceAfter: acctDelta.after.toFixed(2), partyId: customerId,
          relatedSaleId: sale.id, description: `Sale: ${product.name}`,
          date: new Date(date),
        });
      }

      if (customerId) {
        await updatePartyBalance(merchantId, customerId, paidNow ? 0 : -totalRevenue);
      }

      await createLedgerEntry(merchantId, new Date(date), `Sale: ${product.name} x${qty}`,
        paidNow ? `cash:${cashAccountId}` : `receivable:${customerId}`,
        `revenue:sales`, totalRevenue, "sale", sale.id);
      await createLedgerEntry(merchantId, new Date(date), `COGS: ${product.name} x${qty}`,
        `cogs:sales`, `inventory:${productId}`, cogsTotal, "cogs", sale.id);

      await createAuditEntry(merchantId, "SALE", "sale", sale.id,
        `Sold ${qty} x ${product.name} at ${price}/unit. Margin: ${grossProfit.toFixed(2)}`,
        { stockQty: product.stockQty, avgCost },
        { stockQty: newQty, revenue: totalRevenue, cogs: cogsTotal, profit: grossProfit },
        req.user?.id);

      res.json({
        sale, stockBefore: product.stockQty, stockAfter: newQty,
        cogs: cogsTotal, grossProfit,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== COURIER FINANCE: COD RECEIVABLE ==========
  app.get("/api/accounting/courier-finance/cod-receivable", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { courier } = req.query;

      const conditions: any[] = [
        eq(orders.merchantId, merchantId),
        eq(orders.workflowStatus, "DELIVERED"),
        sql`${orders.codPaymentStatus} != 'RECEIVED'`,
        sql`COALESCE(${orders.codRemaining}::numeric, 0) > 0`,
      ];
      if (courier) conditions.push(eq(orders.courierName, courier as string));

      const results = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        courierName: orders.courierName,
        courierTracking: orders.courierTracking,
        codRemaining: orders.codRemaining,
        totalAmount: orders.totalAmount,
        deliveredAt: orders.deliveredAt,
      }).from(orders).where(and(...conditions)).orderBy(desc(orders.deliveredAt));

      const totals = await db.select({
        courier: orders.courierName,
        total: sql<string>`COALESCE(SUM(${orders.codRemaining}::numeric), 0)`,
        count: sql<string>`COUNT(*)`,
      }).from(orders).where(and(...conditions)).groupBy(orders.courierName);

      res.json({ items: results, totals });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== COURIER FINANCE: COURIER PAYABLE ==========
  app.get("/api/accounting/courier-finance/courier-payable", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { courier } = req.query;
      const conditions: any[] = [eq(codReconciliation.merchantId, merchantId)];
      if (courier) conditions.push(eq(codReconciliation.courierName, courier as string));

      const results = await db.select().from(codReconciliation)
        .where(and(...conditions))
        .orderBy(desc(codReconciliation.createdAt));
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== COURIER SETTLEMENTS LIST ==========
  app.get("/api/accounting/courier-settlements", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const results = await db.select({
        settlement: courierSettlements,
        partyName: parties.name,
      }).from(courierSettlements)
        .leftJoin(parties, eq(parties.id, courierSettlements.courierPartyId))
        .where(eq(courierSettlements.merchantId, merchantId))
        .orderBy(desc(courierSettlements.date));
      res.json(results.map(r => ({ ...r.settlement, courierName: r.partyName })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== CASH MOVEMENTS HISTORY ==========
  app.get("/api/accounting/cash-movements", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { accountId, startDate, endDate, limit } = req.query;
      const conditions: any[] = [eq(cashMovements.merchantId, merchantId)];
      if (accountId) conditions.push(eq(cashMovements.cashAccountId, accountId as string));
      if (startDate) conditions.push(gte(cashMovements.date, new Date(startDate as string)));
      if (endDate) conditions.push(lte(cashMovements.date, new Date(endDate as string)));

      let query = db.select({
        movement: cashMovements,
        partyName: parties.name,
        accountName: cashAccounts.name,
      }).from(cashMovements)
        .leftJoin(parties, eq(parties.id, cashMovements.partyId))
        .leftJoin(cashAccounts, eq(cashAccounts.id, cashMovements.cashAccountId))
        .where(and(...conditions))
        .orderBy(desc(cashMovements.date));

      if (limit) {
        const limitNum = parseInt(limit as string, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          query = query.limit(limitNum);
        }
      }

      const results = await query;
      res.json(results.map(r => ({
        ...r.movement, partyName: r.partyName, accountName: r.accountName,
      })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== REPORTS: OVERVIEW DASHBOARD ==========
  app.get("/api/accounting/reports/overview", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { startDate, endDate } = req.query;

      const accts = await db.select().from(cashAccounts).where(eq(cashAccounts.merchantId, merchantId));
      const cashNow = accts.reduce((sum, a) => sum + parseFloat(a.balance), 0);

      const positiveBalances = await db.select({
        total: sql<string>`COALESCE(SUM(${partyBalances.balance}::numeric), 0)`,
      }).from(partyBalances).where(and(
        eq(partyBalances.merchantId, merchantId),
        sql`${partyBalances.balance}::numeric > 0`
      ));
      const moneyComing = parseFloat(positiveBalances[0]?.total || "0");

      const negativeBalances = await db.select({
        total: sql<string>`COALESCE(SUM(ABS(${partyBalances.balance}::numeric)), 0)`,
      }).from(partyBalances).where(and(
        eq(partyBalances.merchantId, merchantId),
        sql`${partyBalances.balance}::numeric < 0`
      ));
      const moneyOwed = parseFloat(negativeBalances[0]?.total || "0");

      const workingCapital = cashNow + moneyComing - moneyOwed;

      const dateConditions: any[] = [eq(sales.merchantId, merchantId)];
      if (startDate) dateConditions.push(gte(sales.date, new Date(startDate as string)));
      if (endDate) dateConditions.push(lte(sales.date, new Date(endDate as string)));

      const [salesSummary] = await db.select({
        revenue: sql<string>`COALESCE(SUM(${sales.totalRevenue}::numeric), 0)`,
        cogs: sql<string>`COALESCE(SUM(${sales.cogsTotal}::numeric), 0)`,
        profit: sql<string>`COALESCE(SUM(${sales.grossProfit}::numeric), 0)`,
      }).from(sales).where(and(...dateConditions));

      const expConditions: any[] = [eq(expenses.merchantId, merchantId)];
      if (startDate) expConditions.push(gte(expenses.date, new Date(startDate as string)));
      if (endDate) expConditions.push(lte(expenses.date, new Date(endDate as string)));
      const [expenseSummary] = await db.select({
        total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
      }).from(expenses).where(and(...expConditions));

      const [stockSummary] = await db.select({
        totalValue: sql<string>`COALESCE(SUM(${accountingProducts.stockQty} * ${accountingProducts.avgUnitCost}::numeric), 0)`,
        totalItems: sql<string>`COALESCE(SUM(${accountingProducts.stockQty}), 0)`,
      }).from(accountingProducts).where(eq(accountingProducts.merchantId, merchantId));

      const revenue = parseFloat(salesSummary?.revenue || "0");
      const cogs = parseFloat(salesSummary?.cogs || "0");
      const totalExpenses = parseFloat(expenseSummary?.total || "0");
      const netProfit = revenue - cogs - totalExpenses;

      const [codPending] = await db.select({
        total: sql<string>`COALESCE(SUM(${orders.codRemaining}::numeric), 0)`,
        count: sql<string>`COUNT(*)`,
      }).from(orders).where(and(
        eq(orders.merchantId, merchantId),
        eq(orders.workflowStatus, "DELIVERED"),
        sql`${orders.codPaymentStatus} != 'RECEIVED'`,
        sql`COALESCE(${orders.codRemaining}::numeric, 0) > 0`,
      ));

      res.json({
        cashNow, moneyComing, moneyOwed, workingCapital,
        revenue, cogs, totalExpenses, netProfit,
        stockValue: parseFloat(stockSummary?.totalValue || "0"),
        stockItems: parseInt(stockSummary?.totalItems || "0"),
        codPending: parseFloat(codPending?.total || "0"),
        codPendingCount: parseInt(codPending?.count || "0"),
        accounts: accts,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== REPORTS: P&L ==========
  app.get("/api/accounting/reports/pnl", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { startDate, endDate } = req.query;

      const dateFilter = (table: any) => {
        const c: any[] = [eq(table.merchantId, merchantId)];
        if (startDate) c.push(gte(table.date, new Date(startDate as string)));
        if (endDate) c.push(lte(table.date, new Date(endDate as string)));
        return and(...c);
      };

      const [salesData] = await db.select({
        revenue: sql<string>`COALESCE(SUM(${sales.totalRevenue}::numeric), 0)`,
        cogs: sql<string>`COALESCE(SUM(${sales.cogsTotal}::numeric), 0)`,
      }).from(sales).where(dateFilter(sales));

      const expensesByCategory = await db.select({
        category: expenses.category,
        total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
      }).from(expenses).where(dateFilter(expenses)).groupBy(expenses.category);

      const totalExpenses = expensesByCategory.reduce((s, e) => s + parseFloat(e.total), 0);
      const revenue = parseFloat(salesData?.revenue || "0");
      const cogs = parseFloat(salesData?.cogs || "0");
      const grossProfit = revenue - cogs;
      const netProfit = grossProfit - totalExpenses;

      res.json({
        revenue, cogs, grossProfit, expensesByCategory, totalExpenses, netProfit,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== REPORTS: BALANCE SNAPSHOT ==========
  app.get("/api/accounting/reports/balance-sheet", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);

      const accts = await db.select().from(cashAccounts).where(eq(cashAccounts.merchantId, merchantId));
      const cashTotal = accts.reduce((s, a) => s + parseFloat(a.balance), 0);

      const [receivables] = await db.select({
        total: sql<string>`COALESCE(SUM(${partyBalances.balance}::numeric), 0)`,
      }).from(partyBalances)
        .innerJoin(parties, eq(parties.id, partyBalances.partyId))
        .where(and(
          eq(partyBalances.merchantId, merchantId),
          sql`${partyBalances.balance}::numeric > 0`
        ));

      const [payables] = await db.select({
        total: sql<string>`COALESCE(SUM(ABS(${partyBalances.balance}::numeric)), 0)`,
      }).from(partyBalances)
        .innerJoin(parties, eq(parties.id, partyBalances.partyId))
        .where(and(
          eq(partyBalances.merchantId, merchantId),
          sql`${partyBalances.balance}::numeric < 0`
        ));

      const [stock] = await db.select({
        total: sql<string>`COALESCE(SUM(${accountingProducts.stockQty} * ${accountingProducts.avgUnitCost}::numeric), 0)`,
      }).from(accountingProducts).where(eq(accountingProducts.merchantId, merchantId));

      res.json({
        assets: {
          cash: cashTotal,
          receivables: parseFloat(receivables?.total || "0"),
          inventory: parseFloat(stock?.total || "0"),
          total: cashTotal + parseFloat(receivables?.total || "0") + parseFloat(stock?.total || "0"),
        },
        liabilities: {
          payables: parseFloat(payables?.total || "0"),
          total: parseFloat(payables?.total || "0"),
        },
        accounts: accts,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== REPORTS: CASH FLOW ==========
  app.get("/api/accounting/reports/cash-flow", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { startDate, endDate } = req.query;
      const conditions: any[] = [eq(cashMovements.merchantId, merchantId)];
      if (startDate) conditions.push(gte(cashMovements.date, new Date(startDate as string)));
      if (endDate) conditions.push(lte(cashMovements.date, new Date(endDate as string)));

      const [inflow] = await db.select({
        total: sql<string>`COALESCE(SUM(${cashMovements.amount}::numeric), 0)`,
      }).from(cashMovements).where(and(...conditions, eq(cashMovements.type, "in")));

      const [outflow] = await db.select({
        total: sql<string>`COALESCE(SUM(${cashMovements.amount}::numeric), 0)`,
      }).from(cashMovements).where(and(...conditions, eq(cashMovements.type, "out")));

      const monthlyFlow = await db.select({
        month: sql<string>`TO_CHAR(${cashMovements.date}, 'YYYY-MM')`,
        inflow: sql<string>`COALESCE(SUM(CASE WHEN ${cashMovements.type} = 'in' THEN ${cashMovements.amount}::numeric ELSE 0 END), 0)`,
        outflow: sql<string>`COALESCE(SUM(CASE WHEN ${cashMovements.type} = 'out' THEN ${cashMovements.amount}::numeric ELSE 0 END), 0)`,
      }).from(cashMovements).where(and(...conditions))
        .groupBy(sql`TO_CHAR(${cashMovements.date}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${cashMovements.date}, 'YYYY-MM')`);

      res.json({
        totalInflow: parseFloat(inflow?.total || "0"),
        totalOutflow: parseFloat(outflow?.total || "0"),
        netFlow: parseFloat(inflow?.total || "0") - parseFloat(outflow?.total || "0"),
        monthlyFlow,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== REPORTS: STOCK REPORT ==========
  app.get("/api/accounting/reports/stock", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const products = await db.select().from(accountingProducts)
        .where(eq(accountingProducts.merchantId, merchantId))
        .orderBy(accountingProducts.name);
      const totalValue = products.reduce((s, p) => s + (p.stockQty * parseFloat(p.avgUnitCost)), 0);
      const totalItems = products.reduce((s, p) => s + p.stockQty, 0);
      res.json({ products, totalValue, totalItems });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== REPORTS: PARTY BALANCES ==========
  app.get("/api/accounting/reports/party-balances", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const results = await db.select({
        party: parties,
        balance: partyBalances.balance,
      }).from(parties)
        .leftJoin(partyBalances, and(eq(partyBalances.partyId, parties.id), eq(partyBalances.merchantId, parties.merchantId)))
        .where(eq(parties.merchantId, merchantId))
        .orderBy(parties.name);
      res.json(results.map(r => ({
        id: r.party.id, name: r.party.name, type: r.party.type,
        balance: r.balance || "0",
      })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== ADVANCED: LEDGER ENTRIES ==========
  app.get("/api/accounting/ledger", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { startDate, endDate, account } = req.query;
      const conditions: any[] = [eq(ledgerEntries.merchantId, merchantId)];
      if (startDate) conditions.push(gte(ledgerEntries.date, new Date(startDate as string)));
      if (endDate) conditions.push(lte(ledgerEntries.date, new Date(endDate as string)));
      if (account) {
        conditions.push(sql`(${ledgerEntries.debitAccount} = ${account} OR ${ledgerEntries.creditAccount} = ${account})`);
      }
      const results = await db.select().from(ledgerEntries)
        .where(and(...conditions)).orderBy(desc(ledgerEntries.date)).limit(500);
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== ADVANCED: TRIAL BALANCE ==========
  app.get("/api/accounting/trial-balance", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const debits = await db.select({
        account: ledgerEntries.debitAccount,
        total: sql<string>`COALESCE(SUM(${ledgerEntries.amount}::numeric), 0)`,
      }).from(ledgerEntries).where(eq(ledgerEntries.merchantId, merchantId))
        .groupBy(ledgerEntries.debitAccount);

      const credits = await db.select({
        account: ledgerEntries.creditAccount,
        total: sql<string>`COALESCE(SUM(${ledgerEntries.amount}::numeric), 0)`,
      }).from(ledgerEntries).where(eq(ledgerEntries.merchantId, merchantId))
        .groupBy(ledgerEntries.creditAccount);

      const accountMap: Record<string, { debit: number; credit: number }> = {};
      debits.forEach(d => {
        if (!accountMap[d.account]) accountMap[d.account] = { debit: 0, credit: 0 };
        accountMap[d.account].debit += parseFloat(d.total);
      });
      credits.forEach(c => {
        if (!accountMap[c.account]) accountMap[c.account] = { debit: 0, credit: 0 };
        accountMap[c.account].credit += parseFloat(c.total);
      });

      const entries = Object.entries(accountMap).map(([account, vals]) => ({
        account, debit: vals.debit, credit: vals.credit, net: vals.debit - vals.credit,
      })).sort((a, b) => a.account.localeCompare(b.account));

      res.json({
        entries,
        totalDebits: entries.reduce((s, e) => s + e.debit, 0),
        totalCredits: entries.reduce((s, e) => s + e.credit, 0),
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== AUDIT LOG ==========
  app.get("/api/accounting/audit-log", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { limit: lim } = req.query;
      const results = await db.select().from(accountingAuditLog)
        .where(eq(accountingAuditLog.merchantId, merchantId))
        .orderBy(desc(accountingAuditLog.createdAt))
        .limit(parseInt(lim as string) || 100);
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== STOCK RECEIPTS HISTORY ==========
  app.get("/api/accounting/stock-receipts", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const results = await db.select({
        receipt: stockReceipts,
        productName: accountingProducts.name,
        supplierName: parties.name,
      }).from(stockReceipts)
        .leftJoin(accountingProducts, eq(accountingProducts.id, stockReceipts.productId))
        .leftJoin(parties, eq(parties.id, stockReceipts.supplierId))
        .where(eq(stockReceipts.merchantId, merchantId))
        .orderBy(desc(stockReceipts.date));
      res.json(results.map(r => ({ ...r.receipt, productName: r.productName, supplierName: r.supplierName })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== SALES HISTORY ==========
  app.get("/api/accounting/sales", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const results = await db.select({
        sale: sales,
        productName: accountingProducts.name,
        customerName: parties.name,
      }).from(sales)
        .leftJoin(accountingProducts, eq(accountingProducts.id, sales.productId))
        .leftJoin(parties, eq(parties.id, sales.customerId))
        .where(eq(sales.merchantId, merchantId))
        .orderBy(desc(sales.date));
      res.json(results.map(r => ({ ...r.sale, productName: r.productName, customerName: r.customerName })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== BALANCE PREVIEW (used before any action) ==========
  app.post("/api/accounting/preview-balances", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { partyId, cashAccountId, amount, operation } = req.body;
      const amt = parseFloat(amount) || 0;
      const result: any = {};

      if (partyId) {
        const bal = parseFloat(await getOrCreatePartyBalance(merchantId, partyId));
        const delta = operation === "money_in" ? -amt : amt;
        result.partyBalanceBefore = bal;
        result.partyBalanceAfter = bal + delta;
      }
      if (cashAccountId) {
        const [acct] = await db.select().from(cashAccounts).where(eq(cashAccounts.id, cashAccountId));
        if (acct) {
          const bal = parseFloat(acct.balance);
          const delta = operation === "money_in" || operation === "transfer_to" ? amt : -amt;
          result.accountBalanceBefore = bal;
          result.accountBalanceAfter = bal + delta;
          result.accountName = acct.name;
        }
      }
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}