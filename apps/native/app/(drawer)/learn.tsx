import { Body, Card, Heading, Screen } from "@/components/ui";

// Phase 9 — a few intro content pieces + basic tips. Static for MVP; personalized
// content is a later, paid addition. All copy stays "guidance, not medical advice"
// and is placeholder pending clinician review (see tech-plan "Before production").

const ARTICLES: { title: string; body: string }[] = [
  {
    title: "How the fertile window works",
    body: "Conception is most likely in the ~6 days ending on ovulation day. Tracking your cycle, temperature, and ovulation tests helps estimate that window — but every cycle varies, so treat any prediction as a gentle guide, not a guarantee.",
  },
  {
    title: "Why we track as a team",
    body: "Fertility is a two-person picture. Her cycle signs and his daily habits — sleep, alcohol, heat exposure, stress — both matter. Logging together turns scattered data into one shared, private plan.",
  },
  {
    title: "Small habits that help him",
    body: "Steady sleep, limiting alcohol, avoiding excess heat (hot tubs, laptops on the lap), and managing stress all support sperm health. Changes take ~2–3 months to show, so consistency beats intensity.",
  },
  {
    title: "When to talk to a doctor",
    body: "If you're under 35 and have been trying for a year (or six months if 35+), it's reasonable to see a clinician. Irregular cycles, very short luteal phases, or known conditions are worth raising sooner.",
  },
];

const TIPS = [
  "Take your temperature at the same time each morning, before getting up.",
  "Log ovulation tests around the same time of day for consistency.",
  "Share only what you're comfortable with — sharing is off by default.",
  "A missed day is fine. Predictions adapt to the data you do have.",
];

export default function LearnScreen() {
  return (
    <Screen eyebrow="Learn" title="Understanding your journey" subtitle="Short, plain-language reads. Guidance to think with — never a substitute for your doctor.">
      {ARTICLES.map((a) => (
        <Card key={a.title} variant="feature" spacing={6}>
          <Heading>{a.title}</Heading>
          <Body size={14}>{a.body}</Body>
        </Card>
      ))}

      <Heading>Quick tips</Heading>
      <Card spacing={10}>
        {TIPS.map((t) => (
          <Body key={t} size={14}>{`•  ${t}`}</Body>
        ))}
      </Card>
    </Screen>
  );
}
