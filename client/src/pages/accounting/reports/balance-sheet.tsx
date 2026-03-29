import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

interface BalanceSheetData {
  assets: {
    cash: number;
    receivables: number;
    inventory: number;
    total: number;
  };
  liabilities: {
    payables: number;
    total: number;
  };
  accounts: { id: string; name: string; type: string; balance: string }[];
}

function formatPKR(amount: number): string {
  if (isNaN(amount)) return "Rs. 0";
  return `Rs. ${amount.toLocaleString()}`;
}

function LineItem({ label, amount, bold, color }: { label: string; amount: number; bold?: boolean; color?: string }) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0 ${bold ? "font-semibold text-base" : "text-sm"}`}>
      <span className={color || "text-white/60"}>{label}</span>
      <span className={color || "text-white/80"} data-testid={`text-bs-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {formatPKR(amount)}
      </span>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-5 p-6" data-testid="balance-sheet-skeleton">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="bg-[#0d1322] border-white/[0.08]">
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AccountingBalanceSheet() {
  const { data, isLoading } = useQuery<BalanceSheetData>({
    queryKey: ["/api/accounting/reports/balance-sheet"],
  });

  if (isLoading) return <PageSkeleton />;

  const assets = data?.assets || { cash: 0, receivables: 0, inventory: 0, total: 0 };
  const liabilities = data?.liabilities || { payables: 0, total: 0 };
  const accounts = data?.accounts || [];
  const netWorth = assets.total - liabilities.total;

  return (
    <div className="space-y-5 p-6" data-testid="accounting-balance-sheet">
      <div>
        <h1 className="text-2xl font-bold text-white/90 tracking-tight" data-testid="text-page-title">
          Balance Snapshot
        </h1>
        <p className="text-white/40 text-sm mt-1">Current financial position</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-[#0d1322] border-white/[0.08]" data-testid="card-assets">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {accounts.map((acct) => (
                <LineItem key={acct.id} label={acct.name} amount={parseFloat(acct.balance)} />
              ))}
              {accounts.length > 0 && <Separator className="my-2 bg-white/[0.08]" />}
              <LineItem label="Total Cash" amount={assets.cash} bold />
              <LineItem label="Inventory" amount={assets.inventory} />
              <LineItem label="Receivables" amount={assets.receivables} />
              <Separator className="my-2 bg-white/[0.08]" />
              <LineItem label="Total Assets" amount={assets.total} bold color="text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0d1322] border-white/[0.08]" data-testid="card-liabilities">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white/80">Liabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              <LineItem label="Payables" amount={liabilities.payables} />
              <Separator className="my-2 bg-white/[0.08]" />
              <LineItem label="Total Liabilities" amount={liabilities.total} bold color="text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#0d1322] border-white/[0.08]" data-testid="card-net-worth">
        <CardContent className="p-5">
          <LineItem
            label="Net Worth (Assets − Liabilities)"
            amount={netWorth}
            bold
            color={netWorth >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
