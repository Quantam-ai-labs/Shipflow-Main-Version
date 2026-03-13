import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Package, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background" data-testid="terms-of-service-page">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer">
                <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="font-bold text-xl">1SOL.AI</span>
              </div>
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link href="/">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-16 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 12, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
            <p className="text-sm leading-relaxed">
              By accessing or using the 1SOL.AI platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Service. These Terms constitute a legally binding agreement between you and 1SOL.AI.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">2. Description of Service</h2>
            <p className="text-sm leading-relaxed">
              1SOL.AI provides a comprehensive logistics, marketing, and business management platform for e-commerce merchants in Pakistan. Our services include:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Shopify store integration and order synchronization</li>
              <li>Multi-courier shipment booking and tracking (Leopards, PostEx, TCS)</li>
              <li>WhatsApp and RoboCall-based order confirmation automation</li>
              <li>Facebook/Instagram advertising campaign management via Meta API</li>
              <li>COD reconciliation and financial accounting</li>
              <li>AI-powered business analytics and insights</li>
              <li>Team collaboration with role-based access control</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">3. Account Registration & Eligibility</h2>
            <p className="text-sm leading-relaxed">
              You must be at least 18 years old and have a valid business registration (or operate as a sole proprietor) in Pakistan to use the Service. You must provide accurate and complete information when creating an account. You are responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Ensuring that team members added to your account comply with these Terms</li>
              <li>Keeping your contact and business information up to date</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">4. Subscription & Payment</h2>
            <p className="text-sm leading-relaxed">
              1SOL.AI offers Free, Pro, and Enterprise subscription tiers. Paid subscriptions are billed monthly or annually in Pakistani Rupees (PKR). By subscribing to a paid plan, you agree to:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Pay all fees associated with your selected plan</li>
              <li>Automatic renewal unless cancelled before the billing cycle ends</li>
              <li>Price changes communicated at least 30 days in advance</li>
              <li>No refunds for partial months/periods upon cancellation</li>
            </ul>
            <p className="text-sm leading-relaxed">
              Third-party costs (WhatsApp message fees, Meta ad spend, courier booking fees) are separate from subscription fees and are your responsibility.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">5. Third-Party Integrations</h2>
            <p className="text-sm leading-relaxed">
              The Service integrates with third-party platforms including Shopify, Meta (Facebook/Instagram), WhatsApp Business API, and various courier services. Your use of these integrations is subject to the respective third-party terms of service. By connecting these services, you authorize 1SOL.AI to:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Access and manage your accounts on these platforms as necessary to provide the Service</li>
              <li>Store authentication tokens securely for ongoing service delivery</li>
              <li>Send messages and create content on your behalf through connected platforms</li>
              <li>Access reporting data for analytics and reconciliation purposes</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">6. Acceptable Use</h2>
            <p className="text-sm leading-relaxed">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Use the Service for any unlawful purpose or in violation of Pakistani law</li>
              <li>Send spam or unsolicited messages through WhatsApp or RoboCall features</li>
              <li>Violate any applicable advertising policies (Meta, WhatsApp, etc.)</li>
              <li>Attempt to gain unauthorized access to any part of the Service or other users' data</li>
              <li>Interfere with the proper working of the Service or its infrastructure</li>
              <li>Use the AI features to generate harmful, misleading, or illegal content</li>
              <li>Resell or redistribute the Service without written authorization</li>
              <li>Use automated scripts or bots to access the Service outside of authorized APIs</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">7. Data Ownership & Intellectual Property</h2>
            <p className="text-sm leading-relaxed">
              You retain ownership of all your business data, including orders, customer information, and financial records. 1SOL.AI retains ownership of the platform, its software, algorithms, and intellectual property. You grant us a limited license to process your data solely for the purpose of providing the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">8. Service Availability & Modifications</h2>
            <p className="text-sm leading-relaxed">
              We strive for high availability but do not guarantee uninterrupted service. We reserve the right to modify, suspend, or discontinue features with reasonable notice. Planned maintenance will be communicated in advance when possible.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">9. Limitation of Liability</h2>
            <p className="text-sm leading-relaxed">
              The Service is provided "as is" without warranties of any kind, express or implied. 1SOL.AI shall not be liable for:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Any indirect, incidental, special, or consequential damages</li>
              <li>Losses resulting from third-party service disruptions (Shopify, Meta, couriers)</li>
              <li>Failed order confirmations, missed deliveries, or incorrect tracking data from courier APIs</li>
              <li>Ad campaign performance or Meta ad policy violations</li>
              <li>Financial losses arising from COD reconciliation discrepancies</li>
            </ul>
            <p className="text-sm leading-relaxed">
              Our total liability shall not exceed the amount paid by you for the Service in the 12 months preceding the claim.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">10. Termination</h2>
            <p className="text-sm leading-relaxed">
              We may terminate or suspend your access to the Service at any time for violation of these Terms, non-payment, or abuse. You may discontinue use of the Service and request deletion of your account at any time. Upon termination:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Your data will be retained for 30 days, after which it will be permanently deleted</li>
              <li>All connected third-party integrations will be disconnected</li>
              <li>No refunds will be issued for the remaining subscription period</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">11. Governing Law & Dispute Resolution</h2>
            <p className="text-sm leading-relaxed">
              These Terms are governed by the laws of Pakistan. Any disputes arising from or related to these Terms shall be resolved through arbitration in Lahore, Pakistan, in accordance with the Arbitration Act 1940. If arbitration is not feasible, disputes shall be subject to the exclusive jurisdiction of courts in Lahore.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">12. Changes to Terms</h2>
            <p className="text-sm leading-relaxed">
              We may update these Terms from time to time. Material changes will be communicated via email or platform notification at least 30 days before taking effect. Continued use of the Service after changes constitutes acceptance.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">13. Contact</h2>
            <p className="text-sm leading-relaxed">
              For questions about these Terms of Service, contact us at: <strong>usamax.mail@gmail.com</strong> or visit our <Link href="/contact"><span className="text-primary cursor-pointer hover:underline">Contact</span></Link> page.
            </p>
          </section>
        </div>
      </div>

      <footer className="py-8 border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} 1SOL.AI</p>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/privacy-policy"><span className="hover:text-foreground transition-colors cursor-pointer">Privacy</span></Link>
              <Link href="/data-deletion"><span className="hover:text-foreground transition-colors cursor-pointer">Data Deletion</span></Link>
              <Link href="/contact"><span className="hover:text-foreground transition-colors cursor-pointer">Contact</span></Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
