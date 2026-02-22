import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, Upload,
  Download, Search, FileSpreadsheet, AlertCircle, CheckCircle2,
} from "lucide-react";
import * as XLSX from "xlsx";

interface Product {
  id: string;
  name: string;
  sku: string;
  salePrice: string;
  unit: string;
  trackInventory: boolean;
  purchaseCost: string | null;
  category: string | null;
  barcode: string | null;
  costingMethod: string;
  stockQty: number;
  avgUnitCost: string;
  active: boolean;
  createdAt: string;
}

interface ProductFormData {
  name: string;
  sku: string;
  salePrice: string;
  unit: string;
  trackInventory: boolean;
  purchaseCost: string;
  category: string;
  barcode: string;
  costingMethod: string;
}

const emptyForm: ProductFormData = {
  name: "", sku: "", salePrice: "", unit: "pcs",
  trackInventory: true, purchaseCost: "", category: "",
  barcode: "", costingMethod: "AVERAGE",
};

function formatPKR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "Rs. 0";
  return `Rs. ${num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function AccountingProducts() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(emptyForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<any[]>([]);
  const [importParsing, setImportParsing] = useState(false);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importValidRows, setImportValidRows] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/accounting/products"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const res = await apiRequest("POST", "/api/accounting/products", {
        name: data.name,
        sku: data.sku || undefined,
        salePrice: data.salePrice,
        unit: data.unit || "pcs",
        trackInventory: data.trackInventory,
        purchaseCost: data.trackInventory && data.purchaseCost ? data.purchaseCost : undefined,
        category: data.category || undefined,
        barcode: data.barcode || undefined,
        costingMethod: data.costingMethod,
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
        salePrice: data.salePrice,
        unit: data.unit || "pcs",
        trackInventory: data.trackInventory,
        purchaseCost: data.trackInventory && data.purchaseCost ? data.purchaseCost : undefined,
        category: data.category || undefined,
        barcode: data.barcode || undefined,
        costingMethod: data.costingMethod,
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/accounting/products/${id}/deactivate`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/products"] });
      toast({
        title: data.softDeleted ? "Product deactivated" : "Product deleted",
        description: data.message,
      });
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete product", description: err.message, variant: "destructive" });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (prods: any[]) => {
      const res = await apiRequest("POST", "/api/accounting/products/bulk-import/confirm", {
        products: prods,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/products"] });
      toast({ title: `Successfully imported ${data.imported} products` });
      setImportPreviewOpen(false);
      setImportOpen(false);
      setImportRows([]);
      setImportErrors([]);
      setImportValidRows([]);
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingProduct(null);
    setFormData(emptyForm);
    setAdvancedOpen(false);
  }

  function openAddDialog() {
    setEditingProduct(null);
    setFormData(emptyForm);
    setAdvancedOpen(false);
    setDialogOpen(true);
  }

  function openEditDialog(product: Product) {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku || "",
      salePrice: product.salePrice || "0",
      unit: product.unit || "pcs",
      trackInventory: product.trackInventory !== false,
      purchaseCost: product.purchaseCost || "",
      category: product.category || "",
      barcode: product.barcode || "",
      costingMethod: product.costingMethod || "AVERAGE",
    });
    setAdvancedOpen(false);
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!formData.salePrice || parseFloat(formData.salePrice) < 0) {
      toast({ title: "Sale price must be >= 0", variant: "destructive" });
      return;
    }
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max file size is 5MB.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        let sheetName = "Products";
        if (!workbook.SheetNames.includes(sheetName)) {
          sheetName = workbook.SheetNames[0];
        }
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (rows.length === 0) {
          toast({ title: "Empty file", description: "No rows found in the file.", variant: "destructive" });
          return;
        }
        setImportRows(rows);
        parseImportRows(rows);
      } catch {
        toast({ title: "Failed to read file", description: "Make sure it's a valid CSV or Excel file.", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function parseImportRows(rows: any[]) {
    setImportParsing(true);
    try {
      const res = await apiRequest("POST", "/api/accounting/products/bulk-import/parse", { rows });
      const data = await res.json();
      setImportValidRows(data.validRows || []);
      setImportErrors(data.errors || []);
      setImportPreviewOpen(true);
    } catch (err: any) {
      toast({ title: "Parse failed", description: err.message, variant: "destructive" });
    } finally {
      setImportParsing(false);
    }
  }

  function downloadTemplate() {
    const headers = ["name", "sku", "sale_price", "unit", "track_inventory", "purchase_cost", "category", "barcode"];
    const example = ["Sample Product", "", "500", "pcs", "YES", "300", "General", ""];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "product_import_template.xlsx");
  }

  const filtered = products.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q);
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6" data-testid="accounting-products">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Products</h1>
          <p className="text-muted-foreground mt-1">Manage your product catalog with SKU tracking</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="button-bulk-import">
            <Upload className="w-4 h-4 mr-2" />
            Bulk Import
          </Button>
          <Button onClick={openAddDialog} data-testid="button-add-product">
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, SKU, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-products"
          />
        </div>
        <Badge variant="secondary" data-testid="badge-product-count">{products.length} products</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3" data-testid="table-skeleton">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground" data-testid="text-no-products">
              {searchQuery ? "No products match your search." : "No products yet. Add your first product to get started."}
            </div>
          ) : (
            <Table data-testid="table-products">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Sale Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Avg Cost</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((product) => {
                  const qty = product.stockQty || 0;
                  const avgCost = parseFloat(product.avgUnitCost || "0");
                  return (
                    <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                      <TableCell className="font-medium" data-testid={`text-product-name-${product.id}`}>
                        <div>{product.name}</div>
                        {product.barcode && <span className="text-xs text-muted-foreground">{product.barcode}</span>}
                      </TableCell>
                      <TableCell data-testid={`text-product-sku-${product.id}`}>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{product.sku}</code>
                      </TableCell>
                      <TableCell data-testid={`text-product-category-${product.id}`}>
                        {product.category || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-product-price-${product.id}`}>
                        {formatPKR(product.salePrice)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-product-qty-${product.id}`}>
                        {product.trackInventory ? qty : <span className="text-muted-foreground text-xs">N/A</span>}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-product-avgcost-${product.id}`}>
                        {product.trackInventory ? formatPKR(avgCost) : <span className="text-muted-foreground text-xs">N/A</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEditDialog(product)} data-testid={`button-edit-product-${product.id}`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(product)} data-testid={`button-delete-product-${product.id}`}>
                            <Trash2 className="w-4 h-4 text-destructive" />
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
        <DialogContent className="max-w-md" data-testid="dialog-product-form">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingProduct ? "Edit Product" : "Add Product"}
            </DialogTitle>
            <DialogDescription>
              {editingProduct ? "Update product details below." : "Fill in the required fields to add a new product."}
            </DialogDescription>
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
                placeholder="Auto-generated if empty"
                data-testid="input-product-sku"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-sale-price">Sale Price *</Label>
              <Input
                id="product-sale-price"
                type="number"
                min="0"
                step="0.01"
                value={formData.salePrice}
                onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                placeholder="0.00"
                data-testid="input-product-sale-price"
              />
            </div>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground" data-testid="button-toggle-advanced">
                  Advanced Options
                  {advancedOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="track-inventory">Track Inventory</Label>
                  <Switch
                    id="track-inventory"
                    checked={formData.trackInventory}
                    onCheckedChange={(checked) => setFormData({ ...formData, trackInventory: checked })}
                    data-testid="switch-track-inventory"
                  />
                </div>
                {formData.trackInventory && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="product-purchase-cost">Default Purchase Cost</Label>
                      <Input
                        id="product-purchase-cost"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.purchaseCost}
                        onChange={(e) => setFormData({ ...formData, purchaseCost: e.target.value })}
                        placeholder="0.00"
                        data-testid="input-product-purchase-cost"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product-costing-method">Costing Method</Label>
                      <Select value={formData.costingMethod} onValueChange={(v) => setFormData({ ...formData, costingMethod: v })}>
                        <SelectTrigger data-testid="select-costing-method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AVERAGE">Weighted Average</SelectItem>
                          <SelectItem value="FIFO">FIFO</SelectItem>
                          <SelectItem value="LIFO">LIFO</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="product-category">Category</Label>
                  <Input
                    id="product-category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g. Electronics"
                    data-testid="input-product-category"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product-barcode">Barcode</Label>
                  <Input
                    id="product-barcode"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="Optional barcode"
                    data-testid="input-product-barcode"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel">Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending} data-testid="button-submit-product">
              {isPending ? "Saving..." : editingProduct ? "Update Product" : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="dialog-delete-product">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? If this product has linked transactions, it will be deactivated instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={importOpen} onOpenChange={(open) => { if (!open) { setImportOpen(false); setImportRows([]); setImportErrors([]); } }}>
        <DialogContent className="max-w-lg" data-testid="dialog-bulk-import">
          <DialogHeader>
            <DialogTitle>Bulk Import Products</DialogTitle>
            <DialogDescription>Upload a CSV or Excel file to import multiple products at once.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate} data-testid="button-download-template">
                <Download className="w-4 h-4 mr-2" />
                Download Template
              </Button>
            </div>

            <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-2">
              <FileSpreadsheet className="w-10 h-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Upload a .csv or .xlsx file (max 5MB)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                data-testid="input-import-file"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importParsing}
                data-testid="button-upload-file"
              >
                {importParsing ? "Parsing..." : "Choose File"}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Required columns:</strong> name, sale_price</p>
              <p><strong>Optional:</strong> sku, unit, track_inventory, purchase_cost, category, barcode</p>
              <p>SKU is auto-generated if left empty. Duplicate names/SKUs are rejected.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} data-testid="button-cancel-import">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importPreviewOpen} onOpenChange={(open) => { if (!open) setImportPreviewOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-import-preview">
          <DialogHeader>
            <DialogTitle>Import Preview</DialogTitle>
            <DialogDescription>Review the parsed results before importing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium" data-testid="text-valid-count">{importValidRows.length} valid</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <span className="text-sm font-medium" data-testid="text-error-count">{importErrors.length} errors</span>
              </div>
            </div>

            {importErrors.length > 0 && (
              <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-3 space-y-1" data-testid="import-errors-list">
                <p className="text-sm font-medium text-destructive">Errors:</p>
                {importErrors.map((err: any, i: number) => (
                  <p key={i} className="text-xs text-destructive">
                    Row {err.row}: [{err.field}] {err.message}
                  </p>
                ))}
              </div>
            )}

            {importValidRows.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <Table data-testid="table-import-preview">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Sale Price</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importValidRows.map((row: any) => (
                      <TableRow key={row.row}>
                        <TableCell>{row.row}</TableCell>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">{row.sku}</code>
                          {row.autoSku && <Badge variant="outline" className="ml-1 text-[10px]">Auto</Badge>}
                        </TableCell>
                        <TableCell className="text-right">{formatPKR(row.salePrice)}</TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell>{row.category || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPreviewOpen(false)} data-testid="button-cancel-preview">
              Cancel
            </Button>
            <Button
              onClick={() => bulkImportMutation.mutate(importValidRows)}
              disabled={importValidRows.length === 0 || importErrors.length > 0 || bulkImportMutation.isPending}
              data-testid="button-confirm-import"
            >
              {bulkImportMutation.isPending ? "Importing..." : `Import ${importValidRows.length} Products`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
