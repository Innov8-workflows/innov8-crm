"use client";

export default function Referrals() {
  return (
    <div className="flex-1 overflow-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--accent)" }}>Innov8 Workflows</p>
        <h1 className="text-3xl font-bold mb-1">Referral <span style={{ color: "var(--accent)" }}>Programme</span></h1>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>Turn happy clients into your best salespeople</p>
      </div>

      {/* Rewards Tiers */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-dim)" }}>Referral Rewards</p>
        <h2 className="text-lg font-bold mb-0.5" style={{ color: "var(--text)" }}>What the referrer gets</h2>
        <p className="text-xs mb-4" style={{ color: "var(--text-quaternary)" }}>Paid out after the new client&apos;s first full month&apos;s payment clears</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <RewardCard
            tier="Cash Reward"
            amount="£50"
            detail="Paid via bank transfer"
            color="#22c55e"
            icon="💷"
          />
          <RewardCard
            tier="Service Credit"
            amount="1 Month Free"
            detail="Applied to their own subscription"
            color="var(--accent)"
            icon="🎁"
            popular
          />
          <RewardCard
            tier="Loyalty Stack"
            amount="3+ Referrals"
            detail="Lifetime 20% off their monthly fee"
            color="#3b82f6"
            icon="🏆"
          />
        </div>
      </div>

      {/* New Client Incentive */}
      <div className="rounded-xl p-5" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent)" }}>
        <div className="flex items-start gap-4">
          <div className="text-3xl">🎯</div>
          <div className="flex-1">
            <h3 className="text-base font-bold mb-1" style={{ color: "var(--accent)" }}>New Client Also Gets £50 Off</h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              When someone is referred to Innov8, they get <span className="font-semibold" style={{ color: "var(--text)" }}>£50 off their upfront cost</span> (or their first month free on T1).
              This makes the &quot;can you recommend anyone&quot; ask much easier — your client looks generous, not pushy.
            </p>
          </div>
        </div>
      </div>

      {/* How to Ask for Referrals */}
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
              <p>Quick one — do you know any other local businesses like yours who could do with a site? I look after mates of clients properly: they get £50 off their setup, and you get £50 cash or a free month on your subscription.
              </p>
            </div>
            <ScriptLine speaker="You" text={`"No pressure at all — just pass my details on if anyone springs to mind."`} />
          </div>
        </div>
      </div>

      {/* Referral Sources */}
      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Best Sources of Referrals</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SourceCard emoji="🧱" title="Same Trade, Different Area" note="A plumber in Leeds won&apos;t view one in Manchester as competition — they chat in trade groups." />
          <SourceCard emoji="🤝" title="Complementary Trades" note="Plumber → electrician → builder → tiler. They work on the same jobs and refer each other already." />
          <SourceCard emoji="👨‍👩‍👧" title="Family & Friends in Trade" note="Ask &quot;any family or mates in a trade?&quot; — often the easiest intro they can make." />
          <SourceCard emoji="📣" title="Trade Facebook Groups" note="Ask if they&apos;d post your work in their local trade group. Reach 100+ businesses instantly." />
          <SourceCard emoji="🏢" title="Local Business Networks" note="BNI, Chamber of Commerce, local business meetups — your client may attend these." />
          <SourceCard emoji="⭐" title="Google Review Gold Mine" note="Anyone who left a 5-star review is already willing to vouch publicly — perfect referrer." />
        </div>
      </div>

      {/* Tracking Guide */}
      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>How to Track a Referral</h3>
        <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          <TrackStep number="1" text="When a lead says they were referred, add them on the Prospects board with business type tagged as usual." />
          <TrackStep number="2" text="Add the referrer&apos;s name to the lead&apos;s notes: &quot;Referred by [Client Name]&quot;." />
          <TrackStep number="3" text="When the deal closes, message the referrer: &quot;Great news — [new client] just signed up. Cash or free month?&quot;" />
          <TrackStep number="4" text="Pay out within 7 days of the new client&apos;s first cleared payment. Speed builds trust for future referrals." />
          <TrackStep number="5" text="Log the reward on the referrer&apos;s Live Client record so you can track lifetime referral value." />
        </div>
      </div>

      {/* Goals */}
      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Target Metrics</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Referral Rate" value="25%" detail="of new clients from referrals" color="#22c55e" />
          <MetricCard label="Avg per Client" value="1.5" detail="referrals over lifetime" color="var(--accent)" />
          <MetricCard label="Conversion" value="60%" detail="referrals → paid clients" color="#3b82f6" />
          <MetricCard label="CAC" value="£50" detail="vs £250+ cold outreach" color="#8b5cf6" />
        </div>
      </div>
    </div>
  );
}

function RewardCard({ tier, amount, detail, color, icon, popular }: { tier: string; amount: string; detail: string; color: string; icon: string; popular?: boolean }) {
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
      <div className="text-center mb-3">
        <div className="text-4xl mb-2">{icon}</div>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{tier}</span>
      </div>
      <div className="text-center space-y-1">
        <div className="text-2xl font-bold" style={{ color }}>{amount}</div>
        <div className="text-xs" style={{ color: "var(--text-dim)" }}>{detail}</div>
      </div>
    </div>
  );
}

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

function SourceCard({ emoji, title, note }: { emoji: string; title: string; note: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="flex items-start gap-2 mb-2">
        <span className="text-lg flex-shrink-0">{emoji}</span>
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{title}</p>
      </div>
      <p className="text-xs pl-7" style={{ color: "var(--text-dim)" }}>{note}</p>
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
