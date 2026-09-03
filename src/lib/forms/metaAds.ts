// The Meta ad creatives questionnaire, as data.
//
// Jay sells Meta Ads Management at £600/month with 15 leads guaranteed or the
// fee is refunded. Every campaign stalls in the same place: getting usable
// creative out of the client. It arrives over WhatsApp, one clip at a time, and
// WhatsApp's compression ruins half of it before it lands.
//
// THE GRADES ARE THE CLIENT'S LANGUAGE, NOT OURS. Jay's own definitions:
//   Grade A — "Video assets of owner face to camera, talking, customer 30
//             second interview". Video, with a real person SPEAKING.
//   Grade B — "Images of the owner infront of branded vehicle, shaking customer
//             hand". Stills, with a real person and visible branding.
//   Grade C — "B-roll video with AI voiceover, AI generated content — i kind of
//             want to avoid this tbh".
//
// So this form asks for A and B. Grade C is not a client-upload tier at all —
// it is what Jay makes when A and B don't exist — but there is one small,
// deliberately unflattering slot for raw silent job footage at the very bottom.
// A client who sends nothing is worse than a client who sends b-roll, and
// naming it as second best is what pushes them to film properly next month.
//
// WHAT IS REQUIRED AND WHY. Only the things that genuinely stop a campaign:
// the offer, the towns, where leads land, permission to use people's faces, one
// Grade A video and two Grade B photos. Nothing here blocks submitting — the
// CRM shows what is still owed so Jay can chase specifics instead of asking
// "did you send the stuff?".
//
// See ./types.ts for the claims-safety rule behind `claimGated`.

import { defineForm, type Section } from "./types";

const SECTIONS: Section[] = [
  {
    id: "basics",
    title: "The basics",
    intro:
      "Short section. We only need enough to build the ads — if we've already built your website, " +
      "most of this we have.",
    fields: [
      { id: "business_name", label: "Business name", type: "text", required: true },
      { id: "owner_name", label: "Your name", type: "text", required: true,
        help: "The name that goes on the ads. People buy from a person." },
      { id: "phone_mobile", label: "Mobile number", type: "tel", required: true },
      { id: "whatsapp", label: "WhatsApp number, if different", type: "tel" },
      { id: "email", label: "Email address", type: "email", required: true },
      { id: "website", label: "Your website, if you have one", type: "url",
        help: "Leave it blank if you haven't got one — it doesn't stop us running ads." },
      { id: "logo", label: "Your logo", type: "upload", required: true,
        help: "The best quality version you have — the original design file if you've got it. " +
              "A logo pulled off Facebook comes out blurry at ad sizes and it makes the whole ad look cheap.",
        upload: { role: "logo", max: 5, accept: "image" } },
    ],
  },
  {
    id: "facebook",
    title: "Your Facebook and Instagram",
    intro:
      "Ads run from your Facebook business page, so this section decides whether we start next week " +
      "or spend a fortnight chasing access.",
    fields: [
      { id: "fb_page_exists", label: "Do you have a Facebook business page?", type: "radio", required: true,
        options: ["Yes", "No", "Not sure"],
        help: "A business page, not your personal profile. Ads can't run without one — if you " +
              "haven't got one we'll set it up." },
      { id: "facebook_page", label: "Link to your page", type: "url",
        showIf: { field: "fb_page_exists", equals: "Yes" } },
      { id: "instagram", label: "Instagram, if you use it", type: "url",
        help: "Ads usually run on both. Worth having even if you rarely post." },
      { id: "page_manager", label: "Who runs the page at the moment?", type: "text",
        help: "We need admin access to advertise from it. If it was set up years ago by someone " +
              "you've lost touch with, say so now — that is the single most common thing that " +
              "delays a launch, and it's far easier to sort before we start." },
      { id: "ads_before", label: "Have you advertised on Facebook before?", type: "radio",
        options: ["Never", "Boosted a post", "Ran proper ads myself", "Someone ran them for me"] },
      { id: "ads_experience", label: "If you have, how did it go?", type: "textarea",
        help: "Honestly. What went wrong is more useful to us than what went right." },
      { id: "ad_account", label: "Do you already have a Meta ad account?", type: "radio",
        options: ["Yes", "No", "Not sure"],
        help: '"Not sure" is a perfectly normal answer — we can check.' },
    ],
  },
  {
    id: "offer",
    title: "What you want the ads to bring in",
    intro: "The ads are only as good as the offer behind them. This is the part worth thinking about.",
    fields: [
      { id: "want_work", label: "The work you want more of", type: "textarea", required: true,
        help: "Be specific. \"Full re-roofs\" gets you a different campaign to \"anything going\"." },
      { id: "avoid_work", label: "The work you'd rather not get", type: "textarea",
        help: "Just as useful. Small repairs, insurance jobs, anything that wastes your time — " +
              "we can steer away from it." },
      { id: "offer_hook", label: "What's the offer?", type: "text", required: true,
        placeholder: "Free roof check, no obligation",
        help: "The reason someone stops scrolling. \"Free roof check\", \"Free no-obligation quote\", " +
              "\"£250 off a full re-roof this month\". \"Contact us\" is not an offer — everyone " +
              "says that, and it's why most trade ads do nothing." },
      { id: "job_value", label: "What's a typical job worth?", type: "text", placeholder: "£2,000 to £8,000",
        help: "A rough range is fine. It tells us what a lead is worth and therefore how hard to push." },
      { id: "guarantee", label: "Any guarantee you offer", type: "text", claimGated: true,
        placeholder: "10 year workmanship guarantee",
        help: "Only something you'd genuinely honour — it goes in the ad, and people will hold you to it." },
      { id: "must_not_say", label: "Anything we must NOT say about you", type: "textarea",
        help: "Accreditations you don't hold, claims you can't back up, prices you'd rather not " +
              "advertise. We'd far rather have this list than guess and get it wrong in public." },
      { id: "busy_season", label: "When are you busiest?", type: "text",
        help: "So we can push harder when you're quiet and ease off when you're flat out." },
    ],
  },
  {
    id: "targeting",
    title: "Who to show them to",
    fields: [
      { id: "target_towns", label: "Towns to target", type: "lines", required: true,
        help: "One per line. Where you'd genuinely like the work, not everywhere you'd travel at a push." },
      { id: "radius", label: "How far will you travel?", type: "text", placeholder: "25 miles",
        help: "Or a maximum drive time if that's how you think about it." },
      { id: "audience", label: "Who are your customers?", type: "checkboxes",
        options: ["Homeowners", "Landlords", "Letting agents", "Builders and trade", "Commercial premises"] },
      { id: "property_type", label: "Any particular kind of property?", type: "text",
        help: "Older terraces, new builds, detached, farm buildings — whatever suits what you do best." },
      { id: "exclude_areas", label: "Anywhere to avoid", type: "lines",
        help: "Areas you don't want to work, or where you already have more than enough on." },
    ],
  },
  {
    id: "leads",
    title: "What happens when a lead comes in",
    intro:
      "This matters more than the ads themselves. A Facebook lead that isn't contacted within the " +
      "hour has usually gone cold or rung someone else — and the 15-lead guarantee depends on them " +
      "being contacted quickly.",
    fields: [
      { id: "lead_destination", label: "How should we send leads to you?", type: "checkboxes", required: true,
        options: ["Text message to my mobile", "WhatsApp", "Email"],
        help: "Facebook's own notifications are unreliable and easy to miss. Pick whatever you " +
              "actually look at during the day." },
      { id: "lead_mobile", label: "Number for lead alerts", type: "tel",
        help: "If it's different from the mobile above." },
      { id: "lead_email", label: "Email for lead alerts", type: "email" },
      { id: "who_answers", label: "Who picks these up?", type: "text",
        help: "You, your partner, an office — whoever it actually is." },
      { id: "response_time", label: "How quickly can you get back to someone?", type: "radio", required: true,
        options: ["Within the hour", "Same day", "Next working day"],
        help: "Answer honestly rather than optimistically. If it's realistically next day we'll " +
              "build the ads to suit that, and ask fewer but better-qualified people to enquire." },
      { id: "qualifying_questions", label: "Questions worth asking on the form", type: "lines",
        help: "Two or three, no more. Every extra question loses you leads — but the right one " +
              "(\"is this your own property?\") saves you a wasted drive." },
      { id: "calendar_link", label: "Booking link, if you use one", type: "url",
        help: "Calendly or similar. Optional." },
    ],
  },
  {
    id: "grade_a",
    title: "Grade A — video of you or your customers",
    intro:
      "This is the section that decides how well the ads do, so it's worth twenty minutes of your " +
      "time. Nothing outperforms a real person talking. Photos of finished work are everywhere and " +
      "they all look the same; your face and your voice are the one thing a competitor can't copy.\n\n" +
      "How to film it: VERTICAL, phone at eye level (prop it on something — don't hold it at arm's " +
      "length), somewhere quiet with the light on your face rather than behind you. Don't write a " +
      "script. One honest take beats five polished ones, and if you fluff a word, leave it in.\n\n" +
      "Send the original file. Don't send it through WhatsApp first — it compresses it to a fraction " +
      "of the quality and there's no getting it back. Upload it straight here instead, however big it is.",
    fields: [
      { id: "a_owner", label: "You, talking to camera", type: "upload", required: true,
        help: "Thirty to forty-five seconds. Who you are, what you do, the areas you cover, and the " +
              "offer. That's it. If you can only manage one thing on this whole form, make it this one.",
        upload: { role: "a_owner", min: 1, max: 6, captions: true, accept: "video" } },
      { id: "a_testimonial", label: "A customer saying what you did for them", type: "upload",
        help: "Thirty seconds is plenty. Ask them what the job was, what they were worried about " +
              "before they called, and whether they'd recommend you. Get them to say on camera " +
              "that they're happy for you to use it. This is the best-performing ad there is — " +
              "next time you finish a job someone's pleased with, ask on the spot.",
        upload: { role: "a_testimonial", max: 10, captions: true, accept: "video" } },
      { id: "a_onsite", label: "You on a job, explaining what you're doing", type: "upload",
        help: "Filmed by whoever's with you, while you work. Point at the problem and say what " +
              "you're fixing and why. People find this genuinely interesting.",
        upload: { role: "a_onsite", max: 8, captions: true, accept: "video" } },
    ],
  },
  {
    id: "grade_b",
    title: "Grade B — photos with a person in them",
    intro:
      "Same principle as above, in stills. A photo of a finished roof looks like every other photo " +
      "of a finished roof. A photo of you stood in front of your own van outside that roof does not.",
    fields: [
      { id: "b_van", label: "You stood with your branded van", type: "upload", required: true,
        help: "Two or three, outside a job you've just finished if you can manage it. Look at the " +
              "camera. Get the van's signage in shot. This one photo makes more difference than " +
              "any other still you'll send.",
        upload: { role: "b_van", min: 2, max: 12, captions: true, accept: "image" } },
      { id: "b_customer", label: "You with a happy customer", type: "upload",
        help: "Shaking hands, handing the keys back, stood together in front of the work. " +
              "Ask them first — and see the permission question at the end.",
        upload: { role: "b_customer", max: 12, captions: true, accept: "image" } },
      { id: "b_team", label: "You and the team", type: "upload",
        help: "On site and working beats posed in a line.",
        upload: { role: "b_team", max: 12, captions: true, accept: "image" } },
      { id: "b_work", label: "You or the team actually working", type: "upload",
        help: "Mid-job, faces visible where you can. Scaffolding up, tiles off, that sort of thing.",
        upload: { role: "b_work", min: 4, max: 30, captions: true, accept: "image" } },
      { id: "b_before_after", label: "Before-and-after pairs", type: "upload",
        help: "Take the 'after' from the SAME SPOT you took the 'before'. Matching angles are what " +
              "make the comparison land — a before and after from different positions just looks " +
              "like two photos.",
        upload: { role: "b_before_after", min: 4, max: 30, paired: true, captions: true, accept: "image" } },
      { id: "b_finished", label: "Finished jobs", type: "upload",
        help: "Your best work, wide shots and close-ups. These fill out the carousels.",
        upload: { role: "b_finished", min: 6, max: 40, captions: true, accept: "image" } },
      { id: "b_reviews", label: "Screenshots of your best reviews", type: "upload",
        help: "Straight off your phone — Google, Facebook, Checkatrade, a text message from a " +
              "customer, all fine. We turn these into ads of their own.",
        upload: { role: "b_reviews", max: 12, accept: "image" } },
    ],
  },
  {
    id: "extra",
    title: "Last few things",
    fields: [
      { id: "permission", label: "Do you have permission to use customers' faces and properties in adverts?",
        type: "radio", required: true, options: ["Yes, all of them", "Some of them", "No", "Not sure"],
        help: "We have to ask. Facebook's own rules require it and so does data protection law — " +
              "and it's your business name on the ad, not ours. If it's only some of them, say " +
              "which below and we'll use only those." },
      { id: "permission_notes", label: "Which ones, or anything to be careful with", type: "textarea" },
      { id: "competitors", label: "Anyone locally you don't want to look like", type: "textarea",
        help: "Names or links. Useful for making sure you don't blend in with them." },
      { id: "c_broll", label: "Silent job footage — only if you can't film the above yet", type: "upload",
        help: "Be honest with yourself before using this. We can put a voiceover over silent " +
              "footage of your work, and it's better than running nothing — but it does not perform " +
              "anywhere near as well as seeing your face and hearing your voice. Treat it as a " +
              "stopgap while you get Grade A filmed, not as a replacement for it.",
        upload: { role: "c_broll", max: 12, accept: "video" } },
      { id: "additional_notes", label: "Anything else we should know", type: "textarea",
        help: "Jobs coming up worth filming, things you'd rather we didn't mention, awards, " +
              "anything at all." },
    ],
  },
];

export const metaAdsForm = defineForm({
  kind: "meta_ads",
  schemaId: "2026-09-03",
  label: "Meta Ad Creatives",
  sections: SECTIONS,
  summaryFields: ["owner_name", "phone_mobile", "offer_hook", "target_towns", "response_time"],
  // The mirror image of the website form's ceilings. Grade A is all video, and
  // a 40-second vertical clip off a recent iPhone is comfortably 300MB, so the
  // video count goes up and the object count comes down.
  quota: {
    maxObjects: 80,
    maxVideos: 20,
    maxBytesPerObject: 2 * 1024 * 1024 * 1024,
    maxBytesPerSubmission: 8 * 1024 * 1024 * 1024,
  },
  copy: {
    title: "Ad creatives · innov8 Workflows",
    description: "Send us what we need to build and run your Facebook and Instagram ads.",
    ogTitle: "Ad creatives · Innov8 Workflows",
    ogDescription:
      "A few questions about your offer, and somewhere to send the photos and video we need to " +
      "run your ads.",
    // TODO: this needs its own card — it currently borrows the website one, which
    // says "Let's get your website started." Sharing this link on WhatsApp will
    // show the wrong wording until /og-ads.jpg exists. New FILENAME required when
    // it does: WhatsApp and Facebook cache the preview per URL for weeks.
    ogImage: "/og-onboarding.jpg",
    ogAlt: "Innov8 Workflows",
    eyebrow: "Meta ad creatives",
    startTitle: "Let's get your ads built.",
    startIntro:
      "A few questions about the work you want, and somewhere to send the photos and video we " +
      "need. The video section is the one that matters — everything else is quick.",
    startPoints: [
      ["Takes about twenty minutes", "And you don't have to do it in one go."],
      ["Your own link", "Come back to it whenever — nothing is lost."],
      ["Send video straight off your phone", "Full quality, any size. Don't send it via WhatsApp first."],
    ],
    submit: "Send it over",
    submitAgain: "Save changes",
    doneTitle: "Thanks — that's what we need to start building.",
    doneBody:
      "We'll come back to you if anything's missing. This link stays live, so when you get round " +
      "to filming that piece to camera, come back and add it.",
  },
});
