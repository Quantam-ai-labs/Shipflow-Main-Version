import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Package, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background" data-testid="privacy-policy-page">
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
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 12, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">1. Introduction</h2>
            <p className="text-sm leading-relaxed">
              1SOL.AI ("we", "us", or "our") operates a logistics, marketing automation, and business management platform for e-commerce merchants in Pakistan. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform, including our web application, APIs, and related services.
            </p>
            <p className="text-sm leading-relaxed">
              By using 1SOL.AI, you consent to the data practices described in this policy. If you do not agree, please discontinue use of our platform immediately.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">2. Information We Collect</h2>
            <p className="text-sm leading-relaxed">We collect information that you provide directly to us, including:</p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Account information (name, email address, phone number, business details)</li>
              <li>Shopify store data (orders, products, customer information, fulfillment data) via authorized OAuth API access</li>
              <li>Facebook/Meta account information when you connect via OAuth (ad accounts, pages, Instagram accounts, campaign data)</li>
              <li>WhatsApp Business API credentials and message logs when you connect your WhatsApp account</li>
              <li>Courier account credentials (Leopards, PostEx, TCS) for shipment booking and tracking</li>
              <li>Financial and accounting data including COD amounts, payment records, expenses, and transaction histories</li>
              <li>Usage data and analytics about how you interact with our platform</li>
              <li>AI conversation logs when using our AI assistant features</li>
              <li>Contact form submissions and support communications</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">3. How We Use Your Information</h2>
            <p className="text-sm leading-relaxed">We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Provide, maintain, and improve our platform services</li>
              <li>Sync, process, and manage your e-commerce orders</li>
              <li>Book shipments and track deliveries across multiple courier services</li>
              <li>Send WhatsApp and voice-based (RoboCall) order confirmation messages on your behalf to your customers</li>
              <li>Create, manage, and optimize Facebook/Instagram advertising campaigns on your behalf</li>
              <li>Perform COD reconciliation and financial accounting operations</li>
              <li>Generate AI-powered analytics, insights, and business reports</li>
              <li>Communicate with you about your account, updates, and our services</li>
              <li>Detect, investigate, and prevent fraud or unauthorized activities</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">4. Data Sharing & Third-Party Services</h2>
            <p className="text-sm leading-relaxed">
              We do not sell your personal information. We share data with the following categories of third-party service providers as necessary to operate our platform:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li><strong>Shopify:</strong> Order data synchronization and store management</li>
              <li><strong>Meta (Facebook/Instagram):</strong> Advertising campaign creation, management, and performance tracking</li>
              <li><strong>WhatsApp Business API:</strong> Customer communication and order confirmation messaging</li>
              <li><strong>Courier services (Leopards, PostEx, TCS):</strong> Shipment booking, tracking, and delivery management</li>
              <li><strong>OpenAI:</strong> AI-powered business analytics and natural language processing (anonymized data)</li>
              <li><strong>Resend:</strong> Transactional email delivery</li>
            </ul>
            <p className="text-sm leading-relaxed">
              All third-party providers are bound by their respective privacy policies and applicable data protection laws. We only share the minimum data necessary to provide the requested service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">5. Data Storage & Security</h2>
            <p className="text-sm leading-relaxed">
              We implement appropriate technical and organizational security measures to protect your data, including:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Encryption of sensitive credentials (access tokens, API keys) using AES-256 encryption at rest</li>
              <li>Secure HTTPS connections for all data transmission</li>
              <li>Role-based access control for multi-tenant data isolation</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Data stored on secure cloud infrastructure with automated backups</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">6. Data Retention</h2>
            <p className="text-sm leading-relaxed">
              We retain your data for as long as your account is active or as needed to provide our services. Specifically:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Account data: Retained while your account is active, deleted within 30 days of account closure</li>
              <li>Order and shipment data: Retained for 2 years for reporting and audit purposes</li>
              <li>Financial records: Retained for 5 years as required by Pakistani tax regulations</li>
              <li>AI conversation logs: Retained for 90 days, then automatically purged</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">7. Your Rights</h2>
            <p className="text-sm leading-relaxed">You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data (see our <Link href="/data-deletion"><span className="text-primary cursor-pointer hover:underline">Data Deletion</span></Link> page)</li>
              <li>Disconnect third-party integrations (Shopify, Facebook, WhatsApp, couriers) at any time from Settings</li>
              <li>Export your data in a portable format</li>
              <li>Opt out of non-essential communications</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">8. Cookies & Tracking</h2>
            <p className="text-sm leading-relaxed">
              We use essential cookies for authentication and session management. We do not use third-party tracking cookies or advertising pixels on our platform. Analytics data is collected server-side without third-party trackers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">9. Children's Privacy</h2>
            <p className="text-sm leading-relaxed">
              1SOL.AI is a business platform not intended for use by individuals under 18 years of age. We do not knowingly collect personal data from minors.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">10. Governing Law</h2>
            <p className="text-sm leading-relaxed">
              This Privacy Policy is governed by the laws of Pakistan, including the Prevention of Electronic Crimes Act (PECA) 2016 and any applicable data protection regulations. Any disputes shall be subject to the exclusive jurisdiction of courts in Lahore, Pakistan.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">11. Changes to This Policy</h2>
            <p className="text-sm leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of material changes by email or through a notice on our platform. Your continued use of 1SOL.AI after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">12. Contact Us</h2>
            <p className="text-sm leading-relaxed">
              If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us at: <strong>usamax.mail@gmail.com</strong> or visit our <Link href="/contact"><span className="text-primary cursor-pointer hover:underline">Contact</span></Link> page.
            </p>
          </section>
        </div>
      </div>

      <footer className="py-8 border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} 1SOL.AI</p>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/terms-of-service"><span className="hover:text-foreground transition-colors cursor-pointer">Terms</span></Link>
              <Link href="/data-deletion"><span className="hover:text-foreground transition-colors cursor-pointer">Data Deletion</span></Link>
              <Link href="/contact"><span className="hover:text-foreground transition-colors cursor-pointer">Contact</span></Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
