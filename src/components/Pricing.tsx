"use client";

export default function Pricing() {
  return (
    <div className="flex-1 overflow-auto p-6 space-y-8">
      {/* Blue Collar Trades */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>Blue Collar Pricing Structure</h2>
        <p className="text-xs mb-4" style={{ color: "var(--text-quaternary)" }}>Plumbers, Electricians, Construction, etc</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <PricingCard tier="T1" upfront="£0" monthly="£85/pm" color="#22c55e" label="No upfront cost" popular={false} />
          <PricingCard tier="T2" upfront="£299" monthly="£50/pm" color="var(--accent)" label="Mid-range" popular={true} />
          <PricingCard tier="T3" upfront="£499" monthly="£30/pm" color="#3b82f6" label="Best value long-term" popular={false} />
        </div>
      </div>

      {/* Social / Lifestyle */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>Social / Lifestyle Pricing Structure</h2>
        <p className="text-xs mb-4" style={{ color: "var(--text-quaternary)" }}>Dog groomers, Beauticians, Hairdressers, etc</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <PricingCard tier="T1" upfront="£0" monthly="£65/pm" color="#22c55e" label="No upfront cost" popular={false} />
          <PricingCard tier="T2" upfront="£199" monthly="£40/pm" color="var(--accent)" label="Mid-range" popular={true} />
          <PricingCard tier="T3" upfront="£399" monthly="£25/pm" color="#3b82f6" label="Best value long-term" popular={false} />
        </div>
      </div>

      {/* Sales Script */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Sales Script</h3>
          <div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            <ScriptLine speaker="You" text={`"Hey is that XXX, how are you?"`} />
            <ScriptLine speaker="Them" text={`"Not bad,"`} dim />
            <div className="pl-4" style={{ borderLeft: "2px solid var(--accent)", color: "var(--text)" }}>
              <p>I noticed you didn&apos;t have a website on Facebook, so I&apos;ve gone ahead and built you one using your reviews and pictures, I&apos;ve sent this across to you.</p>
            </div>
            <ScriptLine speaker="You" text={`"Did you manage to have a look at it? It would be a shame you haven't seen it"`} />
          </div>
        </div>

        <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Value / Benefits</h3>
          <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
            More enquiries — this helps out when quiet during summer:
          </p>
          <ul className="space-y-2">
            <BenefitItem text="Branding & personalisation — logo, brand colours, real pictures" />
            <BenefitItem text="Click-to-call button" />
            <BenefitItem text="Before & after gallery" />
            <BenefitItem text="Google Reviews integration" />
            <BenefitItem text="Mobile-first responsive design" />
            <BenefitItem text="SEO optimised for local searches" />
            <BenefitItem text="Fast loading — no WordPress bloat" />
            <BenefitItem text="Free hosting included" />
          </ul>
        </div>
      </div>

      {/* Quick Reference */}
      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Quick Reference — Objection Handling</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ObjectionCard objection="I already have a website" response="Have a look at yours vs the one I've built — which looks more professional? Plus yours isn't ranking on Google." />
          <ObjectionCard objection="I get enough work from Facebook" response="Facebook's great for now, but what happens when the algorithm changes? A website means you own your online presence." />
          <ObjectionCard objection="I can't afford it" response="T1 is £0 upfront. And one extra job a month from the website pays for itself many times over." />
          <ObjectionCard objection="I'll think about it" response="No problem — the demo site will stay live for you to look at. But the offer is first-come-first-served in your area." />
        </div>
      </div>
    </div>
  );
}

function PricingCard({ tier, upfront, monthly, color, label, popular }: { tier: string; upfront: string; monthly: string; color: string; label: string; popular: boolean }) {
  return (
    <div className="rounded-xl p-5 relative" style={{
      background: "var(--surface)",
      border: popular ? `2px solid ${color}` : "1px solid var(--border)",
      boxShadow: popular ? `0 0 20px ${color}20` : "none",
    }}>
      {popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold"
          style={{ background: color, color: "#fff" }}>Most Popular</span>
      )}
      <div className="text-center mb-4">
        <span className="text-lg font-bold" style={{ color }}>{tier}</span>
        <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>{label}</p>
      </div>
      <div className="text-center space-y-1 mb-4">
        <div className="text-3xl font-bold" style={{ color: "var(--text)" }}>{upfront}</div>
        <div className="text-xs" style={{ color: "var(--text-dim)" }}>upfront</div>
      </div>
      <div className="text-center py-3 rounded-lg" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
        <span className="text-xl font-bold" style={{ color }}>{monthly}</span>
      </div>
    </div>
  );
}

function ScriptLine({ speaker, text, dim }: { speaker: string; text: string; dim?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-xs font-bold flex-shrink-0 w-10" style={{ color: dim ? "var(--text-quaternary)" : "var(--accent)" }}>{speaker}</span>
      <span style={{ color: dim ? "var(--text-dim)" : "var(--text-secondary)" }}>{text}</span>
    </div>
  );
}

function BenefitItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
      <span className="mt-0.5 flex-shrink-0" style={{ color: "var(--accent)" }}>&#10003;</span>
      {text}
    </li>
  );
}

function ObjectionCard({ objection, response }: { objection: string; response: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <p className="text-sm font-medium mb-2" style={{ color: "#ef4444" }}>&ldquo;{objection}&rdquo;</p>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{response}</p>
    </div>
  );
}
