import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface PartyBalance {
  id: string;
  name: string;
  type: string;
  balance: string;
}

function formatPKR(amount: number): string {
  if (isNaN(amount)) return "Rs. 0";
  return `Rs. ${amount.toLocaleString()}`;
}

function PageSkeleton() {
  return (
    <div className="space-y-5 p-6" data-testid="party-balances-skeleton">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="bg-[#0d1322] border-white/[0.08]">
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-[#0d1322] border-white/[0.08]">
        <CardContent className="p-5 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccountingPartyBalances() {
  const { data, isLoading } = useQuery<PartyBalance[]>({
    queryKey: ["/api/accounting/reports/party-balances"],
  });

  if (isLoading) return <PageSkeleton />;

  const parties = data || [];
  const totalReceivables = parties.reduce((sum, p) => {
    const bal = parseFloat(p.balance);
    return bal > 0 ? sum + bal : sum;
  }, 0);
  const totalPayables = parties.reduce((sum, p) => {
    const bal = parseFloat(p.balance);
    return bal < 0 ? sum + Math.abs(bal) : sum;
  }, 0);

  return (
    <div className="space-y-5 p-6" data-testid="accounting-party-balances">
      <div>
        <h1 className="text-2xl font-bold text-white/90 tracking-tight" data-testid="text-page-title">
          Party Balances
        </h1>
        <p className="text-white/40 text-sm mt-1">Outstanding balances with parties</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-[#0d1322] border-emerald-500/20">
          <CardContent className="p-5">
            <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Total Receivables</p>
            <p className="text-2xl font-bold mt-1 text-emerald-400" data-testid="text-total-receivables">
              {formatPKR(totalReceivables)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#0d1322] border-red-500/20">
          <CardContent className="p-5">
            <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Total Payables</p>
            <p className="text-2xl font-bold mt-1 text-red-400" data-testid="text-total-payables">
              {formatPKR(totalPayables)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#0d1322] border-white/[0.08]" data-testid="card-party-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-white/80">All Parties</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {parties.length > 0 ? (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-white/[0.04] hover:bg-white/[0.04] border-b border-white/[0.06]">
                    <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Party Name</TableHead>
                    <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Type</TableHead>
                    <TableHead className="text-right text-white/40 text-[11px] font-medium uppercase tracking-wider">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parties.map((party) => {
                    const bal = parseFloat(party.balance);
                    const isPositive = bal > 0;
                    const isNegative = bal < 0;
                    return (
                      <TableRow key={party.id} className="hover:bg-blue-500/[0.06] border-b border-white/[0.04]" data-testid={`row-party-${party.id}`}>
                        <TableCell className="font-medium text-white/80">{party.name}</TableCell>
                        <TableCell>
                          <Badge className="bg-white/[0.04] text-white/50 border border-white/[0.08] text-xs" data-testid={`badge-type-${party.id}`}>
                            {party.type}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${isPositive ? "text-emerald-400" : isNegative ? "text-red-400" : "text-white/60"}`}>
                          {formatPKR(bal)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-white/30 py-8 text-sm" data-testid="text-no-parties">
              No parties found
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
