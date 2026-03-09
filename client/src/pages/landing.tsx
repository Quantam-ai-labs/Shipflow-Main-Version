import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  Truck,
  BarChart3,
  ShieldCheck,
  Zap,
  Globe,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                <Package className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl">1SOL.AI</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
                Features
              </a>
              <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
                How it Works
              </a>
              <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
                Pricing
              </a>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <a href="/api/login">
                <Button data-testid="button-login">
                  Get Started
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <Badge variant="secondary" className="px-4 py-1.5">
                  <Zap className="w-3 h-3 mr-1" />
                  Built for Pakistani Merchants
                </Badge>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
                  Streamline Your
                  <span className="text-primary"> Logistics Operations</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-xl">
                  All-in-one platform for Shopify merchants to sync orders, track shipments across multiple couriers, and reconcile COD payments effortlessly.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <a href="/api/login">
                  <Button size="lg" className="w-full sm:w-auto" data-testid="button-hero-cta">
                    Start Free Trial
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </a>
                <Button size="lg" variant="outline" className="w-full sm:w-auto" data-testid="button-demo">
                  Watch Demo
                </Button>
              </div>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Free forever plan</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>No credit card required</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <Card className="relative border">
                <CardContent className="p-0">
                  <div className="bg-muted/50 p-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-background rounded-lg border">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Package className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">Order 1247</p>
                            <p className="text-xs text-muted-foreground">Karachi → Lahore</p>
                          </div>
                        </div>
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                          Delivered
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-background rounded-lg border">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                            <Truck className="w-5 h-5 text-amber-500" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">Order 1248</p>
                            <p className="text-xs text-muted-foreground">Islamabad → Peshawar</p>
                          </div>
                        </div>
                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                          In Transit
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-background rounded-lg border">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <Package className="w-5 h-5 text-blue-500" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">Order 1249</p>
                            <p className="text-xs text-muted-foreground">Faisalabad → Multan</p>
                          </div>
                        </div>
                        <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                          Processing
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">Features</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Everything You Need to Manage Logistics
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From order syncing to COD reconciliation, we've got you covered with powerful tools built specifically for Pakistani e-commerce.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Package className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Shopify Sync</h3>
                <p className="text-muted-foreground text-sm">
                  Automatically sync orders from your Shopify store. No manual imports, real-time updates via webhooks.
                </p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Truck className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Multi-Courier Tracking</h3>
                <p className="text-muted-foreground text-sm">
                  Track shipments across Leopards, PostEx, and more. One dashboard for all your couriers.
                </p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Analytics Dashboard</h3>
                <p className="text-muted-foreground text-sm">
                  Insights by courier performance, city-wise breakdown, and delivery success rates.
                </p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">COD Reconciliation</h3>
                <p className="text-muted-foreground text-sm">
                  Match courier payments with orders. Never miss a COD payment again with automated tracking.
                </p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Globe className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Multi-Tenant</h3>
                <p className="text-muted-foreground text-sm">
                  Manage multiple stores and team members. Role-based access for admins, managers, and agents.
                </p>
              </CardContent>
            </Card>
            <Card className="hover-elevate">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Real-Time Updates</h3>
                <p className="text-muted-foreground text-sm">
                  Webhooks and scheduled syncs keep your data fresh. Always know the latest status.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">How it Works</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Connect your store, configure your couriers, and start managing orders like a pro.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary">1</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Connect Shopify</h3>
              <p className="text-muted-foreground text-sm">
                One-click OAuth integration. No API keys to copy, just authorize and go.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary">2</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Add Couriers</h3>
              <p className="text-muted-foreground text-sm">
                Connect Leopards, PostEx, or other couriers with your account credentials.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-primary">3</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Start Shipping</h3>
              <p className="text-muted-foreground text-sm">
                Manage orders, track shipments, and reconcile payments from one dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">
            Ready to Streamline Your Logistics?
          </h2>
          <p className="text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Join hundreds of Pakistani merchants who trust 1SOL.AI for their e-commerce operations.
          </p>
          <a href="/api/login">
            <Button size="lg" variant="secondary" data-testid="button-cta-bottom">
              Get Started Free
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                <Package className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl">1SOL.AI</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} 1SOL.AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
