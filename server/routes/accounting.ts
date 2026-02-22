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
  stockReceiptItems,
  sales,
  saleItems,
  salePayments,
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

  // ========== ADD STOCK (RECEIPT) - MULTI-ITEM ==========
  app.post("/api/accounting/stock-receipts", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { items, supplierId, paymentType, cashAccountId, extraCosts: rawExtra, description, date } = req.body;

      if (!supplierId) return res.status(400).json({ message: "Supplier party is required." });
      if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "At least one item is required." });

      const pType = paymentType || "PAID_NOW";
      if (!["PAID_NOW", "CREDIT"].includes(pType)) return res.status(400).json({ message: "Payment type must be PAID_NOW or CREDIT." });
      if (pType === "PAID_NOW" && !cashAccountId) return res.status(400).json({ message: "Cash/Bank account is required for Paid Now purchases." });
      if (pType === "CREDIT" && cashAccountId) return res.status(400).json({ message: "Cash/Bank account must not be set for Credit purchases." });

      const extra = parseFloat(rawExtra) || 0;
      if (extra < 0) return res.status(400).json({ message: "Extra costs must be >= 0." });

      const productIds = new Set<string>();
      const parsedItems: { productId: string; quantity: number; unitCost: number; lineTotal: number }[] = [];
      for (const item of items) {
        if (!item.productId) return res.status(400).json({ message: "Each item must have a product." });
        if (productIds.has(item.productId)) return res.status(400).json({ message: "Duplicate product found. Each product can only appear once." });
        productIds.add(item.productId);
        const qty = parseInt(item.quantity);
        const uc = parseFloat(item.unitCost);
        if (!qty || qty <= 0) return res.status(400).json({ message: "Each item quantity must be > 0." });
        if (isNaN(uc) || uc < 0) return res.status(400).json({ message: "Each item unit cost must be >= 0." });
        parsedItems.push({ productId: item.productId, quantity: qty, unitCost: uc, lineTotal: qty * uc });
      }

      const itemsSubtotal = parsedItems.reduce((s, i) => s + i.lineTotal, 0);
      if (itemsSubtotal <= 0) return res.status(400).json({ message: "Items subtotal must be > 0." });
      const inventoryValue = itemsSubtotal + extra;

      const allocatedItems = parsedItems.map(item => {
        const allocatedExtra = itemsSubtotal > 0 ? (item.lineTotal / itemsSubtotal) * extra : 0;
        const finalUnitCost = item.quantity > 0 ? (item.lineTotal + allocatedExtra) / item.quantity : 0;
        return { ...item, allocatedExtra, finalUnitCost };
      });

      const receiptDate = new Date(date);
      if (isNaN(receiptDate.getTime())) return res.status(400).json({ message: "Invalid date." });

      const allProductIds = allocatedItems.map(i => i.productId);
      const existingProducts = await db.select().from(accountingProducts)
        .where(sql`${accountingProducts.id} IN (${sql.join(allProductIds.map(id => sql`${id}`), sql`, `)})`);
      if (existingProducts.length !== allProductIds.length) {
        const found = new Set(existingProducts.map(p => p.id));
        const missing = allProductIds.filter(id => !found.has(id));
        return res.status(404).json({ message: `Product(s) not found: ${missing.join(", ")}` });
      }
      const productMap = new Map(existingProducts.map(p => [p.id, p]));

      const result = await db.transaction(async (tx) => {
        const [receipt] = await tx.insert(stockReceipts).values({
          merchantId, supplierId, paymentType: pType,
          cashAccountId: pType === "PAID_NOW" ? cashAccountId : null,
          extraCosts: extra.toFixed(2),
          itemsSubtotal: itemsSubtotal.toFixed(2),
          inventoryValue: inventoryValue.toFixed(2),
          description: description || null,
          date: receiptDate,
        }).returning();

        const stockUpdates: { productName: string; oldQty: number; newQty: number; oldAvg: number; newAvg: number }[] = [];
        const productNames: string[] = [];

        for (const item of allocatedItems) {
          await tx.insert(stockReceiptItems).values({
            stockReceiptId: receipt.id,
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost.toFixed(2),
            lineTotal: item.lineTotal.toFixed(2),
            allocatedExtra: item.allocatedExtra.toFixed(2),
            finalUnitCost: item.finalUnitCost.toFixed(2),
          });

          const product = productMap.get(item.productId)!;
          productNames.push(product.name);
          const oldQty = product.stockQty;
          const oldAvg = parseFloat(product.avgUnitCost);
          const landedItemTotal = item.lineTotal + item.allocatedExtra;
          const newQty = oldQty + item.quantity;
          const newAvg = newQty > 0 ? ((oldQty * oldAvg) + landedItemTotal) / newQty : item.finalUnitCost;

          await tx.update(accountingProducts).set({
            stockQty: newQty, avgUnitCost: newAvg.toFixed(2), updatedAt: new Date(),
          }).where(eq(accountingProducts.id, item.productId));

          stockUpdates.push({ productName: product.name, oldQty, newQty, oldAvg, newAvg });
        }

        const currentSupplierBal = parseFloat(await getOrCreatePartyBalance(merchantId, supplierId));
        const newSupplierBal = currentSupplierBal + inventoryValue;
        await tx.update(partyBalances).set({ balance: newSupplierBal.toFixed(2), updatedAt: new Date() })
          .where(and(eq(partyBalances.merchantId, merchantId), eq(partyBalances.partyId, supplierId)));

        await tx.insert(ledgerEntries).values({
          merchantId, date: receiptDate,
          description: `Stock receipt: ${productNames.join(", ")}`,
          debitAccount: `inventory:multi`, creditAccount: `payable:${supplierId}`,
          amount: inventoryValue.toFixed(2), referenceType: "stock_receipt", referenceId: receipt.id,
        });

        if (pType === "PAID_NOW") {
          const settledBal = newSupplierBal - inventoryValue;
          await tx.update(partyBalances).set({ balance: settledBal.toFixed(2), updatedAt: new Date() })
            .where(and(eq(partyBalances.merchantId, merchantId), eq(partyBalances.partyId, supplierId)));

          const [acct] = await tx.select().from(cashAccounts).where(eq(cashAccounts.id, cashAccountId));
          if (!acct) throw new Error("Cash account not found");
          const cashAfter = parseFloat(acct.balance) - inventoryValue;
          await tx.update(cashAccounts).set({ balance: cashAfter.toFixed(2), updatedAt: new Date() })
            .where(eq(cashAccounts.id, cashAccountId));

          await tx.insert(cashMovements).values({
            merchantId, cashAccountId, type: "out", amount: inventoryValue.toFixed(2),
            relatedReceiptId: receipt.id, description: `Stock purchase: ${productNames.join(", ")}`,
            date: receiptDate,
          });

          await tx.insert(ledgerEntries).values({
            merchantId, date: receiptDate,
            description: `Payment for stock receipt: ${productNames.join(", ")}`,
            debitAccount: `payable:${supplierId}`, creditAccount: `cash:${cashAccountId}`,
            amount: inventoryValue.toFixed(2), referenceType: "stock_receipt", referenceId: receipt.id,
          });
        }

        await tx.insert(accountingAuditLog).values({
          merchantId, eventType: "STOCK_RECEIPT", entityType: "stock_receipt", entityId: receipt.id,
          description: `Stock receipt: ${allocatedItems.length} items, subtotal=${itemsSubtotal}, extra=${extra}, total=${inventoryValue}, ${pType}`,
          balancesBefore: null, balancesAfter: { stockUpdates }, actorUserId: req.user?.id,
        });

        return { receipt, items: allocatedItems, stockUpdates, productNames };
      });

      res.json({ receipt: result.receipt, items: result.items, stockUpdates: result.stockUpdates });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== SALES: CREATE DRAFT ==========
  app.post("/api/accounting/sales", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { customerId, items, payments, paymentMode, date, notes, referenceId } = req.body;

      const saleDate = date ? new Date(date) : new Date();
      let total = 0;
      if (items && Array.isArray(items)) {
        for (const item of items) {
          const qty = parseInt(item.quantity) || 0;
          const price = parseFloat(item.unitPrice) || 0;
          total += qty * price;
        }
      }
      let paidNowAmt = 0;
      if (paymentMode === "RECEIVE_NOW" && payments && Array.isArray(payments)) {
        for (const p of payments) paidNowAmt += parseFloat(p.amount) || 0;
      }
      const remainingAmt = total - paidNowAmt;

      const [sale] = await db.insert(sales).values({
        merchantId, customerId: customerId || null,
        status: "DRAFT", total: total.toFixed(2),
        paidNow: paidNowAmt.toFixed(2), remaining: remainingAmt.toFixed(2),
        paymentMode: paymentMode || "RECEIVE_NOW",
        referenceId: referenceId || null,
        date: saleDate, notes: notes || null,
      }).returning();

      if (items && Array.isArray(items)) {
        for (const item of items) {
          if (!item.productId) continue;
          const qty = parseInt(item.quantity) || 0;
          const price = parseFloat(item.unitPrice) || 0;
          const lineTotal = qty * price;
          await db.insert(saleItems).values({
            saleId: sale.id, productId: item.productId,
            quantity: qty, unitPrice: price.toFixed(2), lineTotal: lineTotal.toFixed(2),
          });
        }
      }

      if (paymentMode === "RECEIVE_NOW" && payments && Array.isArray(payments)) {
        for (const p of payments) {
          if (!p.cashAccountId || !p.amount) continue;
          await db.insert(salePayments).values({
            saleId: sale.id, cashAccountId: p.cashAccountId,
            amount: (parseFloat(p.amount) || 0).toFixed(2),
          });
        }
      }

      res.json({ sale });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== SALES: AUTOSAVE DRAFT ==========
  app.patch("/api/accounting/sales/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const saleId = req.params.id;
      const [existing] = await db.select().from(sales)
        .where(and(eq(sales.id, saleId), eq(sales.merchantId, merchantId)));
      if (!existing) return res.status(404).json({ message: "Sale not found" });

      const isEditable = existing.status === "DRAFT" ||
        (existing.status === "COMPLETED" && existing.completedAt &&
          (Date.now() - new Date(existing.completedAt).getTime()) < 2 * 60 * 1000);
      if (!isEditable) return res.status(400).json({ message: "Sale cannot be edited" });

      const { customerId, items, payments, paymentMode, date, notes, referenceId } = req.body;

      let total = 0;
      if (items && Array.isArray(items)) {
        for (const item of items) {
          total += (parseInt(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
        }
      }
      let paidNowAmt = 0;
      if (paymentMode === "RECEIVE_NOW" && payments && Array.isArray(payments)) {
        for (const p of payments) paidNowAmt += parseFloat(p.amount) || 0;
      }

      await db.update(sales).set({
        customerId: customerId || null,
        total: total.toFixed(2),
        paidNow: paidNowAmt.toFixed(2),
        remaining: (total - paidNowAmt).toFixed(2),
        paymentMode: paymentMode || "RECEIVE_NOW",
        referenceId: referenceId || null,
        date: date ? new Date(date) : existing.date,
        notes: notes || null,
        updatedAt: new Date(),
      }).where(eq(sales.id, saleId));

      await db.delete(saleItems).where(eq(saleItems.saleId, saleId));
      if (items && Array.isArray(items)) {
        for (const item of items) {
          if (!item.productId) continue;
          const qty = parseInt(item.quantity) || 0;
          const price = parseFloat(item.unitPrice) || 0;
          await db.insert(saleItems).values({
            saleId, productId: item.productId,
            quantity: qty, unitPrice: price.toFixed(2), lineTotal: (qty * price).toFixed(2),
          });
        }
      }

      await db.delete(salePayments).where(eq(salePayments.saleId, saleId));
      if (paymentMode === "RECEIVE_NOW" && payments && Array.isArray(payments)) {
        for (const p of payments) {
          if (!p.cashAccountId || !p.amount) continue;
          await db.insert(salePayments).values({
            saleId, cashAccountId: p.cashAccountId,
            amount: (parseFloat(p.amount) || 0).toFixed(2),
          });
        }
      }

      const [updated] = await db.select().from(sales).where(eq(sales.id, saleId));
      res.json({ sale: updated });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== SALES: COMPLETE ==========
  app.post("/api/accounting/sales/:id/complete", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const saleId = req.params.id;
      const [sale] = await db.select().from(sales)
        .where(and(eq(sales.id, saleId), eq(sales.merchantId, merchantId)));
      if (!sale) return res.status(404).json({ message: "Sale not found" });
      if (sale.status !== "DRAFT") return res.status(400).json({ message: "Only draft sales can be completed" });

      const items = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId));
      if (items.length === 0) return res.status(400).json({ message: "Sale must have at least one item" });

      const total = parseFloat(sale.total);
      if (total <= 0) return res.status(400).json({ message: "Sale total must be greater than zero" });

      const pmts = await db.select().from(salePayments).where(eq(salePayments.saleId, saleId));
      const paidNow = pmts.reduce((s, p) => s + parseFloat(p.amount), 0);

      if (sale.paymentMode === "RECEIVE_NOW") {
        if (pmts.length === 0) return res.status(400).json({ message: "At least one payment line is required" });
        if (paidNow > total + 0.01) return res.status(400).json({ message: "Paid amount cannot exceed total" });
      }

      const remaining = total - paidNow;

      await db.transaction(async (tx) => {
        let totalCogs = 0;
        const itemDescriptions: string[] = [];

        for (const item of items) {
          const [product] = await tx.select().from(accountingProducts)
            .where(eq(accountingProducts.id, item.productId));
          if (!product) throw new Error(`Product not found: ${item.productId}`);
          if (product.stockQty < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);

          const avgCost = parseFloat(product.avgUnitCost);
          const itemCogs = item.quantity * avgCost;
          totalCogs += itemCogs;

          await tx.update(saleItems).set({
            cogsPerUnit: avgCost.toFixed(2),
            cogsTotal: itemCogs.toFixed(2),
          }).where(eq(saleItems.id, item.id));

          const newQty = product.stockQty - item.quantity;
          await tx.update(accountingProducts).set({
            stockQty: newQty, updatedAt: new Date(),
          }).where(eq(accountingProducts.id, item.productId));

          itemDescriptions.push(`${product.name} x${item.quantity}`);

          await createLedgerEntry(merchantId, sale.date, `COGS: ${product.name} x${item.quantity}`,
            `cogs:sales`, `inventory:${item.productId}`, itemCogs, "cogs", saleId);
        }

        const grossProfit = total - totalCogs;

        await tx.update(sales).set({
          status: "COMPLETED",
          cogsTotal: totalCogs.toFixed(2),
          grossProfit: grossProfit.toFixed(2),
          paidNow: paidNow.toFixed(2),
          remaining: remaining.toFixed(2),
          completedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(sales.id, saleId));

        await createLedgerEntry(merchantId, sale.date,
          `Sale: ${itemDescriptions.join(", ")}`,
          remaining > 0 ? `receivable:${sale.customerId}` : `cash:split`,
          `revenue:sales`, total, "sale", saleId);

        for (const pmt of pmts) {
          const acctDelta = await updateCashAccountBalance(pmt.cashAccountId, parseFloat(pmt.amount));
          await tx.insert(cashMovements).values({
            merchantId, cashAccountId: pmt.cashAccountId,
            type: "in", amount: pmt.amount,
            balanceAfter: acctDelta.after.toFixed(2),
            partyId: sale.customerId,
            relatedSaleId: saleId,
            description: `Sale payment: ${itemDescriptions.join(", ")}`,
            date: sale.date,
          });
        }

        if (remaining > 0 && sale.customerId) {
          await updatePartyBalance(merchantId, sale.customerId, remaining);

          await createLedgerEntry(merchantId, sale.date,
            `Customer receivable: ${itemDescriptions.join(", ")}`,
            `receivable:${sale.customerId}`, `cash:deferred`, remaining, "sale_receivable", saleId);
        }

        await createAuditEntry(merchantId, "SALE_COMPLETE", "sale", saleId,
          `Completed sale: ${itemDescriptions.join(", ")}. Total: ${total}, Paid: ${paidNow}, Remaining: ${remaining}`,
          {}, { total, paidNow, remaining, cogs: totalCogs, profit: grossProfit },
          req.user?.id);
      });

      const [updated] = await db.select().from(sales).where(eq(sales.id, saleId));
      res.json({ sale: updated });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== SALES: REVERSE ==========
  app.post("/api/accounting/sales/:id/reverse", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const saleId = req.params.id;
      const [sale] = await db.select().from(sales)
        .where(and(eq(sales.id, saleId), eq(sales.merchantId, merchantId)));
      if (!sale) return res.status(404).json({ message: "Sale not found" });
      if (sale.status !== "COMPLETED") return res.status(400).json({ message: "Only completed sales can be reversed" });

      const items = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId));
      const pmts = await db.select().from(salePayments).where(eq(salePayments.saleId, saleId));
      const total = parseFloat(sale.total);
      const paidNow = parseFloat(sale.paidNow);
      const remaining = parseFloat(sale.remaining);

      await db.transaction(async (tx) => {
        for (const item of items) {
          const [product] = await tx.select().from(accountingProducts)
            .where(eq(accountingProducts.id, item.productId));
          if (product) {
            const newQty = product.stockQty + item.quantity;
            await tx.update(accountingProducts).set({
              stockQty: newQty, updatedAt: new Date(),
            }).where(eq(accountingProducts.id, item.productId));
          }
        }

        for (const pmt of pmts) {
          const amt = parseFloat(pmt.amount);
          const acctDelta = await updateCashAccountBalance(pmt.cashAccountId, -amt);
          await tx.insert(cashMovements).values({
            merchantId, cashAccountId: pmt.cashAccountId,
            type: "out", amount: pmt.amount,
            balanceAfter: acctDelta.after.toFixed(2),
            partyId: sale.customerId,
            relatedSaleId: saleId,
            description: `Reversal of sale`,
            date: new Date(),
          });
        }

        if (remaining > 0 && sale.customerId) {
          await updatePartyBalance(merchantId, sale.customerId, -remaining);
        }

        await createLedgerEntry(merchantId, new Date(), `REVERSAL: Sale #${saleId}`,
          `revenue:sales`, `cash:reversal`, total, "sale_reversal", saleId);

        await tx.update(sales).set({
          status: "REVERSED", reversedAt: new Date(), updatedAt: new Date(),
        }).where(eq(sales.id, saleId));

        await createAuditEntry(merchantId, "SALE_REVERSE", "sale", saleId,
          `Reversed sale. Total: ${total}, refunded: ${paidNow}, receivable cleared: ${remaining}`,
          {}, { reversed: true }, req.user?.id);
      });

      const [updated] = await db.select().from(sales).where(eq(sales.id, saleId));
      res.json({ sale: updated });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== SALES: DUPLICATE ==========
  app.post("/api/accounting/sales/:id/duplicate", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const saleId = req.params.id;
      const [sale] = await db.select().from(sales)
        .where(and(eq(sales.id, saleId), eq(sales.merchantId, merchantId)));
      if (!sale) return res.status(404).json({ message: "Sale not found" });

      const items = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId));
      const pmts = await db.select().from(salePayments).where(eq(salePayments.saleId, saleId));

      const [newSale] = await db.insert(sales).values({
        merchantId, customerId: sale.customerId,
        status: "DRAFT", total: sale.total,
        paidNow: sale.paidNow, remaining: sale.remaining,
        paymentMode: sale.paymentMode,
        date: new Date(), notes: sale.notes,
      }).returning();

      for (const item of items) {
        await db.insert(saleItems).values({
          saleId: newSale.id, productId: item.productId,
          quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal,
        });
      }

      for (const pmt of pmts) {
        await db.insert(salePayments).values({
          saleId: newSale.id, cashAccountId: pmt.cashAccountId, amount: pmt.amount,
        });
      }

      res.json({ sale: newSale });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== SALES: GET SINGLE ==========
  app.get("/api/accounting/sales/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const [sale] = await db.select({
        sale: sales,
        customerName: parties.name,
      }).from(sales)
        .leftJoin(parties, eq(parties.id, sales.customerId))
        .where(and(eq(sales.id, req.params.id), eq(sales.merchantId, merchantId)));
      if (!sale) return res.status(404).json({ message: "Sale not found" });

      const items = await db.select({
        item: saleItems,
        productName: accountingProducts.name,
      }).from(saleItems)
        .leftJoin(accountingProducts, eq(accountingProducts.id, saleItems.productId))
        .where(eq(saleItems.saleId, req.params.id));

      const payments = await db.select({
        payment: salePayments,
        accountName: cashAccounts.name,
      }).from(salePayments)
        .leftJoin(cashAccounts, eq(cashAccounts.id, salePayments.cashAccountId))
        .where(eq(salePayments.saleId, req.params.id));

      res.json({
        ...sale.sale,
        customerName: sale.customerName,
        items: items.map(i => ({ ...i.item, productName: i.productName })),
        payments: payments.map(p => ({ ...p.payment, accountName: p.accountName })),
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
        revenue: sql<string>`COALESCE(SUM(${sales.total}::numeric), 0)`,
        cogs: sql<string>`COALESCE(SUM(${sales.cogsTotal}::numeric), 0)`,
        profit: sql<string>`COALESCE(SUM(${sales.grossProfit}::numeric), 0)`,
      }).from(sales).where(and(...dateConditions, eq(sales.status, "COMPLETED")));

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
        revenue: sql<string>`COALESCE(SUM(${sales.total}::numeric), 0)`,
        cogs: sql<string>`COALESCE(SUM(${sales.cogsTotal}::numeric), 0)`,
      }).from(sales).where(and(dateFilter(sales), eq(sales.status, "COMPLETED")));

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
      const receipts = await db.select({
        receipt: stockReceipts,
        supplierName: parties.name,
      }).from(stockReceipts)
        .leftJoin(parties, eq(parties.id, stockReceipts.supplierId))
        .where(eq(stockReceipts.merchantId, merchantId))
        .orderBy(desc(stockReceipts.date));

      const result = [];
      for (const r of receipts) {
        const items = await db.select({
          item: stockReceiptItems,
          productName: accountingProducts.name,
        }).from(stockReceiptItems)
          .leftJoin(accountingProducts, eq(accountingProducts.id, stockReceiptItems.productId))
          .where(eq(stockReceiptItems.stockReceiptId, r.receipt.id));

        result.push({
          ...r.receipt,
          supplierName: r.supplierName,
          items: items.map(i => ({ ...i.item, productName: i.productName })),
        });
      }
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========== SALES LIST (with filters) ==========
  app.get("/api/accounting/sales", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { status, customerId: filterCustomerId } = req.query;
      const conditions: any[] = [eq(sales.merchantId, merchantId)];
      if (status) conditions.push(eq(sales.status, status as string));
      if (filterCustomerId) conditions.push(eq(sales.customerId, filterCustomerId as string));

      const results = await db.select({
        sale: sales,
        customerName: parties.name,
      }).from(sales)
        .leftJoin(parties, eq(parties.id, sales.customerId))
        .where(and(...conditions))
        .orderBy(desc(sales.date));

      const salesWithItems = [];
      for (const r of results) {
        const items = await db.select({
          item: saleItems,
          productName: accountingProducts.name,
        }).from(saleItems)
          .leftJoin(accountingProducts, eq(accountingProducts.id, saleItems.productId))
          .where(eq(saleItems.saleId, r.sale.id));

        salesWithItems.push({
          ...r.sale,
          customerName: r.customerName,
          itemCount: items.length,
          itemsSummary: items.map(i => i.productName).filter(Boolean).join(", "),
        });
      }

      res.json(salesWithItems);
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