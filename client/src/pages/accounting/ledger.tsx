import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: string;
  referenceType?: string;
  referenceId?: string;
}

function formatPKR(amount: number): string {
  if (isNaN(amount)) return "Rs. 0";
  return `Rs. ${amount.toLocaleString()}`;
}

function PageSkeleton() {
  return (
    <div className="space-y-6" data-testid="ledger-skeleton">
      <Skeleton className="h-8 w-32" />
      <Card>
        <CardContent className="p-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccountingLedger() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set("startDate", startDate);
  if (endDate) queryParams.set("endDate", endDate);
  const queryString = queryParams.toString();
  const ledgerUrl = queryString ? `/api/accounting/ledger?${queryString}` : "/api/accounting/ledger";

  const { data, isLoading } = useQuery<LedgerEntry[]>({
    queryKey: [ledgerUrl],
  });

  const entries = data || [];

  const referenceTypes = Array.from(new Set(entries.map((e: any) => e.referenceType).filter(Boolean))) as string[];
  const filteredEntries = typeFilter === "all" ? entries : entries.filter((e) => e.referenceType === typeFilter);

  let runningBalance = 0;
  const entriesWithBalance = [...filteredEntries].reverse().map((entry) => {
    const amt = parseFloat(entry.amount);
    runningBalance += amt;
    return { ...entry, runningBalance };
  }).reverse();

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6" data-testid="accounting-ledger">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Ledger
        </h1>
        <p className="text-muted-foreground mt-2">All accounting entries</p>
      </div>

      <Card data-testid="card-filters">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="ledger-start-date">Start Date</Label>
              <Input
                id="ledger-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ledger-end-date">End Date</Label>
              <Input
                id="ledger-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
            <div className="space-y-2">
              <Label>Entry Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-44" data-testid="select-entry-type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {referenceTypes.map((t) => (
                    <SelectItem key={t} value={t!}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-ledger-table">
        <CardHeader>
          <CardTitle className="text-lg">Entries ({filteredEntries.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {entriesWithBalance.length > 0 ? (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Running Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entriesWithBalance.map((entry) => {
                    const amt = parseFloat(entry.amount);
                    return (
                      <TableRow key={entry.id} data-testid={`row-ledger-${entry.id}`}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {entry.date ? format(new Date(entry.date), "dd MMM yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.referenceType || "-"}
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate">
                          {entry.description}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatPKR(amt)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatPKR(amt)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatPKR(entry.runningBalance)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-entries">
              No ledger entries found
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
