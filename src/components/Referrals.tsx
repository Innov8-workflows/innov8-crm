"use client";

import Icon, { type IconName } from "./Icon";

export default function Referrals() {
  return (
    <div className="flex-1 overflow-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--accent)" }}>Innov8 Workflows</p>
        <h1 className="text-3xl font-bold mb-1">
          Refer &amp; <span style={{ color: "var(--accent)" }}>Unlock Rewards</span>
        </h1>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Earn <span style={{ color: "#22c55e", fontWeight: 600 }}>lifetime savings</span> and unlock <span style={{ color: "var(--accent)", fontWeight: 600 }}>partner perks</span>
        </p>
      </div>

      {/* Three Tier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tier 1 — Green Star */}
        <TierCard
          icon={<StarIcon />}
          tierLabel="TIER 1"
          tierLabelColor="#22c55e"
          referrals="1 Referral"
          discount="5% OFF"
          discountSub="lifetime"
          color="#22c55e"
          accentIcon={<RocketIcon />}
        />

        {/* Tier 2 — Orange Medal */}
        <TierCard
          icon={<MedalIcon />}
          tierLabel="TIER 2"
          tierLabelColor="var(--accent)"
          referrals="5 Referrals"
          discount="10% OFF"
          discountSub="lifetime (max)"
          color="var(--accent)"
          accentIcon={<ChartIcon />}
        />

        {/* Tier 3 — Yellow Crown — BOSS LEVEL */}
        <TierCard
          icon={<CrownIcon />}
          tierLabel="★ TIER 3 — BOSS LEVEL ★"
          tierLabelColor="#facc15"
          referrals="10 Referrals"
          discount="10% OFF"
          discountSub="lifetime (max)"
          color="#facc15"
          glow
          extras={[
            { icon: <ShieldIcon />, title: "Growth Partner Status", body: "Exclusive partner perks and priority support." },
            { icon: <UpgradeIcon />, title: "Annual SEO & Performance Upgrade", body: "We optimise your site every year to keep you ahead of the competition." },
          ]}
        />
      </div>

      {/* How It Works */}
      <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest flex-shrink-0" style={{ color: "var(--text-dim)" }}>How It Works</h3>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-2 flex-1 w-full">
            <Step number="1" color="#22c55e" title="Refer" body="Share your unique link with businesses you know." />
            <Arrow />
            <Step number="2" color="var(--accent)" title="They Sign Up" body="They choose any paid plan." />
            <Arrow />
            <Step number="3" color="#facc15" title="You Unlock Rewards" body="You climb the tiers and unlock bigger rewards." />
          </div>
        </div>
      </div>

      {/* When to Ask + Script */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>When to Ask</h3>
          <div className="space-y-3 text-sm">
            <TimingItem number="1" title="Right after launch" text="They&apos;re buzzing about the site — perfect moment to ask while excitement is high." />
            <TimingItem number="2" title="After their first enquiry from the site" text="Ride the win: &quot;Brilliant news on that lead — do you know any other local businesses who&apos;d love the same?&quot;" />
            <TimingItem number="3" title="On the monthly check-in call" text="Regular touchpoint — casually drop in the referral programme." />
            <TimingItem number="4" title="After a 5-star Google review" text="If they&apos;ve just publicly raved, they&apos;ll be happy to privately recommend too." />
          </div>
        </div>

        <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>The Ask Script</h3>
          <div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            <ScriptLine speaker="You" text={`"Really pleased you're happy with how it's gone..."`} />
            <div className="pl-4" style={{ borderLeft: "2px solid var(--accent)", color: "var(--text)" }}>
              <p>Quick one — do you know any other local businesses who could do with a site? I&apos;ve got a referral programme on the go: every business you send my way gets you <span style={{ color: "#22c55e", fontWeight: 600 }}>5% off your monthly fee for life</span>, and it stacks. Five referrals locks in 10% lifetime, ten unlocks Boss Level — annual SEO upgrades and priority support included.</p>
            </div>
            <ScriptLine speaker="You" text={`"No pressure at all — I'll send you your unique link, just pass it on if anyone springs to mind."`} />
          </div>
        </div>
      </div>

      {/* Referral Sources */}
      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Best Sources of Referrals</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SourceCard icon="map" title="Same Trade, Different Area" note="A plumber in Leeds won&apos;t view one in Manchester as competition — they chat in trade groups." />
          <SourceCard icon="user-group" title="Complementary Trades" note="Plumber → electrician → builder → tiler. They work on the same jobs and refer each other already." />
          <SourceCard icon="users" title="Family & Friends in Trade" note="Ask &quot;any family or mates in a trade?&quot; — often the easiest intro they can make." />
          <SourceCard icon="megaphone" title="Trade Facebook Groups" note="Ask if they&apos;d post your work in their local trade group. Reach 100+ businesses instantly." />
          <SourceCard icon="building" title="Local Business Networks" note="BNI, Chamber of Commerce, local business meetups — your client may attend these." />
          <SourceCard icon="star" title="Google Review Gold Mine" note="Anyone who left a 5-star review is already willing to vouch publicly — perfect referrer." />
        </div>
      </div>

      {/* Tracking Guide */}
      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>How to Track a Referral</h3>
        <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          <TrackStep number="1" text="When a lead says they were referred, add them on the Prospects board with business type tagged as usual." />
          <TrackStep number="2" text="Add the referrer&apos;s name to the lead&apos;s notes: &quot;Referred by [Client Name]&quot;." />
          <TrackStep number="3" text="When the deal closes, increment the referrer&apos;s referral count. Apply the lifetime discount on their next billing cycle if they&apos;ve hit a new tier." />
          <TrackStep number="4" text="Message the referrer the same day: &quot;Brilliant news — [new client] just signed. You&apos;re now on Tier X — your monthly fee drops by Y% from your next bill.&quot;" />
          <TrackStep number="5" text="At Tier 3 (Boss Level), schedule the annual SEO & performance upgrade — diary it 12 months from their original launch date." />
        </div>
      </div>

      {/* Target Metrics */}
      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Target Metrics</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Referral Rate" value="25%" detail="of new clients from referrals" color="#22c55e" />
          <MetricCard label="Avg per Client" value="1.5" detail="referrals over lifetime" color="var(--accent)" />
          <MetricCard label="Conversion" value="60%" detail="referrals → paid clients" color="#3b82f6" />
          <MetricCard label="Boss Level" value="10%" detail="of clients reach Tier 3" color="#facc15" />
        </div>
      </div>
    </div>
  );
}

// ─── Tier card ───
function TierCard({
  icon, tierLabel, tierLabelColor, referrals, discount, discountSub, color, accentIcon, glow = false, extras,
}: {
  icon: React.ReactNode;
  tierLabel: string;
  tierLabelColor: string;
  referrals: string;
  discount: string;
  discountSub: string;
  color: string;
  accentIcon?: React.ReactNode;
  glow?: boolean;
  extras?: Array<{ icon: React.ReactNode; title: string; body: string }>;
}) {
  return (
    <div className="rounded-2xl p-6 relative flex flex-col" style={{
      background: "var(--surface)",
      border: `2px solid ${color}`,
      boxShadow: glow ? `0 0 30px ${color}40` : "none",
      minHeight: 360,
    }}>
      {/* Icon badge */}
      <div className="flex justify-center -mt-12 mb-3">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{
          background: "var(--surface)",
          border: `2px solid ${color}`,
          boxShadow: glow ? `0 0 20px ${color}60` : "none",
        }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>

      {/* Tier label pill */}
      <div className="flex justify-center mb-4">
        <span className="text-xs font-bold tracking-widest px-3 py-1 rounded-full" style={{
          background: `${tierLabelColor}25`,
          color: tierLabelColor,
        }}>{tierLabel}</span>
      </div>

      {/* Referrals number */}
      <div className="text-center mb-3 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-3xl font-bold" style={{ color: "var(--text)" }}>
          <span style={{ color }}>{referrals.split(" ")[0]}</span> {referrals.split(" ").slice(1).join(" ")}
        </p>
      </div>

      {/* Discount */}
      <div className="text-center mb-3">
        <p className="text-4xl font-bold" style={{ color }}>{discount}</p>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>{discountSub}</p>
      </div>

      {/* Accent icon (rocket / chart) for tier 1+2 */}
      {accentIcon && !extras && (
        <div className="flex-1 flex items-end justify-center pb-2">
          <span style={{ color }} className="text-3xl opacity-60">{accentIcon}</span>
        </div>
      )}

      {/* Extras list (for Boss Level) */}
      {extras && (
        <div className="space-y-3 mt-2">
          {extras.map((ex, i) => (
            <div key={i} className="flex items-start gap-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                background: `${color}20`,
                border: `1px solid ${color}50`,
              }}>
                <span style={{ color }}>{ex.icon}</span>
              </div>
              <div>
                <p className="text-sm font-bold mb-0.5" style={{ color: "var(--text)" }}>{ex.title}</p>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>{ex.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── How-it-works step ───
function Step({ number, color, title, body }: { number: string; color: string; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 flex-1 min-w-0">
      <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold flex-shrink-0" style={{
        background: `${color}25`,
        border: `2px solid ${color}`,
        color,
      }}>{number}</div>
      <div className="min-w-0">
        <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{title}</p>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>{body}</p>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="hidden sm:flex items-center justify-center flex-shrink-0" style={{ color: "var(--text-quaternary)" }}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

// ─── SVG icons ───
function StarIcon() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  );
}

function MedalIcon() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9a9.75 9.75 0 119 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-3.92-3.92m0 0l3.92-3.92m-3.92 3.92H21M3 3l3.5 3.5L3 10" opacity="0.4" />
      <circle cx="12" cy="9" r="4" strokeWidth="2" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
      <path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5zm14 3H5a1 1 0 100 2h14a1 1 0 100-2z" />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" d="M12 2.25l8.954 3.354A.75.75 0 0121.5 6.32V12c0 5.59-3.84 9.985-9.05 11.49a.75.75 0 01-.4 0C6.84 21.985 3 17.59 3 12V6.32a.75.75 0 01.546-.716L12 2.25zm-1.06 12.31l-3-3 1.06-1.06 1.94 1.94 4.94-4.94 1.06 1.06-6 6z" clipRule="evenodd" />
    </svg>
  );
}

function UpgradeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

// ─── Supporting components (reused) ───
function ScriptLine({ speaker, text }: { speaker: string; text: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-xs font-bold flex-shrink-0 w-10" style={{ color: "var(--accent)" }}>{speaker}</span>
      <span style={{ color: "var(--text-secondary)" }}>{text}</span>
    </div>
  );
}

function TimingItem({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
        {number}
      </div>
      <div>
        <p className="font-medium mb-0.5" style={{ color: "var(--text)" }}>{title}</p>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>{text}</p>
      </div>
    </div>
  );
}

function SourceCard({ icon, title, note }: { icon: IconName; title: string; note: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="flex items-start gap-2 mb-2">
        <span className="flex-shrink-0 mt-0.5" style={{ color: "var(--accent)" }}><Icon name={icon} className="w-4 h-4" /></span>
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{title}</p>
      </div>
      <p className="text-xs pl-6" style={{ color: "var(--text-dim)" }}>{note}</p>
    </div>
  );
}

function TrackStep({ number, text }: { number: string; text: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "var(--surface2)", color: "var(--accent)", border: "1px solid var(--border)" }}>
        {number}
      </div>
      <p className="pt-0.5" style={{ color: "var(--text-secondary)" }}>{text}</p>
    </div>
  );
}

function MetricCard({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return (
    <div className="rounded-lg p-4 text-center" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>{label}</div>
      <div className="text-2xl font-bold mb-1" style={{ color }}>{value}</div>
      <div className="text-xs" style={{ color: "var(--text-quaternary)" }}>{detail}</div>
    </div>
  );
}
