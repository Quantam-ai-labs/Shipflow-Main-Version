import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { exportCsvWithDate } from "@/lib/exportCsv";

interface TrialBalanceEntry {
  account: string;
  debit: number;
  credit: number;
  net: number;
}

interface TrialBalanceData {
  entries: TrialBalanceEntry[];
  totalDebits: number;
  totalCredits: number;
}

function formatPKR(amount: number): string {
  if (isNaN(amount)) return "Rs. 0";
  return `Rs. ${amount.toLocaleString()}`;
}

function PageSkeleton() {
  return (
    <div className="space-y-6" data-testid="trial-balance-skeleton">
      <Skeleton className="h-8 w-48" />
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

export default function AccountingTrialBalance() {
  const { data, isLoading } = useQuery<TrialBalanceData>({
    queryKey: ["/api/accounting/trial-balance"],
  });

  if (isLoading) return <PageSkeleton />;

  const entries = data?.entries || [];
  const totalDebits = data?.totalDebits || 0;
  const totalCredits = data?.totalCredits || 0;
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  return (
    <div className="space-y-6" data-testid="accounting-trial-balance">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Trial Balance
          </h1>
          <p className="text-muted-foreground mt-2">
            Debit and credit totals by account
            {isBalanced && entries.length > 0 && (
              <span className="ml-2 text-emerald-400 font-medium">- Balanced</span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          data-testid="button-export-trial-balance"
          disabled={entries.length === 0}
          onClick={() => {
            exportCsvWithDate(
              "trial-balance",
              ["Account", "Debit Total", "Credit Total"],
              [
                ...entries.map((entry) => [
                  entry.account,
                  String(entry.debit),
                  String(entry.credit),
                ]),
                ["Totals", String(totalDebits), String(totalCredits)],
              ],
            );
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      <Card data-testid="card-trial-balance-table">
        <CardHeader>
          <CardTitle className="text-lg">Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length > 0 ? (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debit Total</TableHead>
                    <TableHead className="text-right">Credit Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, idx) => (
                    <TableRow key={idx} data-testid={`row-trial-${idx}`}>
                      <TableCell className="font-medium">{entry.account}</TableCell>
                      <TableCell className="text-right">{formatPKR(entry.debit)}</TableCell>
                      <TableCell className="text-right">{formatPKR(entry.credit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow data-testid="row-trial-totals">
                    <TableCell className="font-bold">Totals</TableCell>
                    <TableCell className="text-right font-bold" data-testid="text-total-debits">
                      {formatPKR(totalDebits)}
                    </TableCell>
                    <TableCell className="text-right font-bold" data-testid="text-total-credits">
                      {formatPKR(totalCredits)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-entries">
              No ledger entries to generate trial balance
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
