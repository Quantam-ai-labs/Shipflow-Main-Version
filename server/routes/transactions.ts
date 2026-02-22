import { Express, Request, Response } from "express";
import { db } from "../db";
import { eq, and, desc, asc, sql, gte, lte, or, inArray, isNull, isNotNull } from "drizzle-orm";
import {
  transactions, insertTransactionSchema,
  ledgerLines,
  parties,
  partyBalances,
  cashAccounts,
  accountingAuditLog,
  teamMembers,
} from "../../shared/schema";
import type { Transaction, LedgerLine } from "../../shared/schema";

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

const LOCK_WINDOW_MS = 2 * 60 * 1000;

function isWithinEditWindow(createdAt: Date | string | null): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  return Date.now() - created <= LOCK_WINDOW_MS;
}

async function updateAccountBalance(accountId: string, delta: number, tx: any = db) {
  await tx.update(cashAccounts)
    .set({ balance: sql`CAST(CAST(${cashAccounts.balance} AS DECIMAL(14,2)) + ${delta} AS VARCHAR)`, updatedAt: new Date() })
    .where(eq(cashAccounts.id, accountId));
}

async function updatePartyBalance(merchantId: string, partyId: string, delta: number, tx: any = db) {
  const [existing] = await tx.select().from(partyBalances)
    .where(and(eq(partyBalances.merchantId, merchantId), eq(partyBalances.partyId, partyId)));
  if (existing) {
    const newBal = (parseFloat(existing.balance) + delta).toFixed(2);
    await tx.update(partyBalances)
      .set({ balance: newBal, updatedAt: new Date() })
      .where(eq(partyBalances.id, existing.id));
  } else {
    await tx.insert(partyBalances).values({
      merchantId, partyId, balance: delta.toFixed(2),
    });
  }
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  ledgerEntries: { entityType: string; entityId: string; direction: string; amount: number }[];
}

function validateTransaction(data: any): ValidationResult {
  const amount = parseFloat(data.amount);
  if (!amount || amount <= 0) {
    return { valid: false, error: "Amount must be greater than zero.", ledgerEntries: [] };
  }

  const { txnType, fromPartyId, toPartyId, fromAccountId, toAccountId, transferMode } = data;

  if (txnType === "MONEY_IN") {
    if (!fromPartyId) return { valid: false, error: "Money In requires a From Party.", ledgerEntries: [] };
    if (!toAccountId) return { valid: false, error: "Money In requires a To Account.", ledgerEntries: [] };
    if (fromAccountId) return { valid: false, error: "Money In must not have a From Account.", ledgerEntries: [] };
    if (toPartyId) return { valid: false, error: "Money In must not have a To Party.", ledgerEntries: [] };
    return {
      valid: true,
      ledgerEntries: [
        { entityType: "ACCOUNT", entityId: toAccountId, direction: "DEBIT", amount },
        { entityType: "PARTY", entityId: fromPartyId, direction: "CREDIT", amount },
      ],
    };
  }

  if (txnType === "MONEY_OUT") {
    if (!fromAccountId) return { valid: false, error: "Money Out requires a From Account.", ledgerEntries: [] };
    if (!toPartyId) return { valid: false, error: "Money Out requires a To Party.", ledgerEntries: [] };
    if (toAccountId) return { valid: false, error: "Money Out must not have a To Account.", ledgerEntries: [] };
    if (fromPartyId) return { valid: false, error: "Money Out must not have a From Party.", ledgerEntries: [] };
    return {
      valid: true,
      ledgerEntries: [
        { entityType: "ACCOUNT", entityId: fromAccountId, direction: "CREDIT", amount },
        { entityType: "PARTY", entityId: toPartyId, direction: "DEBIT", amount },
      ],
    };
  }

  if (txnType === "TRANSFER") {
    if (!transferMode) return { valid: false, error: "Transfer requires a transfer mode (ACCOUNT_TO_ACCOUNT or PARTY_TO_PARTY).", ledgerEntries: [] };

    if (transferMode === "ACCOUNT_TO_ACCOUNT") {
      if (!fromAccountId) return { valid: false, error: "Account transfer requires a From Account.", ledgerEntries: [] };
      if (!toAccountId) return { valid: false, error: "Account transfer requires a To Account.", ledgerEntries: [] };
      if (fromPartyId || toPartyId) return { valid: false, error: "Account transfer must not have party fields.", ledgerEntries: [] };
      if (fromAccountId === toAccountId) return { valid: false, error: "From and To accounts must be different.", ledgerEntries: [] };
      return {
        valid: true,
        ledgerEntries: [
          { entityType: "ACCOUNT", entityId: fromAccountId, direction: "CREDIT", amount },
          { entityType: "ACCOUNT", entityId: toAccountId, direction: "DEBIT", amount },
        ],
      };
    }

    if (transferMode === "PARTY_TO_PARTY") {
      if (!fromPartyId) return { valid: false, error: "Party transfer requires a From Party.", ledgerEntries: [] };
      if (!toPartyId) return { valid: false, error: "Party transfer requires a To Party.", ledgerEntries: [] };
      if (fromAccountId || toAccountId) return { valid: false, error: "Party transfer must not have account fields.", ledgerEntries: [] };
      if (fromPartyId === toPartyId) return { valid: false, error: "From and To parties must be different.", ledgerEntries: [] };
      if (!data.description || !data.description.trim()) return { valid: false, error: "Party transfer requires a description.", ledgerEntries: [] };
      return {
        valid: true,
        ledgerEntries: [
          { entityType: "PARTY", entityId: fromPartyId, direction: "CREDIT", amount },
          { entityType: "PARTY", entityId: toPartyId, direction: "DEBIT", amount },
        ],
      };
    }

    return { valid: false, error: "Invalid transfer mode. Use ACCOUNT_TO_ACCOUNT or PARTY_TO_PARTY.", ledgerEntries: [] };
  }

  return { valid: false, error: "Invalid transaction type. Use MONEY_IN, MONEY_OUT, or TRANSFER.", ledgerEntries: [] };
}

async function applyBalanceChanges(merchantId: string, entries: { entityType: string; entityId: string; direction: string; amount: number }[], tx: any = db) {
  for (const entry of entries) {
    const delta = entry.direction === "DEBIT" ? entry.amount : -entry.amount;
    if (entry.entityType === "ACCOUNT") {
      await updateAccountBalance(entry.entityId, delta, tx);
    } else {
      await updatePartyBalance(merchantId, entry.entityId, delta, tx);
    }
  }
}

async function reverseBalanceChanges(merchantId: string, entries: { entityType: string; entityId: string; direction: string; amount: number }[], tx: any = db) {
  for (const entry of entries) {
    const delta = entry.direction === "DEBIT" ? -entry.amount : entry.amount;
    if (entry.entityType === "ACCOUNT") {
      await updateAccountBalance(entry.entityId, delta, tx);
    } else {
      await updatePartyBalance(merchantId, entry.entityId, delta, tx);
    }
  }
}

export function registerTransactionRoutes(app: Express) {

  // CREATE transaction (Money In / Money Out / Transfer)
  app.post("/api/transactions", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const userId = req.session?.userId;

      const body = req.body;
      body.merchantId = merchantId;
      body.createdBy = userId;

      if (!body.date) body.date = new Date().toISOString();

      const validation = validateTransaction(body);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const txnData: any = {
        merchantId,
        txnType: body.txnType,
        transferMode: body.transferMode || null,
        category: body.category || null,
        description: body.description || null,
        referenceId: body.referenceId || null,
        amount: body.amount.toString(),
        date: new Date(body.date),
        fromPartyId: body.fromPartyId || null,
        toPartyId: body.toPartyId || null,
        fromAccountId: body.fromAccountId || null,
        toAccountId: body.toAccountId || null,
        createdBy: userId,
      };

      const result = await db.transaction(async (tx) => {
        const [txn] = await tx.insert(transactions).values(txnData).returning();

        for (const entry of validation.ledgerEntries) {
          await tx.insert(ledgerLines).values({
            transactionId: txn.id,
            entityType: entry.entityType,
            entityId: entry.entityId,
            direction: entry.direction,
            amount: entry.amount.toString(),
          });
        }

        await applyBalanceChanges(merchantId, validation.ledgerEntries, tx);

        await tx.insert(accountingAuditLog).values({
          merchantId,
          eventType: "CREATE",
          entityType: "transaction",
          entityId: txn.id,
          description: `Created ${body.txnType} transaction for ${body.amount}`,
          balancesAfter: validation.ledgerEntries as any,
          actorUserId: userId,
        });

        const lines = await tx.select().from(ledgerLines).where(eq(ledgerLines.transactionId, txn.id));
        return { ...txn, ledgerLines: lines };
      });

      res.json(result);
    } catch (e: any) {
      console.error("Error creating transaction:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // EDIT transaction (only within 2-minute window)
  app.patch("/api/transactions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const userId = req.session?.userId;
      const txnId = req.params.id;

      const [existing] = await db.select().from(transactions)
        .where(and(eq(transactions.id, txnId), eq(transactions.merchantId, merchantId)));

      if (!existing) return res.status(404).json({ message: "Transaction not found." });
      if (existing.reversalOf) return res.status(400).json({ message: "Cannot edit a reversal transaction." });
      if (existing.reversedAt) return res.status(400).json({ message: "This transaction has been reversed and cannot be edited." });
      if (!isWithinEditWindow(existing.createdAt)) {
        return res.status(400).json({ message: "This transaction is locked (past 2-minute edit window). Please reverse it instead." });
      }

      const body = { ...req.body };
      body.txnType = body.txnType || existing.txnType;
      body.amount = body.amount || existing.amount;
      body.fromPartyId = body.fromPartyId !== undefined ? body.fromPartyId : existing.fromPartyId;
      body.toPartyId = body.toPartyId !== undefined ? body.toPartyId : existing.toPartyId;
      body.fromAccountId = body.fromAccountId !== undefined ? body.fromAccountId : existing.fromAccountId;
      body.toAccountId = body.toAccountId !== undefined ? body.toAccountId : existing.toAccountId;
      body.transferMode = body.transferMode !== undefined ? body.transferMode : existing.transferMode;
      body.description = body.description !== undefined ? body.description : existing.description;

      const validation = validateTransaction(body);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const result = await db.transaction(async (tx) => {
        const oldLines = await tx.select().from(ledgerLines).where(eq(ledgerLines.transactionId, txnId));
        const oldEntries = oldLines.map(l => ({
          entityType: l.entityType, entityId: l.entityId, direction: l.direction, amount: parseFloat(l.amount),
        }));
        await reverseBalanceChanges(merchantId, oldEntries, tx);

        await tx.delete(ledgerLines).where(eq(ledgerLines.transactionId, txnId));

        const updateData: any = {
          txnType: body.txnType,
          transferMode: body.transferMode || null,
          category: body.category !== undefined ? body.category : existing.category,
          description: body.description || null,
          referenceId: body.referenceId !== undefined ? body.referenceId : existing.referenceId,
          amount: body.amount.toString(),
          date: body.date ? new Date(body.date) : existing.date,
          fromPartyId: body.fromPartyId || null,
          toPartyId: body.toPartyId || null,
          fromAccountId: body.fromAccountId || null,
          toAccountId: body.toAccountId || null,
          updatedAt: new Date(),
        };

        const [updated] = await tx.update(transactions).set(updateData)
          .where(eq(transactions.id, txnId)).returning();

        for (const entry of validation.ledgerEntries) {
          await tx.insert(ledgerLines).values({
            transactionId: txnId,
            entityType: entry.entityType,
            entityId: entry.entityId,
            direction: entry.direction,
            amount: entry.amount.toString(),
          });
        }

        await applyBalanceChanges(merchantId, validation.ledgerEntries, tx);

        await tx.insert(accountingAuditLog).values({
          merchantId,
          eventType: "EDIT",
          entityType: "transaction",
          entityId: txnId,
          description: `Edited ${body.txnType} transaction`,
          balancesBefore: { original: existing } as any,
          balancesAfter: { updated: updateData } as any,
          actorUserId: userId,
        });

        const lines = await tx.select().from(ledgerLines).where(eq(ledgerLines.transactionId, txnId));
        return { ...updated, ledgerLines: lines };
      });

      res.json(result);
    } catch (e: any) {
      console.error("Error editing transaction:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // REVERSE transaction
  app.post("/api/transactions/:id/reverse", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const userId = req.session?.userId;
      const txnId = req.params.id;

      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({ message: "Reversal reason is required." });
      }

      const [existing] = await db.select().from(transactions)
        .where(and(eq(transactions.id, txnId), eq(transactions.merchantId, merchantId)));

      if (!existing) return res.status(404).json({ message: "Transaction not found." });
      if (existing.txnType === "REVERSAL") return res.status(400).json({ message: "Cannot reverse a reversal transaction." });
      if (existing.reversedAt) return res.status(400).json({ message: "This transaction has already been reversed." });

      const result = await db.transaction(async (tx) => {
        const reversalData: any = {
          merchantId,
          txnType: "REVERSAL",
          transferMode: existing.transferMode,
          category: existing.category,
          description: `Reversal of ${existing.txnType}: ${reason}`,
          referenceId: existing.referenceId,
          amount: existing.amount,
          date: new Date(),
          fromPartyId: existing.fromPartyId,
          toPartyId: existing.toPartyId,
          fromAccountId: existing.fromAccountId,
          toAccountId: existing.toAccountId,
          createdBy: userId,
          reversalOf: existing.id,
        };

        const [reversal] = await tx.insert(transactions).values(reversalData).returning();

        const origLines = await tx.select().from(ledgerLines).where(eq(ledgerLines.transactionId, txnId));
        for (const line of origLines) {
          const invertedDirection = line.direction === "DEBIT" ? "CREDIT" : "DEBIT";
          await tx.insert(ledgerLines).values({
            transactionId: reversal.id,
            entityType: line.entityType,
            entityId: line.entityId,
            direction: invertedDirection,
            amount: line.amount,
          });
        }

        const reversalEntries = origLines.map(l => ({
          entityType: l.entityType,
          entityId: l.entityId,
          direction: l.direction === "DEBIT" ? "CREDIT" : "DEBIT",
          amount: parseFloat(l.amount),
        }));
        await applyBalanceChanges(merchantId, reversalEntries, tx);

        await tx.update(transactions).set({
          reversedBy: userId,
          reversedAt: new Date(),
          reversalReason: reason,
          updatedAt: new Date(),
        }).where(eq(transactions.id, txnId));

        await tx.insert(accountingAuditLog).values({
          merchantId,
          eventType: "REVERSE",
          entityType: "transaction",
          entityId: txnId,
          description: `Reversed transaction: ${reason}`,
          metadata: { reversalId: reversal.id } as any,
          actorUserId: userId,
        });

        const lines = await tx.select().from(ledgerLines).where(eq(ledgerLines.transactionId, reversal.id));
        return { ...reversal, ledgerLines: lines };
      });

      res.json(result);
    } catch (e: any) {
      console.error("Error reversing transaction:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // GET transactions (list with filters)
  app.get("/api/transactions", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const { type, fromDate, toDate, partyId, accountId, includeReversals, limit: lim, offset: off } = req.query;

      const conditions: any[] = [eq(transactions.merchantId, merchantId)];

      if (type) conditions.push(eq(transactions.txnType, type as string));
      if (!includeReversals || includeReversals === "false") {
        conditions.push(sql`${transactions.txnType} != 'REVERSAL'`);
        conditions.push(isNull(transactions.reversedAt));
      }
      if (fromDate) conditions.push(gte(transactions.date, new Date(fromDate as string)));
      if (toDate) conditions.push(lte(transactions.date, new Date(toDate as string)));
      if (partyId) {
        conditions.push(or(
          eq(transactions.fromPartyId, partyId as string),
          eq(transactions.toPartyId, partyId as string),
        ));
      }
      if (accountId) {
        conditions.push(or(
          eq(transactions.fromAccountId, accountId as string),
          eq(transactions.toAccountId, accountId as string),
        ));
      }

      const limit = Math.min(parseInt(lim as string) || 50, 200);
      const offset = parseInt(off as string) || 0;

      const rows = await db.select().from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(limit).offset(offset);

      const [{ value: total }] = await db.select({ value: sql<number>`COUNT(*)` }).from(transactions)
        .where(and(...conditions));

      const partyIds: string[] = [];
      const accountIds: string[] = [];
      for (const r of rows) {
        if (r.fromPartyId && !partyIds.includes(r.fromPartyId)) partyIds.push(r.fromPartyId);
        if (r.toPartyId && !partyIds.includes(r.toPartyId)) partyIds.push(r.toPartyId);
        if (r.fromAccountId && !accountIds.includes(r.fromAccountId)) accountIds.push(r.fromAccountId);
        if (r.toAccountId && !accountIds.includes(r.toAccountId)) accountIds.push(r.toAccountId);
      }

      let partyMap: Record<string, string> = {};
      if (partyIds.length > 0) {
        const partyRows = await db.select({ id: parties.id, name: parties.name }).from(parties)
          .where(inArray(parties.id, partyIds));
        for (const p of partyRows) partyMap[p.id] = p.name;
      }

      let accountMap: Record<string, string> = {};
      if (accountIds.length > 0) {
        const acctRows = await db.select({ id: cashAccounts.id, name: cashAccounts.name }).from(cashAccounts)
          .where(inArray(cashAccounts.id, accountIds));
        for (const a of acctRows) accountMap[a.id] = a.name;
      }

      const enriched = rows.map(r => ({
        ...r,
        fromPartyName: r.fromPartyId ? partyMap[r.fromPartyId] || null : null,
        toPartyName: r.toPartyId ? partyMap[r.toPartyId] || null : null,
        fromAccountName: r.fromAccountId ? accountMap[r.fromAccountId] || null : null,
        toAccountName: r.toAccountId ? accountMap[r.toAccountId] || null : null,
        isLocked: !isWithinEditWindow(r.createdAt),
      }));

      res.json({ transactions: enriched, total: Number(total) });
    } catch (e: any) {
      console.error("Error listing transactions:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // GET single transaction detail with ledger lines + audit
  app.get("/api/transactions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);
      const txnId = req.params.id;

      const [txn] = await db.select().from(transactions)
        .where(and(eq(transactions.id, txnId), eq(transactions.merchantId, merchantId)));

      if (!txn) return res.status(404).json({ message: "Transaction not found." });

      const lines = await db.select().from(ledgerLines)
        .where(eq(ledgerLines.transactionId, txnId));

      let reversal = null;
      if (txn.reversedAt) {
        const [rev] = await db.select().from(transactions)
          .where(and(eq(transactions.reversalOf, txnId), eq(transactions.merchantId, merchantId)));
        if (rev) {
          const revLines = await db.select().from(ledgerLines).where(eq(ledgerLines.transactionId, rev.id));
          reversal = { ...rev, ledgerLines: revLines };
        }
      }

      let originalTxn = null;
      if (txn.reversalOf) {
        const [orig] = await db.select().from(transactions)
          .where(and(eq(transactions.id, txn.reversalOf), eq(transactions.merchantId, merchantId)));
        if (orig) originalTxn = orig;
      }

      const audit = await db.select().from(accountingAuditLog)
        .where(and(
          eq(accountingAuditLog.merchantId, merchantId),
          eq(accountingAuditLog.entityType, "transaction"),
          eq(accountingAuditLog.entityId, txnId),
        ))
        .orderBy(desc(accountingAuditLog.createdAt));

      const partyIds = [txn.fromPartyId, txn.toPartyId].filter(Boolean) as string[];
      const accountIds = [txn.fromAccountId, txn.toAccountId].filter(Boolean) as string[];

      let partyMap: Record<string, string> = {};
      if (partyIds.length > 0) {
        const pRows = await db.select({ id: parties.id, name: parties.name }).from(parties)
          .where(inArray(parties.id, partyIds));
        for (const p of pRows) partyMap[p.id] = p.name;
      }
      let accountMap: Record<string, string> = {};
      if (accountIds.length > 0) {
        const aRows = await db.select({ id: cashAccounts.id, name: cashAccounts.name }).from(cashAccounts)
          .where(inArray(cashAccounts.id, accountIds));
        for (const a of aRows) accountMap[a.id] = a.name;
      }

      res.json({
        ...txn,
        fromPartyName: txn.fromPartyId ? partyMap[txn.fromPartyId] || null : null,
        toPartyName: txn.toPartyId ? partyMap[txn.toPartyId] || null : null,
        fromAccountName: txn.fromAccountId ? accountMap[txn.fromAccountId] || null : null,
        toAccountName: txn.toAccountId ? accountMap[txn.toAccountId] || null : null,
        isLocked: !isWithinEditWindow(txn.createdAt),
        ledgerLines: lines,
        reversal,
        originalTransaction: originalTxn,
        auditHistory: audit,
      });
    } catch (e: any) {
      console.error("Error fetching transaction detail:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // GET balances report (account + party balances net of reversals)
  app.get("/api/transactions/reports/balances", isAuthenticated, async (req: any, res) => {
    try {
      const merchantId = await getMerchantId(req);

      const accts = await db.select().from(cashAccounts)
        .where(eq(cashAccounts.merchantId, merchantId));

      const partyBals = await db.select({
        partyId: partyBalances.partyId,
        balance: partyBalances.balance,
      }).from(partyBalances).where(eq(partyBalances.merchantId, merchantId));

      const partyIds = partyBals.map(p => p.partyId);
      let partyDetails: Record<string, { name: string; type: string }> = {};
      if (partyIds.length > 0) {
        const pRows = await db.select({ id: parties.id, name: parties.name, type: parties.type }).from(parties)
          .where(inArray(parties.id, partyIds));
        for (const p of pRows) partyDetails[p.id] = { name: p.name, type: p.type };
      }

      res.json({
        accounts: accts.map(a => ({ id: a.id, name: a.name, type: a.type, balance: a.balance })),
        parties: partyBals.map(p => ({
          partyId: p.partyId,
          name: partyDetails[p.partyId]?.name || "Unknown",
          type: partyDetails[p.partyId]?.type || "other",
          balance: p.balance,
        })),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
