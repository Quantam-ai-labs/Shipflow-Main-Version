import { Link } from "wouter";
import { PublicLayout } from "@/components/public-layout";

export default function DataDeletion() {
  return (
    <PublicLayout>
      <div className="pt-28 pb-20 px-4 sm:px-6 lg:px-8" data-testid="data-deletion-page">
        <div className="max-w-3xl mx-auto">
          <div className="mb-10">
            <span className="px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium">
              Legal
            </span>
            <h1 className="mt-4 text-3xl sm:text-4xl font-bold bg-gradient-to-r from-violet-400 via-white to-emerald-400 bg-clip-text text-transparent">
              Data Deletion Instructions
            </h1>
            <p className="text-sm text-white/30 mt-2">Last updated: March 12, 2026</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/3 backdrop-blur-xl p-6 sm:p-8 space-y-8">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white/90">How to Request Data Deletion</h2>
              <p className="text-sm leading-relaxed text-white/50">
                If you wish to delete your data from the 1SOL.AI platform, you have several options depending on the scope of deletion required. We are committed to giving you full control over your data.
              </p>
            </section>

            <div className="h-px bg-white/6" />

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white/90">Option 1: Disconnect Individual Integrations</h2>
              <p className="text-sm leading-relaxed text-white/50">
                You can disconnect specific integrations and remove their associated data from within your account:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                <li><span className="text-white/70 font-medium">Facebook/Instagram:</span> Go to Settings → Marketing and click "Disconnect". This removes your Facebook access token, ad account data, and campaign history from our platform.</li>
                <li><span className="text-white/70 font-medium">WhatsApp:</span> Go to Support → Connection and disconnect your WhatsApp Business account. This removes your WABA credentials and message logs.</li>
                <li><span className="text-white/70 font-medium">Shopify:</span> Go to Settings → Shopify and disconnect your store. This removes your store credentials (order data may be retained separately).</li>
                <li><span className="text-white/70 font-medium">Couriers:</span> Go to Settings → Couriers and remove individual courier accounts.</li>
              </ul>
            </section>

            <div className="h-px bg-white/6" />

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white/90">Option 2: Email Request</h2>
              <p className="text-sm leading-relaxed text-white/50">
                Send an email to{" "}
                <a href="mailto:usamax.mail@gmail.com" className="text-violet-400 hover:text-violet-300 transition-colors">usamax.mail@gmail.com</a>
                {" "}with the subject line "Data Deletion Request" and include:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                <li>Your account email address</li>
                <li>Your business/store name</li>
                <li>Whether you want partial deletion (specific integrations or data types only) or full account deletion</li>
                <li>Any specific data categories you want deleted (orders, financial records, AI conversations, etc.)</li>
              </ul>
              <p className="text-sm leading-relaxed text-white/50">
                We will acknowledge your request within 48 hours and complete the deletion within 30 days. You will receive a confirmation email once the process is complete.
              </p>
            </section>

            <div className="h-px bg-white/6" />

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white/90">Option 3: Contact Form</h2>
              <p className="text-sm leading-relaxed text-white/50">
                You can also submit a data deletion request through our{" "}
                <Link href="/contact"><span className="text-violet-400 cursor-pointer hover:text-violet-300 transition-colors">Contact Form</span></Link>.
                {" "}Select "Data Deletion" as the subject and provide the same details as listed above.
              </p>
            </section>

            <div className="h-px bg-white/6" />

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white/90">What Gets Deleted</h2>
              <p className="text-sm leading-relaxed text-white/50">Upon a full deletion request, we will remove:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
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

            <div className="h-px bg-white/6" />

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white/90">Data Retention Exceptions</h2>
              <p className="text-sm leading-relaxed text-white/50">
                Certain data may be retained beyond the deletion request in the following circumstances:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-white/50">
                <li>Financial transaction records required by Pakistani tax law (up to 5 years)</li>
                <li>Anonymized, aggregated analytics data that cannot be linked to your identity</li>
                <li>System logs required for security and fraud prevention (up to 90 days)</li>
              </ul>
            </section>

            <div className="h-px bg-white/6" />

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white/90">Facebook Data Specifically</h2>
              <p className="text-sm leading-relaxed text-white/50">
                In compliance with Meta's Platform Terms, you can revoke 1SOL.AI's access to your Facebook data through multiple channels:
              </p>
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-white/50">
                <li>Through 1SOL.AI: Settings → Marketing → Disconnect Facebook</li>
                <li>Through Facebook: Settings → Security and Login → Apps and Websites → Find "1SOL.AI" → Click "Remove"</li>
                <li>Through email: Send a deletion request as described above</li>
              </ol>
              <p className="text-sm leading-relaxed text-white/50">
                Upon revocation, we will delete all Facebook-related data (ad accounts, campaigns, audience data, page tokens) within 30 days.
              </p>
            </section>

            <div className="h-px bg-white/6" />

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white/90">Contact</h2>
              <p className="text-sm leading-relaxed text-white/50">
                For any questions about data deletion, contact us at:{" "}
                <a href="mailto:usamax.mail@gmail.com" className="text-violet-400 hover:text-violet-300 transition-colors">usamax.mail@gmail.com</a>
                {" "}or visit our{" "}
                <Link href="/contact"><span className="text-violet-400 cursor-pointer hover:text-violet-300 transition-colors">Contact</span></Link> page.
              </p>
            </section>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
