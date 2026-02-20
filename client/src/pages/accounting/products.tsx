import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil } from "lucide-react";

interface AccountingProduct {
  id: string;
  name: string;
  sku?: string | null;
  unit?: string;
  quantityOnHand?: number | string;
  averageCost?: number | string;
}

interface ProductFormData {
  name: string;
  sku: string;
  unit: string;
}

const emptyForm: ProductFormData = { name: "", sku: "", unit: "pcs" };

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString()}`;
}

export default function AccountingProducts() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AccountingProduct | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(emptyForm);

  const { data: products = [], isLoading } = useQuery<AccountingProduct[]>({
    queryKey: ["/api/accounting/products"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const res = await apiRequest("POST", "/api/accounting/products", {
        name: data.name,
        sku: data.sku || undefined,
        unit: data.unit || "pcs",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/products"] });
      toast({ title: "Product created successfully" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create product", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProductFormData }) => {
      const res = await apiRequest("PUT", `/api/accounting/products/${id}`, {
        name: data.name,
        sku: data.sku || undefined,
        unit: data.unit || "pcs",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/products"] });
      toast({ title: "Product updated successfully" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update product", description: err.message, variant: "destructive" });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingProduct(null);
    setFormData(emptyForm);
  }

  function openAddDialog() {
    setEditingProduct(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(product: AccountingProduct) {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku || "",
      unit: product.unit || "pcs",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6" data-testid="accounting-products">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Products
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage inventory with average cost tracking
          </p>
        </div>
        <Button onClick={openAddDialog} data-testid="button-add-product">
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3" data-testid="table-skeleton">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground" data-testid="text-no-products">
              No products yet. Add your first product to get started.
            </div>
          ) : (
            <Table data-testid="table-products">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Quantity on Hand</TableHead>
                  <TableHead className="text-right">Average Cost</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const qty = typeof product.quantityOnHand === "string" ? parseFloat(product.quantityOnHand) : (product.quantityOnHand || 0);
                  const avgCost = typeof product.averageCost === "string" ? parseFloat(product.averageCost) : (product.averageCost || 0);
                  const totalValue = qty * avgCost;
                  return (
                    <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                      <TableCell className="font-medium" data-testid={`text-product-name-${product.id}`}>
                        {product.name}
                      </TableCell>
                      <TableCell data-testid={`text-product-sku-${product.id}`}>
                        {product.sku || "-"}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-product-qty-${product.id}`}>
                        {qty}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-product-avgcost-${product.id}`}>
                        {formatPKR(avgCost)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-product-totalvalue-${product.id}`}>
                        {formatPKR(totalValue)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditDialog(product)}
                          data-testid={`button-edit-product-${product.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
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
        <DialogContent data-testid="dialog-product-form">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingProduct ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="product-name">Name *</Label>
              <Input
                id="product-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Product name"
                data-testid="input-product-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-sku">SKU</Label>
              <Input
                id="product-sku"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="Optional SKU"
                data-testid="input-product-sku"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-unit">Unit</Label>
              <Input
                id="product-unit"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="pcs"
                data-testid="input-product-unit"
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
              data-testid="button-submit-product"
            >
              {isPending ? "Saving..." : editingProduct ? "Update Product" : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
