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
    <div className="space-y-6" data-testid="party-balances-skeleton">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-6 space-y-3">
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
    <div className="space-y-6" data-testid="accounting-party-balances">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Party Balances
        </h1>
        <p className="text-muted-foreground mt-2">Outstanding balances with parties</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total Receivables</p>
            <p className="text-2xl font-bold mt-2 text-emerald-400" data-testid="text-total-receivables">
              {formatPKR(totalReceivables)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total Payables</p>
            <p className="text-2xl font-bold mt-2 text-red-400" data-testid="text-total-payables">
              {formatPKR(totalPayables)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-party-table">
        <CardHeader>
          <CardTitle className="text-lg">All Parties</CardTitle>
        </CardHeader>
        <CardContent>
          {parties.length > 0 ? (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Party Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parties.map((party) => {
                    const bal = parseFloat(party.balance);
                    const isPositive = bal > 0;
                    const isNegative = bal < 0;
                    return (
                      <TableRow key={party.id} data-testid={`row-party-${party.id}`}>
                        <TableCell className="font-medium">{party.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`badge-type-${party.id}`}>
                            {party.type}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${isPositive ? "text-emerald-400" : isNegative ? "text-red-400" : ""}`}>
                          {formatPKR(bal)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-parties">
              No parties found
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
