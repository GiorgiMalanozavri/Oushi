import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { OushiMark } from "@/components/oushi-mark";

export const metadata = {
  title: "Privacy Policy · Oushi",
  description: "How Oushi handles your Gmail data, your privacy rights, and what we never do.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#FAF6EB] text-[#2A2520]">
      <LegalHeader />
      <main className="max-w-2xl mx-auto px-6 py-12 sm:py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#A89F92] mb-3">
          Last updated · May 22, 2026
        </p>
        <h1 className="text-[36px] sm:text-[48px] font-semibold tracking-[-0.02em] leading-[1.05] mb-4">
          Privacy Policy
        </h1>
        <p className="text-[15px] text-[#766E63] leading-relaxed">
          This policy explains what Oushi collects, why, and what we&apos;ll never do with it. We&apos;ve tried to write it in plain English. If something is unclear,{" "}
          <a href="mailto:hello@oushi.app" className="text-[#3D6A95] underline underline-offset-2">email us</a>.
        </p>

        <div className="prose-section">
          {/* TL;DR */}
          <Callout title="TL;DR">
            <p>Oushi reads your Gmail so it can do its job. We don&apos;t sell your data, use it for ads, or train AI models on it. You can disconnect or delete everything anytime.</p>
          </Callout>

          <Section title="1. Who we are">
            <p>
              Oushi (&ldquo;Oushi,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) is an AI inbox assistant. This Privacy Policy applies to the Oushi website and product at <a href="https://oushi.app" className="link">oushi.app</a> (the &ldquo;Service&rdquo;).
            </p>
            <p>
              By using Oushi, you agree to the practices described here.
            </p>
          </Section>

          <Section title="2. What we collect">
            <p>To do what we do, we need access to certain information:</p>
            <SubsectionList items={[
              {
                title: "Your Gmail content",
                body: "Email subject lines, sender and recipient addresses, dates, message bodies, attachments, thread IDs, and labels. This is fetched live from Google's Gmail API using OAuth tokens you grant us. We also fetch your most recent sent messages to learn your writing voice.",
              },
              {
                title: "Your Google account info",
                body: "Your email address and Google account ID, used to identify your Oushi account and authenticate you on return visits.",
              },
              {
                title: "OAuth tokens",
                body: "Refresh and access tokens issued by Google so Oushi can read your inbox in the background. These are stored encrypted at rest.",
              },
              {
                title: "Your Oushi-specific data",
                body: "Your profile (bio, interests, priorities, noise), your topic boards, your feedback signals (which emails you mark as 'good' or 'not relevant'), your muted senders, and the memories Oushi extracts about your relationships and commitments.",
              },
              {
                title: "Calendar data (if you grant the scope)",
                body: "Read/write access to your primary Google Calendar, used only to create events you explicitly ask Oushi to save. We never read your calendar contents otherwise.",
              },
              {
                title: "Basic analytics",
                body: "We log standard server access info (IP address, request paths, error reports) for security and reliability. We do not use third-party advertising analytics.",
              },
            ]} />
          </Section>

          <Section title="3. Why we collect it">
            <p>Every piece of data we collect is used to provide and improve the Service for <em>you</em>. Specifically:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] text-[#2A2520] leading-relaxed">
              <li>Reading your Gmail content lets Oushi rank emails, write briefings, draft replies in your voice, and remember context across threads.</li>
              <li>OAuth tokens let Oushi sync your inbox in the background without you logging in every time.</li>
              <li>Your profile and feedback let Oushi personalize its rankings and drafts to you specifically.</li>
              <li>Calendar access lets Oushi create events you ask it to save.</li>
              <li>Server logs let us debug, prevent abuse, and keep the Service running.</li>
            </ul>
          </Section>

          <Section title="4. Google API Services compliance">
            <p>
              Oushi&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="link">Google API Services User Data Policy</a>, including the Limited Use requirements.
            </p>
            <p>This specifically means:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] text-[#2A2520] leading-relaxed">
              <li><strong>We will never sell</strong> your Gmail data to anyone.</li>
              <li><strong>We will never use it for advertising</strong>, whether on Oushi or any third-party platform.</li>
              <li><strong>We will never use your Gmail content to train generalized AI or ML models.</strong> Your data is used to personalize <em>your</em> Oushi experience only.</li>
              <li><strong>We will not let humans read your Gmail content</strong> except in narrow cases: (a) with your explicit consent, (b) for security investigations (e.g., to detect abuse), (c) for required debugging where automated tools are insufficient, or (d) when legally required.</li>
              <li><strong>Sub-processors</strong> (described below) only process your data in service of providing Oushi to you, and they do not get standalone rights to your data.</li>
            </ul>
          </Section>

          <Section title="5. Who else sees your data (sub-processors)">
            <p>
              We use a small set of trusted infrastructure providers to operate Oushi. Each only sees the minimum data needed to do their job, and each has their own SOC2-compliant security posture.
            </p>
            <SubsectionList items={[
              { title: "Google", body: "Hosts your Gmail and Calendar. Oushi reads from and writes to Google&apos;s APIs on your behalf with your OAuth consent." },
              { title: "Supabase", body: "Stores your account, profile, topic boards, feedback, and indexed email metadata in a Postgres database. Hosted in the US." },
              { title: "Anthropic", body: "Provides the Claude AI models that rank emails, write briefings, draft replies, and extract memory. Anthropic&apos;s API does not retain your data for training (per their data usage policy)." },
              { title: "Vercel", body: "Hosts the Oushi web application and runs background jobs (cron). Receives standard request logs." },
            ]} />
            <p>
              Sub-processors may change as we evolve the product. We will update this policy if so.
            </p>
          </Section>

          <Section title="6. How we store and protect your data">
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] text-[#2A2520] leading-relaxed">
              <li>All data in transit is encrypted using TLS.</li>
              <li>All data at rest is encrypted using industry-standard encryption (AES-256).</li>
              <li>OAuth tokens are stored encrypted in the database and are never shown in our logs or analytics.</li>
              <li>Row-level security is enforced in our database: even if there were a bug in our app, users cannot read each other&apos;s data.</li>
              <li>We do not store your Google password — only the OAuth tokens Google issues us. Revoke them anytime at <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer" className="link">your Google Account → Security → Third-party apps</a>.</li>
            </ul>
          </Section>

          <Section title="7. How long we keep your data">
            <p>
              We keep your data only as long as you use Oushi. If you delete your account, we delete all of your data from our systems within 30 days (with the exception of anonymized server logs, retained up to 90 days for security and debugging).
            </p>
            <p>
              Synced email metadata is kept while you&apos;re an active user so we can show you your past inbox and surface old commitments. Memory entries auto-expire on a schedule (typically 30-365 days) unless you pin them.
            </p>
          </Section>

          <Section title="8. Your rights">
            <p>You can do all of the following yourself, anytime, from your <Link href="/settings" className="link">Settings</Link> page:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] text-[#2A2520] leading-relaxed">
              <li><strong>Export your data:</strong> One-click JSON download of everything Oushi has about you — profile, boards, feedback, synced emails, memories.</li>
              <li><strong>Delete your account:</strong> One-click permanent deletion of everything across all our tables, plus your auth record.</li>
              <li><strong>Disconnect Gmail:</strong> Revoke Oushi&apos;s access via your Google Account at any time. Oushi will stop syncing immediately.</li>
              <li><strong>Edit or delete memories:</strong> View, pin, or forget any specific memory Oushi has formed about you.</li>
              <li><strong>Edit your profile:</strong> Update bio, interests, priorities, and noise filters at any time.</li>
            </ul>
            <p>
              If you reside in the EU/UK, you also have the right to access, correct, port, or restrict processing of your personal data, and to lodge a complaint with your local data protection authority. To exercise these rights beyond what the in-app controls allow, email{" "}
              <a href="mailto:hello@oushi.app" className="link">hello@oushi.app</a>.
            </p>
            <p>
              If you reside in California, you have additional rights under the CCPA, including the right to know what we collect, the right to delete, and the right not to be discriminated against for exercising your rights. We do not sell personal information.
            </p>
          </Section>

          <Section title="9. Children">
            <p>
              Oushi is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, contact us and we will delete it.
            </p>
          </Section>

          <Section title="10. International users">
            <p>
              Oushi is operated from the United States and our infrastructure providers are primarily based in the US and EU. By using Oushi, you consent to your data being processed in the US.
            </p>
          </Section>

          <Section title="11. Changes to this policy">
            <p>
              When we make material changes to this policy, we&apos;ll update the &ldquo;Last updated&rdquo; date at the top and, where reasonable, notify you via email or in-app. Continued use of Oushi after changes means you accept the new policy.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              Questions, requests, or concerns? Email <a href="mailto:hello@oushi.app" className="link">hello@oushi.app</a>. We aim to respond within a few business days.
            </p>
          </Section>
        </div>
      </main>

      <footer className="border-t border-[#E6DCC4]/60 py-8 mt-12">
        <div className="max-w-2xl mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#A89F92]">
          <span>© Oushi {new Date().getFullYear()}</span>
          <div className="flex items-center gap-5">
            <Link href="/" className="hover:text-[#3D6A95]">Home</Link>
            <Link href="/terms" className="hover:text-[#3D6A95]">Terms</Link>
            <a href="mailto:hello@oushi.app" className="hover:text-[#3D6A95]">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LegalHeader() {
  return (
    <header className="border-b border-[#E6DCC4]/60 bg-[#FAF6EB]/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <OushiMark size={24} />
          <span className="text-[15px] font-semibold tracking-tight">Oushi</span>
        </Link>
        <Link href="/" className="inline-flex items-center gap-1 text-[13px] text-[#766E63] hover:text-[#3D6A95] transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to home
        </Link>
      </div>
    </header>
  );
}

function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8 rounded-2xl border border-[#5E8FBF]/20 bg-[#D0E1F0]/20 p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#5E8FBF] mb-2">{title}</p>
      <div className="text-[15px] leading-relaxed text-[#2A2520]">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-[#2A2520] mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-[#2A2520]">{children}</div>
    </section>
  );
}

function SubsectionList({ items }: { items: Array<{ title: string; body: string }> }) {
  return (
    <div className="mt-2 space-y-3">
      {items.map((item) => (
        <div key={item.title} className="border-l-2 border-[#E6DCC4] pl-4 py-1">
          <p className="text-[14px] font-semibold text-[#2A2520]">{item.title}</p>
          <p className="text-[14px] text-[#766E63] leading-relaxed mt-0.5"
             dangerouslySetInnerHTML={{ __html: item.body }} />
        </div>
      ))}
    </div>
  );
}
