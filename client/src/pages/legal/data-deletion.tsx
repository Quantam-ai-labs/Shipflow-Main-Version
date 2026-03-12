export default function DataDeletion() {
  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10 space-y-6" data-testid="data-deletion-page">
      <h1 className="text-3xl font-bold">Data Deletion Instructions</h1>
      <p className="text-sm text-muted-foreground">Last updated: March 12, 2026</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">How to Request Data Deletion</h2>
        <p className="text-sm leading-relaxed">
          If you wish to delete your data from the 1SOL.AI platform, you have the following options:
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Option 1: Disconnect from Settings</h2>
        <p className="text-sm leading-relaxed">
          You can disconnect your Facebook/Instagram account at any time by going to <strong>Settings &gt; Marketing</strong> and clicking the <strong>"Disconnect"</strong> button. This will remove your Facebook access token and associated data from our platform.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Option 2: Email Request</h2>
        <p className="text-sm leading-relaxed">
          Send an email to <strong>usamax.mail@gmail.com</strong> with the subject line "Data Deletion Request" and include:
        </p>
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li>Your account email address</li>
          <li>Your business/store name</li>
          <li>Whether you want partial deletion (specific integrations only) or full account deletion</li>
        </ul>
        <p className="text-sm leading-relaxed">
          We will process your request within 30 days and confirm deletion via email.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What Gets Deleted</h2>
        <p className="text-sm leading-relaxed">Upon a full deletion request, we will remove:</p>
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li>Your account profile and credentials</li>
          <li>All stored Facebook/Instagram/WhatsApp access tokens</li>
          <li>Order confirmation logs and history</li>
          <li>Ad campaign data and media library items</li>
          <li>Any other personal data associated with your account</li>
        </ul>
        <p className="text-sm leading-relaxed">
          Note: Data that has already been sent to third-party platforms (Meta, WhatsApp, Shopify) is governed by their respective data deletion policies.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Facebook Data</h2>
        <p className="text-sm leading-relaxed">
          To revoke 1SOL.AI's access to your Facebook data, you can also remove our app from your Facebook settings:
        </p>
        <ol className="list-decimal pl-6 space-y-1 text-sm">
          <li>Go to Facebook Settings &gt; Security and Login &gt; Apps and Websites</li>
          <li>Find "1SOL.AI" in the list of active apps</li>
          <li>Click "Remove" to revoke access</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="text-sm leading-relaxed">
          For any questions about data deletion, contact us at: <strong>usamax.mail@gmail.com</strong>
        </p>
      </section>
    </div>
  );
}
