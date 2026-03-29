import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

interface Party {
  id: string;
  name: string;
  type: string;
  phone?: string | null;
  email?: string | null;
  tags?: string[] | null;
  balance?: string;
  isActive?: boolean;
}

interface PartyFormData {
  name: string;
  type: string;
  phone: string;
  email: string;
  tags: string;
}

const emptyForm: PartyFormData = {
  name: "",
  type: "customer",
  phone: "",
  email: "",
  tags: "",
};

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function getTypeBadgeVariant(type: string) {
  switch (type) {
    case "customer":
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "supplier":
      return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    case "courier":
      return "bg-violet-500/10 text-violet-400 border-violet-500/20";
    default:
      return "";
  }
}

export default function AccountingParties() {
  const { toast } = useToast();
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [formData, setFormData] = useState<PartyFormData>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: parties = [], isLoading } = useQuery<Party[]>({
    queryKey: ["/api/accounting/parties"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: PartyFormData) => {
      const body = {
        name: data.name,
        type: data.type,
        phone: data.phone || undefined,
        email: data.email || undefined,
        tags: data.tags
          ? data.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined,
      };
      await apiRequest("POST", "/api/accounting/parties", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/parties"] });
      toast({ title: "Party created successfully" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create party", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PartyFormData }) => {
      const body = {
        name: data.name,
        type: data.type,
        phone: data.phone || undefined,
        email: data.email || undefined,
        tags: data.tags
          ? data.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined,
      };
      await apiRequest("PUT", `/api/accounting/parties/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/parties"] });
      toast({ title: "Party updated successfully" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update party", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/accounting/parties/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/parties"] });
      toast({ title: "Party deleted successfully" });
      setDeleteConfirmId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete party", description: err.message, variant: "destructive" });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingParty(null);
    setFormData(emptyForm);
  }

  function openAddDialog() {
    setEditingParty(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(party: Party) {
    setEditingParty(party);
    setFormData({
      name: party.name,
      type: party.type,
      phone: party.phone || "",
      email: party.email || "",
      tags: party.tags?.join(", ") || "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (editingParty) {
      updateMutation.mutate({ id: editingParty.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  const filteredParties = parties.filter((p) => {
    const matchesType = filterType === "all" || p.type === filterType;
    const matchesSearch =
      !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const filterOptions = [
    { value: "all", label: "All" },
    { value: "customer", label: "Customer" },
    { value: "supplier", label: "Supplier" },
    { value: "courier", label: "Courier" },
  ];

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6" data-testid="accounting-parties">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Parties
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage customers, suppliers, and couriers
          </p>
        </div>
        <Button onClick={openAddDialog} data-testid="button-add-party">
          <Plus className="w-4 h-4 mr-2" />
          Add Party
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search parties by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-parties"
          />
        </div>
        <div className="flex gap-1">
          {filterOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={filterType === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType(opt.value)}
              data-testid={`button-filter-${opt.value}`}
              className="toggle-elevate"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <Card className="bg-[#0d1322] border-white/[0.08]">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredParties.length === 0 ? (
            <div className="py-12 text-center text-white/30" data-testid="text-no-parties">
              {searchQuery || filterType !== "all"
                ? "No parties match your filters"
                : "No parties yet. Add your first party to get started."}
            </div>
          ) : (
            <Table data-testid="table-parties">
              <TableHeader>
                <TableRow className="bg-white/[0.04] hover:bg-white/[0.04] border-b border-white/[0.06]">
                  <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Name</TableHead>
                  <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Phone</TableHead>
                  <TableHead className="text-right text-white/40 text-[11px] font-medium uppercase tracking-wider">Balance</TableHead>
                  <TableHead className="text-right text-white/40 text-[11px] font-medium uppercase tracking-wider">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParties.map((party) => {
                  const balance = parseFloat(party.balance || "0");
                  return (
                    <TableRow key={party.id} data-testid={`row-party-${party.id}`}>
                      <TableCell className="font-medium" data-testid={`text-party-name-${party.id}`}>
                        {party.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getTypeBadgeVariant(party.type)}
                          data-testid={`badge-party-type-${party.id}`}
                        >
                          {party.type}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-party-phone-${party.id}`}>
                        {party.phone || "-"}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-party-balance-${party.id}`}>
                        <span
                          className={
                            balance > 0
                              ? "text-emerald-400"
                              : balance < 0
                                ? "text-red-400"
                                : ""
                          }
                        >
                          {formatPKR(balance)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditDialog(party)}
                            data-testid={`button-edit-party-${party.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteConfirmId(party.id)}
                            data-testid={`button-delete-party-${party.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent data-testid="dialog-party-form">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingParty ? "Edit Party" : "Add Party"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="party-name">Name *</Label>
              <Input
                id="party-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Party name"
                data-testid="input-party-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="party-type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(val) => setFormData({ ...formData, type: val })}
              >
                <SelectTrigger data-testid="select-party-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer" data-testid="option-customer">Customer</SelectItem>
                  <SelectItem value="supplier" data-testid="option-supplier">Supplier</SelectItem>
                  <SelectItem value="courier" data-testid="option-courier">Courier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="party-phone">Phone</Label>
              <Input
                id="party-phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Phone number"
                data-testid="input-party-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="party-email">Email</Label>
              <Input
                id="party-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Email address"
                data-testid="input-party-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="party-tags">Tags (comma-separated)</Label>
              <Input
                id="party-tags"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="e.g. vip, wholesale"
                data-testid="input-party-tags"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending}
              data-testid="button-submit-party"
            >
              {isPending
                ? "Saving..."
                : editingParty
                  ? "Update Party"
                  : "Add Party"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent data-testid="dialog-delete-confirm">
          <DialogHeader>
            <DialogTitle>Delete Party</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete this party? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmId(null)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
