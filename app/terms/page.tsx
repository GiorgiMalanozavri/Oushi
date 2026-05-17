import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const metadata = {
  title: "Terms of Service · Oushi",
  description: "The terms governing your use of Oushi, an AI-powered email assistant in beta.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FAF6EB] text-[#2A2520]">
      <LegalHeader />
      <main className="max-w-2xl mx-auto px-6 py-12 sm:py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#A89F92] mb-3">
          Last updated · May 17, 2026 · Effective immediately
        </p>
        <h1 className="text-[36px] sm:text-[48px] font-semibold tracking-[-0.02em] leading-[1.05] mb-4">
          Terms of Service
        </h1>
        <p className="text-[15px] text-[#766E63] leading-relaxed">
          These Terms of Service (the &ldquo;<strong>Terms</strong>&rdquo;) govern your access to and use of Oushi, an AI-powered email assistant currently in private beta. Please read them carefully. By creating an account or otherwise using the Service, you agree to be legally bound by these Terms and our{" "}
          <Link href="/privacy" className="link">Privacy Policy</Link>.
        </p>

        <Callout title="Plain-English summary (not a substitute for the full Terms)">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Oushi is in <strong>beta</strong>. Features may break, change, or disappear without notice. Use at your own risk.</li>
            <li>Oushi&apos;s AI may produce inaccurate drafts and suggestions. <strong>You are responsible for everything you send</strong>. Always review before clicking Send.</li>
            <li>Do not abuse the Service or use it for spam, phishing, or anything illegal.</li>
            <li>You can disconnect or delete your account at any time. We may suspend accounts that violate these Terms.</li>
            <li>Oushi is currently operated by an individual, not a registered company. Liability is therefore strictly limited.</li>
            <li>By using Oushi, you agree to resolve disputes through binding arbitration and waive your right to class actions, except where prohibited by law.</li>
          </ul>
        </Callout>

        <div className="prose-section">
          {/* ============================ */}
          <Section title="1. Introduction and Acceptance">
            <p>
              These Terms constitute a legally binding agreement between you (&ldquo;<strong>you</strong>,&rdquo; &ldquo;<strong>your</strong>,&rdquo; or &ldquo;<strong>User</strong>&rdquo;) and the individual operator of Oushi (the &ldquo;<strong>Operator</strong>,&rdquo; &ldquo;<strong>we</strong>,&rdquo; &ldquo;<strong>us</strong>,&rdquo; or &ldquo;<strong>our</strong>&rdquo;), governing your access to and use of the Service (defined below).
            </p>
            <p>
              You acknowledge that Oushi is not yet incorporated as a separate legal entity. The Operator may at any time, and without notice to you, restructure as a limited liability company, corporation, or other legal form, in which case these Terms will continue to apply to the successor entity by operation of law.
            </p>
            <p>
              By accessing or using the Service, registering for an account, or clicking any &ldquo;I agree&rdquo; or similar button presented to you, you represent that (a) you have read, understood, and agree to be bound by these Terms; (b) you are of legal age to form a binding contract; (c) you have the authority to enter into these Terms personally or on behalf of any entity for which you act; and (d) your use of the Service complies with all applicable laws and regulations.
            </p>
            <p>
              <strong>If you do not agree to these Terms, you must not access or use the Service.</strong>
            </p>
          </Section>

          {/* ============================ */}
          <Section title="2. Definitions">
            <p>The following capitalized terms have the meanings set forth below:</p>
            <DefinitionList items={[
              { term: "Service", body: "The Oushi website at oushi.app, the Oushi web application, all related software, APIs, content, features, and functionality, including any beta or experimental features." },
              { term: "Account", body: "Your individual user account on the Service, created when you authenticate through Google OAuth." },
              { term: "User Content", body: "All information, data, and content that you (or the third-party services you authorize, such as Google) provide to or transmit through the Service, including your Gmail messages, attachments, profile information, topic boards, feedback signals, and any other content generated through your use of the Service." },
              { term: "AI Output", body: "Any content generated, suggested, drafted, summarized, ranked, or otherwise produced by automated systems within the Service, including but not limited to draft email replies, briefings, ranking scores, suggested actions, memory entries, and conversational responses." },
              { term: "Third-Party Services", body: "Services provided by parties other than the Operator that the Service relies upon or integrates with, including but not limited to Google (Gmail and Calendar APIs), Anthropic (Claude AI), Supabase, Vercel, and any future infrastructure or AI providers." },
              { term: "Confidential Information", body: "Any non-public information disclosed by one party to the other in connection with the Service that a reasonable person would understand to be confidential." },
            ]} />
          </Section>

          {/* ============================ */}
          <Section title="3. Eligibility">
            <p>
              To use the Service, you must:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>Be at least 13 years old. If you reside in the European Economic Area, the United Kingdom, or any other jurisdiction requiring a higher minimum age for online consent, you must be at least 16 years old.</li>
              <li>Have legal capacity to enter into a binding contract under the laws of your jurisdiction.</li>
              <li>Not be barred from receiving services under the laws of the United States or any other applicable jurisdiction.</li>
              <li>Possess a valid Google account that you are authorized to use, and have authority to grant the Service access to that account&apos;s Gmail and (optionally) Calendar data.</li>
              <li>Use the Service only for lawful purposes and in compliance with these Terms.</li>
            </ul>
            <p>
              The Service is intended for individual use. Use on behalf of an organization is permitted only if you have authority to bind that organization to these Terms.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="4. Beta Service Status">
            <div className="rounded-md border border-[#B86B4A]/25 bg-[#F5E8E0]/30 px-4 py-3 my-3">
              <p className="text-[14px] leading-relaxed text-[#2A2520]">
                <strong className="text-[#B86B4A]">Important:</strong> Oushi is currently provided as a beta service. This means the Service is experimental, evolving, and provided to you for testing, evaluation, and feedback purposes.
              </p>
            </div>
            <p>You expressly acknowledge and agree that:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>The Service may contain bugs, errors, design flaws, security vulnerabilities, and incomplete features.</li>
              <li>The Service may behave unpredictably, including by missing important emails, mis-ranking content, generating inaccurate drafts, or failing to deliver scheduled briefings.</li>
              <li>Features may be added, modified, restricted, or removed at any time without prior notice.</li>
              <li>The Service may be unavailable for extended periods due to maintenance, outages, third-party failures, or any other reason.</li>
              <li>Data you provide or that is generated through the Service may be lost, corrupted, duplicated, or inadvertently exposed to other Users due to bugs.</li>
              <li>The Operator makes no commitment to maintain backups, data integrity, uptime, or any service-level guarantees.</li>
              <li>The Service may be discontinued in its entirety at any time, with or without notice, and the Operator has no obligation to provide a migration path or refund.</li>
            </ul>
            <p>
              <strong>You should not rely on the Service as your sole or primary system for managing critical communications.</strong> Continue to use your underlying Gmail account directly for any emails of importance, and treat Oushi as a supplementary tool rather than a replacement.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="5. Account Registration and Security">
            <p>
              To use the Service, you must create an Account by authenticating with your Google account through OAuth. By doing so, you:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>Authorize the Service to access, read, modify (as you direct), and send email on your behalf via the Gmail API, in accordance with the OAuth scopes you grant;</li>
              <li>Optionally authorize the Service to access your Google Calendar to create events you explicitly request;</li>
              <li>Represent and warrant that all information you provide is accurate and complete;</li>
              <li>Agree to maintain the accuracy of that information; and</li>
              <li>Accept full responsibility for all activity that occurs under your Account.</li>
            </ul>
            <p>
              You are responsible for safeguarding access to your Google account. The Operator is not responsible for losses arising from unauthorized access to your Google account, weak passwords, compromised devices, or your failure to enable two-factor authentication.
            </p>
            <p>
              You must notify the Operator immediately at <a href="mailto:hi@oushi.app" className="link">hi@oushi.app</a> if you suspect unauthorized use of your Account.
            </p>
            <p>
              You may delete your Account at any time through the in-application <Link href="/settings" className="link">Settings</Link> page, which will trigger deletion of your data as described in our <Link href="/privacy" className="link">Privacy Policy</Link>.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="6. Description and Use of the Service">
            <p>
              The Service is an AI-assisted email triage and assistance tool. Its features may include, without limitation:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>Automated reading and ranking of your Gmail messages;</li>
              <li>Categorization of emails into user-defined topic boards;</li>
              <li>Generation of natural-language briefings summarizing your inbox;</li>
              <li>Generation of suggested draft replies, intended to approximate your writing voice;</li>
              <li>Optional sending of drafted replies through your Gmail account;</li>
              <li>Optional creation of Google Calendar events based on email content;</li>
              <li>Conversational question-and-answer about the contents of your inbox; and</li>
              <li>Persistent memory of facts, relationships, and commitments extracted from your inbox.</li>
            </ul>
            <p>
              The features available to you may vary based on the OAuth scopes you have granted, your engagement with the Service, and the Operator&apos;s ongoing development.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="7. License Grants">
            <p>
              <strong>License to you.</strong> Subject to your full and continuing compliance with these Terms, the Operator grants you a limited, non-exclusive, non-transferable, non-sublicensable, revocable license to access and use the Service for your personal, non-commercial purposes during the term of your Account.
            </p>
            <p>
              <strong>License to us.</strong> By using the Service, you grant the Operator a limited, worldwide, non-exclusive, royalty-free license to access, store, copy, transmit, process, analyze, and display your User Content solely to (i) provide, maintain, and improve the Service for you; (ii) prevent or address abuse, fraud, security incidents, or violations of these Terms; and (iii) comply with applicable law. This license terminates when you delete your Account, except as needed for the limited residual purposes described in our <Link href="/privacy" className="link">Privacy Policy</Link>.
            </p>
            <p>
              <strong>No model training.</strong> Notwithstanding the above license, the Operator will not use your Gmail content or other personal User Content to train generalized AI or machine learning models. This commitment is reflected in our <Link href="/privacy" className="link">Privacy Policy</Link> and our compliance with the Google API Services User Data Policy.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="8. User Content and Data">
            <p>
              You retain all ownership rights to your User Content. The Service does not claim ownership over any email, message, document, or other content you bring into or generate within the Service.
            </p>
            <p>
              You represent and warrant that:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>You have all necessary rights to provide or transmit your User Content to the Service;</li>
              <li>Your User Content does not violate any applicable law, third-party rights, contractual obligation, or these Terms;</li>
              <li>You will not knowingly transmit User Content that contains malware, harmful code, or content intended to disrupt or harm the Service, the Operator, or any other party;</li>
              <li>You will obtain any consents required from third parties whose communications you bring into the Service through your Gmail account (where required by applicable law).</li>
            </ul>
            <p>
              The Operator does not pre-screen User Content but reserves the right to investigate, remove, or restrict access to any User Content it believes, in its sole discretion, to violate these Terms or applicable law.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="9. Acceptable Use Policy">
            <p>You agree that you will <strong>not</strong>, and will not permit any third party to:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>Use the Service to send spam, bulk unsolicited email, phishing messages, fraudulent communications, or any unlawful content;</li>
              <li>Impersonate any person or entity, falsely state or misrepresent your affiliation, or send communications that are misleading as to their origin;</li>
              <li>Use the Service to harass, threaten, defame, or harm any individual or group;</li>
              <li>Attempt to access any data or account other than your own;</li>
              <li>Reverse engineer, decompile, disassemble, or attempt to derive the source code, underlying ideas, or algorithms of the Service, except to the extent expressly permitted by applicable law;</li>
              <li>Circumvent, disable, or otherwise interfere with security features, rate limits, or access controls;</li>
              <li>Use automated systems (including bots, scrapers, or scripts) to interact with the Service in ways that exceed normal user behavior;</li>
              <li>Resell, sublicense, rent, lease, or commercially distribute the Service, in whole or in part, without the Operator&apos;s prior written consent;</li>
              <li>Use the Service in a manner that violates the Google API Services User Data Policy, Google&apos;s Terms of Service, or any other Third-Party Service&apos;s terms;</li>
              <li>Use the Service in connection with any nuclear facility, life-support system, air traffic control, weapons system, or other application where failure could result in death, personal injury, or environmental damage;</li>
              <li>Use the Service to develop a competing product or to benchmark the Service for the purpose of producing a competing product;</li>
              <li>Remove, alter, or obscure any copyright, trademark, or other proprietary notices in the Service;</li>
              <li>Engage in any activity that interferes with or disrupts the Service or the servers and networks connected to the Service.</li>
            </ul>
            <p>
              The Operator may, at its sole discretion and without prior notice, suspend or terminate your Account for any violation of this Acceptable Use Policy.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="10. AI-Generated Content">
            <p>
              The Service relies on artificial intelligence, including large language models provided by Third-Party Services such as Anthropic. AI Output is produced by statistical processes and is inherently probabilistic.
            </p>
            <p>You acknowledge and agree that:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>AI Output may be inaccurate, incomplete, biased, offensive, defamatory, misleading, or otherwise inappropriate;</li>
              <li>AI Output may misrepresent facts, fabricate details (a phenomenon known as &ldquo;hallucination&rdquo;), or take positions you do not endorse;</li>
              <li>AI Output is generated solely as a suggestion and does not constitute professional advice of any kind, including legal, financial, tax, medical, or psychological advice;</li>
              <li>You are solely responsible for reviewing, editing, and accepting or rejecting any AI Output before sending an email, creating a calendar event, or taking any other action;</li>
              <li>You bear full responsibility for the legal, social, professional, and personal consequences of any email sent, action taken, or decision made based on AI Output, regardless of whether you reviewed it.</li>
            </ul>
            <p>
              <strong>The Operator expressly disclaims all liability arising from AI Output, including drafts you send unmodified, calendar events you allow Oushi to create, or any decisions you make in reliance on the Service&apos;s rankings, summaries, or suggestions.</strong>
            </p>
            <p>
              You also acknowledge that AI Output is not unique to you. AI models may produce similar or identical output for other users based on similar inputs, and you do not claim exclusive rights to AI Output.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="11. Third-Party Services and Integrations">
            <p>
              The Service depends on and integrates with Third-Party Services, including but not limited to Google (Gmail, Calendar, OAuth), Anthropic (Claude AI), Supabase (database and authentication), and Vercel (hosting). Your use of these Third-Party Services through the Service is subject to their respective terms of service and privacy policies, which you should review independently.
            </p>
            <p>
              The Operator does not control Third-Party Services and is not responsible for:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>The availability, accuracy, performance, security, or reliability of any Third-Party Service;</li>
              <li>Changes that Third-Party Services make to their terms, APIs, pricing, or feature sets, which may affect the Service&apos;s functionality;</li>
              <li>Data loss, exposure, or misuse caused by Third-Party Services;</li>
              <li>Communications between you and any Third-Party Service.</li>
            </ul>
            <p>
              The Operator may add, remove, or substitute Third-Party Services at any time without notice. Your continued use of the Service after such changes constitutes acceptance of those changes.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="12. Google API Services Compliance">
            <p>
              The Service&apos;s use and transfer of information received from Google APIs adheres to the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="link">Google API Services User Data Policy</a>, including the Limited Use requirements.
            </p>
            <p>
              Specifically, and notwithstanding any other provision of these Terms:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>The Operator will not transfer Google user data to any third party except as necessary to provide the Service to you, and only in accordance with this section;</li>
              <li>The Operator will not use Google user data for serving advertisements;</li>
              <li>The Operator will not allow humans to read Google user data except (i) with your explicit consent for specific support requests, (ii) for security purposes such as investigating abuse, (iii) for required debugging where automated tools are insufficient, or (iv) where required by applicable law;</li>
              <li>The Operator will not use Google user data to develop, improve, or train generalized AI or machine learning models.</li>
            </ul>
            <p>
              Further details are set forth in our <Link href="/privacy" className="link">Privacy Policy</Link>.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="13. Fees and Payment">
            <p>
              The Service is currently provided free of charge during the beta period. The Operator reserves the right to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>Introduce paid tiers or subscription plans at any time;</li>
              <li>Convert features previously available for free into paid features;</li>
              <li>Impose usage limits, rate limits, or quotas at any time, with or without notice.</li>
            </ul>
            <p>
              The Operator will use commercially reasonable efforts to provide existing Users with at least thirty (30) days&apos; notice before introducing paid plans that affect their existing usage. However, the Operator has no obligation to grandfather Users into any pricing or feature configuration.
            </p>
            <p>
              No refunds or credits will be issued except as required by applicable law.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="14. Privacy">
            <p>
              Your privacy is governed by our <Link href="/privacy" className="link">Privacy Policy</Link>, which is incorporated into these Terms by reference. By using the Service, you acknowledge and agree to the data practices described therein.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="15. Intellectual Property Rights">
            <p>
              The Service, including all of its content, code, design, user interface, branding, trademarks, and underlying technology (collectively, the &ldquo;<strong>Operator IP</strong>&rdquo;), is owned by the Operator and is protected by copyright, trademark, trade secret, and other intellectual property laws.
            </p>
            <p>
              Except for the limited license expressly granted to you in Section 7, no rights, title, or interest in or to the Operator IP are granted to you under these Terms. All rights not expressly granted are reserved by the Operator.
            </p>
            <p>
              The names &ldquo;Oushi&rdquo; and any associated logos are trademarks of the Operator. You may not use these marks without the Operator&apos;s prior written consent, except to identify the Service in factual reference.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="16. Feedback">
            <p>
              From time to time, you may provide the Operator with feedback, suggestions, ideas, or other input regarding the Service (&ldquo;<strong>Feedback</strong>&rdquo;). You agree that all Feedback is provided to the Operator on a non-confidential basis, and you hereby grant the Operator a perpetual, irrevocable, worldwide, royalty-free, fully transferable license to use, modify, distribute, and exploit such Feedback for any purpose without obligation or compensation to you.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="17. Service Modifications and Discontinuation">
            <p>
              The Operator reserves the right, at its sole discretion and at any time, with or without notice, to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>Modify, add, restrict, or remove any feature or functionality of the Service;</li>
              <li>Limit the availability of the Service in any geography or to any class of Users;</li>
              <li>Temporarily suspend the Service for maintenance, upgrades, or security purposes;</li>
              <li>Discontinue the Service in whole or in part.</li>
            </ul>
            <p>
              The Operator shall not be liable to you or to any third party for any modification, suspension, or discontinuation of the Service.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="18. Termination and Suspension">
            <p>
              <strong>By you.</strong> You may terminate these Terms at any time by deleting your Account through the in-application <Link href="/settings" className="link">Settings</Link> page or by emailing <a href="mailto:hi@oushi.app" className="link">hi@oushi.app</a>.
            </p>
            <p>
              <strong>By the Operator.</strong> The Operator may suspend or terminate your Account, your access to the Service, or these Terms in their entirety, at any time and for any reason, including without limitation if the Operator believes, in its sole discretion, that:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>You have violated these Terms;</li>
              <li>Your use poses a security or legal risk to the Operator, other Users, or any third party;</li>
              <li>The Operator is required to do so by applicable law;</li>
              <li>Continued provision of the Service to you is no longer commercially reasonable.</li>
            </ul>
            <p>
              The Operator will make reasonable efforts to notify you of suspension or termination by email, but is not required to do so before taking action in cases of clear abuse, fraud, or legal compulsion.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="19. Effect of Termination">
            <p>Upon termination of these Terms or your Account:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>Your right to access and use the Service immediately ceases;</li>
              <li>The Operator will delete your User Content as described in our <Link href="/privacy" className="link">Privacy Policy</Link>, except as needed for legal, security, or audit purposes;</li>
              <li>OAuth tokens issued to the Service are revoked or expired; you can also revoke them independently through your Google account settings;</li>
              <li>The Operator is under no obligation to provide you with copies of your User Content, though you may export it through the in-application data export feature before deletion if you wish.</li>
            </ul>
            <p>
              Sections that by their nature should survive termination (including, without limitation, Sections 7, 8, 10, 15, 16, 20, 22, 23, 24, 25, 26, 27, and 33) will survive.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="20. Disclaimers of Warranty">
            <p className="uppercase text-[13px] leading-relaxed tracking-wide text-[#2A2520]">
              THE SERVICE, INCLUDING ALL CONTENT, FEATURES, AND AI OUTPUT, IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE OPERATOR DISCLAIMS ALL WARRANTIES, INCLUDING, WITHOUT LIMITATION, IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, AND ANY WARRANTIES ARISING FROM COURSE OF DEALING, COURSE OF PERFORMANCE, OR USAGE OF TRADE.
            </p>
            <p className="uppercase text-[13px] leading-relaxed tracking-wide text-[#2A2520]">
              WITHOUT LIMITING THE FOREGOING, THE OPERATOR DOES NOT WARRANT THAT (A) THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE; (B) ANY ERRORS WILL BE CORRECTED; (C) AI OUTPUT WILL BE ACCURATE, COMPLETE, RELIABLE, OR APPROPRIATE FOR ANY PURPOSE; (D) THE SERVICE WILL MEET YOUR REQUIREMENTS OR EXPECTATIONS; (E) ANY DATA STORED THROUGH THE SERVICE WILL BE ACCURATE, AVAILABLE, OR RECOVERABLE.
            </p>
            <p>
              Some jurisdictions do not allow the exclusion of certain warranties. To the extent such exclusions are not enforceable under applicable law in your jurisdiction, the Operator&apos;s warranties are limited to the minimum scope and duration permitted by law.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="21. Limitation of Liability">
            <p className="uppercase text-[13px] leading-relaxed tracking-wide text-[#2A2520]">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL THE OPERATOR BE LIABLE TO YOU OR TO ANY THIRD PARTY FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION LOST PROFITS, LOST REVENUE, LOSS OF DATA, LOST OPPORTUNITY, BUSINESS INTERRUPTION, COST OF SUBSTITUTE SERVICES, OR DAMAGES ARISING FROM YOUR RELIANCE ON AI OUTPUT, REGARDLESS OF THE LEGAL THEORY (CONTRACT, TORT, STRICT LIABILITY, OR OTHERWISE), AND EVEN IF THE OPERATOR HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="uppercase text-[13px] leading-relaxed tracking-wide text-[#2A2520]">
              IN ANY EVENT, THE OPERATOR&apos;S TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE, WHETHER IN CONTRACT, TORT, OR OTHERWISE, IS LIMITED TO THE GREATER OF (A) THE AMOUNT YOU HAVE PAID TO THE OPERATOR IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) UNITED STATES DOLLARS ONE HUNDRED (USD $100.00).
            </p>
            <p>
              You acknowledge that the Operator is operating the Service as an individual without insurance against software liability and that the limitations in this section are essential elements of the bargain between you and the Operator. You agree that the limitations apply even if a remedy fails of its essential purpose.
            </p>
            <p>
              Some jurisdictions do not allow the exclusion or limitation of liability for incidental or consequential damages, so the foregoing limitations may not apply to you in full. In such jurisdictions, the Operator&apos;s liability is limited to the maximum extent permitted by law.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="22. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless the Operator and the Operator&apos;s affiliates, agents, contractors, and licensors (the &ldquo;<strong>Indemnified Parties</strong>&rdquo;) from and against any and all claims, demands, losses, liabilities, damages, costs, and expenses (including reasonable attorneys&apos; fees) arising out of or related to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>Your access to or use of the Service;</li>
              <li>Your User Content, including emails sent through the Service;</li>
              <li>Your violation of these Terms or any applicable law;</li>
              <li>Your violation of any third party&apos;s rights, including intellectual property, privacy, or contractual rights;</li>
              <li>Your reliance on AI Output;</li>
              <li>Any dispute between you and a third party arising in any way from your use of the Service.</li>
            </ul>
            <p>
              The Operator reserves the right, at its own expense, to assume the exclusive defense and control of any matter otherwise subject to indemnification by you, in which case you will fully cooperate with the Operator in asserting any available defenses.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="23. Dispute Resolution and Binding Arbitration">
            <p>
              <strong>Informal resolution.</strong> Before filing any formal proceeding, you agree to first contact the Operator at <a href="mailto:hi@oushi.app" className="link">hi@oushi.app</a> with a written description of the dispute, your contact information, the relief you seek, and any supporting documentation. The Operator and you will attempt in good faith to resolve the dispute informally within sixty (60) days of such notice.
            </p>
            <p>
              <strong>Binding arbitration.</strong> If the dispute is not resolved through informal negotiation, you and the Operator agree that any dispute, claim, or controversy arising out of or relating to these Terms or the Service shall be resolved by binding individual arbitration administered by the American Arbitration Association (&ldquo;<strong>AAA</strong>&rdquo;) under its Consumer Arbitration Rules, in the English language. The arbitrator&apos;s decision shall be final and binding, and judgment on the award may be entered in any court of competent jurisdiction.
            </p>
            <p>
              <strong>Location.</strong> Unless you and the Operator agree otherwise, arbitration shall take place in the United States, conducted remotely where feasible. The Operator will pay all filing, hearing, and arbitrator fees in excess of those you would have paid in court, to the extent required by AAA rules.
            </p>
            <p>
              <strong>Small-claims exception.</strong> Notwithstanding the foregoing, either you or the Operator may bring an individual action in small claims court if the dispute is within that court&apos;s jurisdictional limits.
            </p>
            <p>
              <strong>Right to opt out.</strong> You may opt out of this arbitration agreement within thirty (30) days of first accepting these Terms by sending written notice to <a href="mailto:hi@oushi.app" className="link">hi@oushi.app</a> with the subject line &ldquo;Arbitration Opt-Out&rdquo; and including your Account email. Opting out will not affect any other portion of these Terms.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="24. Class Action Waiver">
            <p className="uppercase text-[13px] leading-relaxed tracking-wide text-[#2A2520]">
              YOU AND THE OPERATOR AGREE TO RESOLVE DISPUTES ONLY ON AN INDIVIDUAL BASIS. NEITHER YOU NOR THE OPERATOR MAY BRING A CLAIM AS A PLAINTIFF OR CLASS MEMBER IN A CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION. THE ARBITRATOR MAY NOT CONSOLIDATE MORE THAN ONE PERSON&apos;S CLAIMS AND MAY NOT OTHERWISE PRESIDE OVER ANY FORM OF REPRESENTATIVE OR CLASS PROCEEDING.
            </p>
            <p>
              This class action waiver is an essential part of the agreement between you and the Operator. If this waiver is held to be unenforceable, then the entirety of Section 23 (Binding Arbitration) shall be void, but the remainder of these Terms shall remain in effect.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="25. Governing Law and Venue">
            <p>
              These Terms and any dispute arising out of or relating to them or the Service shall be governed by and construed in accordance with the laws of the United States of America and, to the extent applicable, the State of Delaware, without regard to its conflict-of-laws principles. The United Nations Convention on Contracts for the International Sale of Goods does not apply.
            </p>
            <p>
              Subject to Section 23 (Binding Arbitration), any judicial proceeding permitted under these Terms (such as a small-claims action or proceeding to enforce an arbitration award) shall be brought exclusively in the state or federal courts located in the State of Delaware, and you irrevocably consent to the personal jurisdiction and venue of those courts.
            </p>
            <p>
              Nothing in these Terms limits any mandatory rights you may have under the consumer protection laws of your jurisdiction.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="26. Force Majeure">
            <p>
              The Operator shall not be liable for any failure or delay in performance of its obligations under these Terms when caused by events beyond the Operator&apos;s reasonable control, including but not limited to acts of God, war, terrorism, civil unrest, governmental action, labor disputes, internet outages, denial-of-service attacks, failures of Third-Party Services, pandemics, or natural disasters.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="27. Assignment">
            <p>
              You may not assign, transfer, or delegate these Terms or any rights or obligations hereunder, in whole or in part, without the Operator&apos;s prior written consent. Any attempted assignment in violation of this section is void.
            </p>
            <p>
              The Operator may freely assign or transfer these Terms, in whole or in part, to any successor or affiliate, including in connection with the incorporation of Oushi as a legal entity, a merger, an acquisition, a sale of assets, or by operation of law. These Terms shall be binding upon and inure to the benefit of the parties and their respective successors and permitted assigns.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="28. Notices and Communications">
            <p>
              <strong>Notices to you.</strong> The Operator may provide notices to you under these Terms by email to the address associated with your Account, by posting on the Service, or by other reasonable means. Notices are deemed given as of the date the Operator sends them.
            </p>
            <p>
              <strong>Notices to the Operator.</strong> All legal notices to the Operator must be sent in writing to <a href="mailto:hi@oushi.app" className="link">hi@oushi.app</a> with the subject line &ldquo;Legal Notice.&rdquo; Notices are deemed given as of the date received and acknowledged by the Operator.
            </p>
            <p>
              <strong>Consent to electronic communications.</strong> You consent to receive all communications, agreements, notices, and disclosures from the Operator in electronic form, and you agree that such electronic communications satisfy any legal requirement that such communications be in writing.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="29. General Provisions">
            <p>
              <strong>Entire agreement.</strong> These Terms, together with our Privacy Policy and any other policies or terms referenced herein, constitute the entire agreement between you and the Operator regarding the Service and supersede all prior or contemporaneous agreements, communications, and proposals.
            </p>
            <p>
              <strong>Severability.</strong> If any provision of these Terms is held by a court of competent jurisdiction to be invalid, illegal, or unenforceable, the remaining provisions shall remain in full force and effect. The invalid provision shall be modified or replaced only to the extent necessary to give effect to the parties&apos; intent.
            </p>
            <p>
              <strong>No waiver.</strong> The Operator&apos;s failure to enforce any right or provision of these Terms will not be considered a waiver of that right or provision. Any waiver must be in writing.
            </p>
            <p>
              <strong>No agency.</strong> Nothing in these Terms creates any agency, partnership, joint venture, employment, or franchise relationship between you and the Operator.
            </p>
            <p>
              <strong>Construction.</strong> Section headings are for convenience only and have no legal or contractual effect. References to &ldquo;including&rdquo; mean &ldquo;including without limitation.&rdquo;
            </p>
            <p>
              <strong>Export controls.</strong> The Service may be subject to U.S. export laws and regulations. You agree to comply with all such laws and not to export, re-export, or transfer the Service to any country, person, or entity prohibited by U.S. export laws.
            </p>
            <p>
              <strong>U.S. government users.</strong> If you are a U.S. government end user, the Service is &ldquo;Commercial Computer Software&rdquo; and &ldquo;Commercial Computer Software Documentation&rdquo; as defined in FAR 12.212 and DFARS 227.7202, and is licensed with only those rights set forth in these Terms.
            </p>
            <p>
              <strong>Headings.</strong> Section headings are inserted for convenience only and do not affect the construction or interpretation of these Terms.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="30. Beta Data Risks and Best Practices">
            <p>
              Because the Service is in beta, we strongly encourage you to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-relaxed">
              <li>Continue to use your underlying Gmail account directly as your primary system of record for important communications;</li>
              <li>Manually verify any time-sensitive emails (such as legal notices, deadlines, or financial communications) directly in Gmail rather than relying solely on Oushi&apos;s briefings or rankings;</li>
              <li>Review every AI-drafted reply before clicking Send. Do not enable any future autonomous features without understanding their behavior;</li>
              <li>Export your data periodically using the in-application data export feature so you have your own copy of your boards, profile, and memory;</li>
              <li>Report bugs, unexpected behavior, or security concerns to <a href="mailto:hi@oushi.app" className="link">hi@oushi.app</a> promptly.</li>
            </ul>
            <p>
              The Operator may unilaterally restrict your use of the Service if your usage patterns suggest that you are relying on the Service in a manner that creates legal or operational risk for the Operator or other Users.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="31. Changes to These Terms">
            <p>
              The Operator may update these Terms from time to time. When the Operator makes material changes, it will update the &ldquo;Last updated&rdquo; date at the top and, where reasonable, provide notice via email or in-application notification. Material changes will become effective no earlier than fourteen (14) days after such notice, except where (a) shorter effective dates are required by law, (b) the changes are favorable to Users, or (c) the changes relate to security or legal compliance.
            </p>
            <p>
              Your continued use of the Service after the effective date of changes constitutes your acceptance of the updated Terms. If you do not agree to the updated Terms, you must stop using the Service and delete your Account.
            </p>
          </Section>

          {/* ============================ */}
          <Section title="32. Contact">
            <p>
              For questions, support requests, legal notices, or to exercise rights described in these Terms, please contact:
            </p>
            <div className="mt-2 rounded-lg border border-[#E6DCC4] bg-[#FFFCF3] px-4 py-3 text-[14px]">
              <p className="font-semibold text-[#2A2520]">Oushi (Operator)</p>
              <p className="text-[#766E63] mt-0.5">Email: <a href="mailto:hi@oushi.app" className="link">hi@oushi.app</a></p>
              <p className="text-[#766E63]">Web: <a href="https://oushi.app" className="link">oushi.app</a></p>
            </div>
            <p className="text-[12px] text-[#A89F92] mt-3">
              The Operator currently operates Oushi as an individual project. Once incorporated, this section will be updated to reflect the legal entity.
            </p>
          </Section>
        </div>
      </main>

      <footer className="border-t border-[#E6DCC4]/60 py-8 mt-12">
        <div className="max-w-2xl mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#A89F92]">
          <span>© Oushi {new Date().getFullYear()}</span>
          <div className="flex items-center gap-5">
            <Link href="/" className="hover:text-[#3D6A95]">Home</Link>
            <Link href="/privacy" className="hover:text-[#3D6A95]">Privacy</Link>
            <a href="mailto:hi@oushi.app" className="hover:text-[#3D6A95]">Contact</a>
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
          <div className="w-6 h-6 rounded-md bg-[#5E8FBF] flex items-center justify-center">
            <span className="text-white text-[12px] font-semibold leading-none">O</span>
          </div>
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
      <div className="text-[14px] leading-relaxed text-[#2A2520]">{children}</div>
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

function DefinitionList({ items }: { items: Array<{ term: string; body: string }> }) {
  return (
    <dl className="mt-2 space-y-3">
      {items.map((item) => (
        <div key={item.term} className="border-l-2 border-[#E6DCC4] pl-4 py-1">
          <dt className="text-[14px] font-semibold text-[#2A2520]">&ldquo;{item.term}&rdquo;</dt>
          <dd className="text-[14px] text-[#766E63] leading-relaxed mt-0.5">{item.body}</dd>
        </div>
      ))}
    </dl>
  );
}
