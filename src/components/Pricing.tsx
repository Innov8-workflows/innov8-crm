"use client";

export default function Pricing() {
  return (
    <div className="flex-1 overflow-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--accent)" }}>Innov8 Workflows</p>
        <h1 className="text-3xl font-bold mb-1">Pricing <span style={{ color: "var(--accent)" }}>Structure</span></h1>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>Website product — all tiers include hosting &amp; support</p>
      </div>

      {/* Tier 1 Market: Blue Collar Trades */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-dim)" }}>Tier 1 Market</p>
        <h2 className="text-lg font-bold mb-0.5" style={{ color: "var(--text)" }}>Blue Collar Trades</h2>
        <p className="text-xs mb-4" style={{ color: "var(--text-quaternary)" }}>Plumbers &middot; Electricians &middot; Construction &middot; Heating engineers</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <PricingCard tier="T1" upfront="£0" monthly="£85/pm" color="#22c55e" label="No upfront cost" popular={false} />
          <PricingCard tier="T2" upfront="£299" monthly="£50/pm" color="var(--accent)" label="Mid-range" popular={true} />
          <PricingCard tier="T3" upfront="£499" monthly="£30/pm" color="#ef4444" label="Best value long-term" popular={false} />
        </div>
      </div>

      {/* Tier 2 Market: Social / Lifestyle */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-dim)" }}>Tier 2 Market</p>
        <h2 className="text-lg font-bold mb-0.5" style={{ color: "var(--text)" }}>Social / Lifestyle</h2>
        <p className="text-xs mb-4" style={{ color: "var(--text-quaternary)" }}>Dog groomers &middot; Beauticians &middot; Hairdressers &middot; Barbers</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <PricingCard tier="T1" upfront="£0" monthly="£50/pm" color="#22c55e" label="No upfront cost" popular={false} />
          <PricingCard tier="T2" upfront="£149" monthly="£35/pm" color="var(--accent)" label="Mid-range" popular={true} />
          <PricingCard tier="T3" upfront="£299" monthly="£20/pm" color="#ef4444" label="Best value long-term" popular={false} />
        </div>
        <div className="mt-3 px-4 py-2 rounded-lg text-xs" style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}>
          &#9888; T3 at £20/pm is your absolute floor — any lower and support becomes unviable.
        </div>
      </div>

      {/* Sales Script */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Sales Script</h3>
          <div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            <ScriptLine speaker="You" text={`"Hey is that XXX?"`} />
            <ScriptLine speaker="Them" text={`"Yes it is"`} dim />
            <ScriptLine speaker="You" text={`"Brilliant, how are you today?"`} />
            <ScriptLine speaker="Them" text={`"Not bad, yourself?"`} dim />
            <ScriptLine speaker="You" text={`"Yes, not bad at all..."`} />
            <div className="pl-4" style={{ borderLeft: "2px solid var(--accent)", color: "var(--text)" }}>
              <p>I noticed you didn&apos;t have a website on Facebook, so I went ahead and built you a demo one using your reviews and pictures, and sent this across on messenger, did you manage to have a look at it?</p>
            </div>
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

      {/* Best Times to Call */}
      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>Best Times to Call — UK Local Trades</h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-quaternary)" }}>Tradespeople are on-site most of the day. Target quiet windows when they can actually talk.</p>

        {/* Time of day heatmap */}
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Daily Windows</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <TimeSlot time="7:00 – 8:00 AM" rating="good" label="Early Brew" note="Before they leave for site. Caught in the van getting ready." />
            <TimeSlot time="12:00 – 1:30 PM" rating="best" label="Lunch Break" note="Sat in the van eating a sandwich — prime window for a chat." />
            <TimeSlot time="4:30 – 6:00 PM" rating="best" label="Wrapping Up" note="Job&apos;s winding down, driving home, admin mode on." />
            <TimeSlot time="6:00 – 7:30 PM" rating="good" label="Home Hours" note="Done for the day, relaxed, more likely to listen properly." />
          </div>
        </div>

        {/* Avoid times */}
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Avoid These Windows</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TimeSlot time="8:00 – 11:30 AM" rating="avoid" label="On Site" note="Deep in the job, tools out, won&apos;t answer or will be annoyed." />
            <TimeSlot time="1:30 – 4:30 PM" rating="avoid" label="Afternoon Push" note="Racing to finish the day&apos;s work. Not the time." />
            <TimeSlot time="After 8:00 PM" rating="avoid" label="Family Time" note="Disrespects their evening. Unprofessional — and they&apos;ll remember." />
          </div>
        </div>

        {/* Days of the week */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Best Days of the Week</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <DayCard day="Mon" rating="poor" note="Mondays are chaos — enquiries pile up from weekend. Avoid before noon." />
            <DayCard day="Tue" rating="good" note="Settled into the week. Lunch & evening calls land well." />
            <DayCard day="Wed" rating="best" note="Midweek sweet spot. Most open to a chat, less rushed." />
            <DayCard day="Thu" rating="best" note="Thinking about wrapping up the week. Receptive to new ideas." />
            <DayCard day="Fri" rating="good" note="Good morning to lunch. Afternoons they bolt early — avoid." />
            <DayCard day="Sat" rating="ok" note="Only 'til lunchtime. Family time after. Some trades work all day." />
            <DayCard day="Sun" rating="avoid" note="Never. Only exception: pre-booked appointment." />
          </div>
        </div>

        {/* Pro tips */}
        <div className="mt-6 p-4 rounded-lg" style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--accent)" }}>💡 Pro Tips</p>
          <ul className="text-sm space-y-1.5" style={{ color: "var(--text-secondary)" }}>
            <li>• <span style={{ color: "var(--text)" }}>Rainy days</span> are golden — jobs get cancelled, they&apos;re stuck indoors, more chatty</li>
            <li>• <span style={{ color: "var(--text)" }}>End of month</span> trades are chasing invoices. They understand &quot;I&apos;m helping you get more jobs&quot; instantly</li>
            <li>• <span style={{ color: "var(--text)" }}>January &amp; post-summer lull</span> are prime — they want to know where next month&apos;s work is coming from</li>
            <li>• <span style={{ color: "var(--text)" }}>Bank holidays</span> Tuesday after is worst day of the year. Skip it.</li>
            <li>• If they say &quot;I&apos;m on a job&quot;, ask <span style={{ color: "var(--text)" }}>&quot;what time tonight works?&quot;</span> — 80% will give you a window</li>
          </ul>
        </div>
      </div>

      {/* Discovery Questions */}
      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Discovery Questions — Keep the Conversation Going</h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-quaternary)" }}>Use these to understand their situation and keep things natural. Don&apos;t fire them off like a checklist — weave them in.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuestionCard emoji="🤔" question="Have you just not got round to getting a website?" note="Opens the door — most say yes, which means they already want one" />
          <QuestionCard emoji="💷" question="Has price been a big factor in why you haven't got one?" note="If yes, perfect lead-in to T1 at £0 upfront" />
          <QuestionCard emoji="📸" question="Have you had a chance to look at the before & afters section?" note="Draws attention to the gallery — visual proof of quality" />
          <QuestionCard emoji="📱" question="How do most of your customers find you at the moment?" note="Reveals their reliance on Facebook/word of mouth — your angle" />
          <QuestionCard emoji="⭐" question="I saw you've got some cracking reviews — do you get many enquiries from them?" note="Compliment + shows you've done your homework" />
          <QuestionCard emoji="🔍" question="Have you ever Googled your trade in your area and seen who comes up?" note="Plants the SEO seed — they'll check after the call" />
          <QuestionCard emoji="📞" question="Do you get much work over the quieter months?" note="If yes, great. If no — that's exactly what a website helps with" />
          <QuestionCard emoji="🏆" question="What would set you apart from the competition if someone was comparing?" note="Gets them talking about their USP — use it to show how the site highlights that" />
          <QuestionCard emoji="🌐" question="If someone searched for a [plumber/groomer/etc] near you right now, would they find you?" note="Rhetorical usually — makes them realise the gap" />
        </div>
      </div>

      {/* Quick Reference */}
      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>Quick Reference — Objection Handling</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ObjectionCard objection="I already have a website" response="That's fair enough — I had a quick look at it actually. I just thought with the one I've built, it might be worth comparing the two side by side and seeing which one you prefer. No pressure at all." />
          <ObjectionCard objection="I get enough work from Facebook" response="That's great to hear, honestly. Facebook's brilliant for that. I just think having your own site as well means you're not fully relying on one platform — if the algorithm changes or your page gets restricted, you've always got your own space online." />
          <ObjectionCard objection="I can't afford it" response="Totally understand — that's exactly why we do the first option at £0 upfront. It's just a small monthly, and realistically one extra job from it would cover that many times over. But no pressure, it's completely up to you." />
          <ObjectionCard objection="I'll think about it" response="Of course, take your time — the demo site's there for you to look at whenever you're ready. I'll leave it live so you can show anyone. Just bear in mind I only work with one business per trade per area, so if someone else in your patch reaches out first, I'd have to prioritise them." />
          <ObjectionCard objection="Sorry, I'm not interested" response="No worries at all, I completely respect that. I'll leave the demo site live for you anyway — it's already built so it's no hassle. If you ever change your mind or want to have another look down the line, just drop me a message. All the best with the business either way." />
          <ObjectionCard objection="I don't really understand websites" response="Honestly you don't need to — that's what I'm here for. I handle absolutely everything: the design, the hosting, keeping it updated. You just carry on doing what you do best and the site works away in the background bringing in enquiries." />
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

function TimeSlot({ time, rating, label, note }: { time: string; rating: "best" | "good" | "avoid"; label: string; note: string }) {
  const colors = {
    best: { bg: "#22c55e20", border: "#22c55e", text: "#22c55e", badge: "BEST" },
    good: { bg: "var(--accent-subtle)", border: "var(--accent)", text: "var(--accent)", badge: "GOOD" },
    avoid: { bg: "#ef444420", border: "#ef4444", text: "#ef4444", badge: "AVOID" },
  }[rating];
  return (
    <div className="rounded-lg p-3" style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold" style={{ color: colors.text }}>{colors.badge}</span>
        <span className="text-[10px] font-mono" style={{ color: "var(--text-dim)" }}>{time}</span>
      </div>
      <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--text)" }}>{label}</p>
      <p className="text-xs" style={{ color: "var(--text-dim)" }}>{note}</p>
    </div>
  );
}

function DayCard({ day, rating, note }: { day: string; rating: "best" | "good" | "ok" | "poor" | "avoid"; note: string }) {
  const colors = {
    best: { bg: "#22c55e25", text: "#22c55e", label: "Best" },
    good: { bg: "var(--accent-subtle)", text: "var(--accent)", label: "Good" },
    ok: { bg: "var(--surface2)", text: "var(--text-muted)", label: "OK" },
    poor: { bg: "#f59e0b20", text: "#f59e0b", label: "Poor" },
    avoid: { bg: "#ef444420", text: "#ef4444", label: "Avoid" },
  }[rating];
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: colors.bg, border: `1px solid ${colors.text}40` }} title={note}>
      <div className="text-sm font-bold mb-1" style={{ color: "var(--text)" }}>{day}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: colors.text }}>{colors.label}</div>
    </div>
  );
}

function QuestionCard({ emoji, question, note }: { emoji: string; question: string; note: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div className="flex items-start gap-2 mb-2">
        <span className="text-lg flex-shrink-0">{emoji}</span>
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>&ldquo;{question}&rdquo;</p>
      </div>
      <p className="text-xs pl-7" style={{ color: "var(--text-dim)" }}>{note}</p>
    </div>
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
