import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Package, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DataDeletion() {
  return (
    <div className="min-h-screen bg-background" data-testid="data-deletion-page">
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
        <h1 className="text-3xl font-bold mb-2">Data Deletion Instructions</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 12, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">How to Request Data Deletion</h2>
            <p className="text-sm leading-relaxed">
              If you wish to delete your data from the 1SOL.AI platform, you have several options depending on the scope of deletion required. We are committed to giving you full control over your data.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Option 1: Disconnect Individual Integrations</h2>
            <p className="text-sm leading-relaxed">
              You can disconnect specific integrations and remove their associated data from within your account:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li><strong>Facebook/Instagram:</strong> Go to Settings → Marketing and click "Disconnect". This removes your Facebook access token, ad account data, and campaign history from our platform.</li>
              <li><strong>WhatsApp:</strong> Go to Support → Connection and disconnect your WhatsApp Business account. This removes your WABA credentials and message logs.</li>
              <li><strong>Shopify:</strong> Go to Settings → Shopify and disconnect your store. This removes your store credentials (order data may be retained separately).</li>
              <li><strong>Couriers:</strong> Go to Settings → Couriers and remove individual courier accounts.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Option 2: Email Request</h2>
            <p className="text-sm leading-relaxed">
              Send an email to <strong>usamax.mail@gmail.com</strong> with the subject line "Data Deletion Request" and include:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Your account email address</li>
              <li>Your business/store name</li>
              <li>Whether you want partial deletion (specific integrations or data types only) or full account deletion</li>
              <li>Any specific data categories you want deleted (orders, financial records, AI conversations, etc.)</li>
            </ul>
            <p className="text-sm leading-relaxed">
              We will acknowledge your request within 48 hours and complete the deletion within 30 days. You will receive a confirmation email once the process is complete.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Option 3: Contact Form</h2>
            <p className="text-sm leading-relaxed">
              You can also submit a data deletion request through our <Link href="/contact"><span className="text-primary cursor-pointer hover:underline">Contact Form</span></Link>. Select "Data Deletion" as the subject and provide the same details as listed above.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">What Gets Deleted</h2>
            <p className="text-sm leading-relaxed">Upon a full deletion request, we will remove:</p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Your account profile, credentials, and authentication tokens</li>
              <li>All stored Facebook/Instagram/WhatsApp access tokens and OAuth grants</li>
              <li>Order data, shipment records, and tracking history</li>
              <li>WhatsApp message logs and RoboCall confirmation records</li>
              <li>Ad campaign data, media library items, and audience configurations</li>
              <li>Financial records including COD reconciliation, payment ledger, and accounting data</li>
              <li>AI conversation history and generated insights</li>
              <li>Team member associations and access permissions</li>
              <li>Any other personal or business data associated with your account</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Data Retention Exceptions</h2>
            <p className="text-sm leading-relaxed">
              Certain data may be retained beyond the deletion request in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Financial transaction records required by Pakistani tax law (up to 5 years)</li>
              <li>Anonymized, aggregated analytics data that cannot be linked to your identity</li>
              <li>System logs required for security and fraud prevention (up to 90 days)</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Facebook Data Specifically</h2>
            <p className="text-sm leading-relaxed">
              In compliance with Meta's Platform Terms, you can revoke 1SOL.AI's access to your Facebook data through multiple channels:
            </p>
            <ol className="list-decimal pl-6 space-y-1 text-sm">
              <li>Through 1SOL.AI: Settings → Marketing → Disconnect Facebook</li>
              <li>Through Facebook: Settings → Security and Login → Apps and Websites → Find "1SOL.AI" → Click "Remove"</li>
              <li>Through email: Send a deletion request as described above</li>
            </ol>
            <p className="text-sm leading-relaxed">
              Upon revocation, we will delete all Facebook-related data (ad accounts, campaigns, audience data, page tokens) within 30 days.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Contact</h2>
            <p className="text-sm leading-relaxed">
              For any questions about data deletion, contact us at: <strong>usamax.mail@gmail.com</strong> or visit our <Link href="/contact"><span className="text-primary cursor-pointer hover:underline">Contact</span></Link> page.
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
              <Link href="/terms-of-service"><span className="hover:text-foreground transition-colors cursor-pointer">Terms</span></Link>
              <Link href="/contact"><span className="hover:text-foreground transition-colors cursor-pointer">Contact</span></Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
