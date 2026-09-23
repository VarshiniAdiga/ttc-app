import { Column, Host, Row, Text as ExpoText, TextInput } from "@expo/ui";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";

import { Container } from "@/components/container";
import { FONTS, RADII, useTheme, type Theme } from "@/lib/constants";

// The Jogi design language, encoded once. Every screen composes these instead of
// repeating card/heading/button markup. All built on @expo/ui primitives.

type Tone = "default" | "muted" | "accent" | "onPrimary" | "onAccent" | "error";

function toneColor(theme: Theme, tone: Tone): string {
  switch (tone) {
    case "muted":
      return theme.mutedText;
    case "accent":
      return theme.accent;
    case "onPrimary":
      return theme.onPrimary;
    case "onAccent":
      return theme.onAccent;
    case "error":
      return theme.notification;
    default:
      return theme.text;
  }
}

// apple-design typography: tracking is size-specific — large display text wants
// negative tracking, small text slightly positive; leading tightens as size grows.
const displayTracking = (size: number) => -0.02 * size; // ≈ -0.02em

/** Small uppercase eyebrow label that sits above headings. */
export function Eyebrow({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <ExpoText textStyle={{ color: theme.accent2, fontSize: 12, fontWeight: "700", letterSpacing: 1.6 }}>
      {children.toUpperCase()}
    </ExpoText>
  );
}

/** Editorial serif heading. */
export function Title({ children, size = 32 }: { children: string; size?: number }) {
  const theme = useTheme();
  return (
    <ExpoText
      textStyle={{
        color: theme.text,
        fontSize: size,
        fontFamily: FONTS.serif,
        lineHeight: size * 1.06,
        letterSpacing: displayTracking(size),
      }}
    >
      {children}
    </ExpoText>
  );
}

/** Section heading, one step down from Title. */
export function Heading({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <ExpoText
      textStyle={{ color: theme.text, fontSize: 20, fontFamily: FONTS.serif, lineHeight: 24, letterSpacing: -0.3 }}
    >
      {children}
    </ExpoText>
  );
}

export function Body({
  children,
  tone = "default",
  size = 14,
  weight = "normal",
}: {
  children: string;
  tone?: Tone;
  size?: number;
  weight?: "normal" | "600" | "bold";
}) {
  const theme = useTheme();
  // Body copy sits near zero tracking with comfortable leading (apple-design §15).
  return (
    <ExpoText
      textStyle={{ color: toneColor(theme, tone), fontSize: size, fontWeight: weight, lineHeight: size * 1.45 }}
    >
      {children}
    </ExpoText>
  );
}

type CardVariant = "surface" | "feature" | "accent" | "olive";

/** Soft rounded container — the core surface of the whole app. */
export function Card({
  children,
  variant = "surface",
  spacing = 10,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  variant?: CardVariant;
  spacing?: number;
  onPress?: () => void;
  padded?: boolean;
}) {
  const theme = useTheme();
  const bg = {
    surface: theme.card,
    feature: theme.cardAlt,
    accent: theme.accent,
    olive: theme.primary,
  }[variant];
  const bordered = variant === "surface" || variant === "feature";
  return (
    <Column
      spacing={spacing}
      onPress={onPress}
      style={{
        backgroundColor: bg,
        borderRadius: RADII.lg,
        borderWidth: bordered ? 1 : 0,
        borderColor: theme.border,
        padding: padded ? 18 : 0,
      }}
    >
      {children}
    </Column>
  );
}

/** Themed single-line text input (universal @expo/ui TextInput, so it works
 *  inside a Host — unlike a raw RN TextInput). Uncontrolled: the field manages
 *  its own text and reports every change via onChangeText (keep that in state). */
export function Input({
  defaultValue,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  maxLength,
}: {
  defaultValue?: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "number-pad";
  autoCapitalize?: "none" | "sentences";
  maxLength?: number;
}) {
  const theme = useTheme();
  return (
    <TextInput
      defaultValue={defaultValue}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.mutedText}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      maxLength={maxLength}
      style={{
        backgroundColor: theme.cardAlt,
        borderRadius: RADII.md,
        borderWidth: 1,
        borderColor: theme.border,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
      textStyle={{ color: theme.text, fontSize: 16 }}
    />
  );
}

/** Labelled form field: eyebrow label + a control inside a soft surface. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Column spacing={7}>
      <ExpoText textStyle={{ color: theme.mutedText, fontSize: 12, fontWeight: "700", letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </ExpoText>
      <Column
        style={{
          backgroundColor: theme.cardAlt,
          borderRadius: RADII.md,
          borderWidth: 1,
          borderColor: theme.border,
          paddingHorizontal: 14,
          paddingVertical: 6,
        }}
      >
        {children}
      </Column>
    </Column>
  );
}

type PillVariant = "primary" | "accent" | "outline" | "ghost";

/** Themed pill button. @expo/ui Button has no color control, so this is a
 *  pressable Row — colors come straight from the palette. */
export function PillButton({
  label,
  onPress,
  variant = "primary",
  disabled,
  small,
}: {
  label: string;
  onPress?: () => void;
  variant?: PillVariant;
  disabled?: boolean;
  small?: boolean;
}) {
  const theme = useTheme();
  const map = {
    primary: { bg: theme.primary, fg: theme.onPrimary, border: theme.primary },
    accent: { bg: theme.accent, fg: theme.onAccent, border: theme.accent },
    outline: { bg: "transparent", fg: theme.text, border: theme.border },
    ghost: { bg: "transparent", fg: theme.mutedText, border: "transparent" },
  }[variant];
  return (
    <Row
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      alignment="center"
      style={{
        backgroundColor: map.bg,
        borderColor: map.border,
        borderWidth: variant === "outline" ? 1 : 0,
        borderRadius: RADII.pill,
        paddingHorizontal: small ? 16 : 22,
        paddingVertical: small ? 9 : 14,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <ExpoText textStyle={{ color: map.fg, fontSize: small ? 13 : 15, fontWeight: "600" }}>{label}</ExpoText>
    </Row>
  );
}

/** A single muted placeholder bar. */
export function Skeleton({ width = 160, height = 13 }: { width?: number; height?: number }) {
  const theme = useTheme();
  return <Row style={{ backgroundColor: theme.border, borderRadius: RADII.sm, width, height, opacity: 0.7 }} />;
}

/** Placeholder cards shown while a list is loading. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <Column spacing={12}>
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} spacing={10}>
          <Skeleton width={96} height={15} />
          <Skeleton width={210} />
        </Card>
      ))}
    </Column>
  );
}

/** Soft centered card for "nothing here yet" states. */
export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  const theme = useTheme();
  return (
    <Column
      alignment="center"
      spacing={6}
      style={{
        backgroundColor: theme.cardAlt,
        borderRadius: RADII.lg,
        borderWidth: 1,
        borderColor: theme.border,
        paddingVertical: 30,
        paddingHorizontal: 20,
      }}
    >
      <ExpoText textStyle={{ color: theme.text, fontSize: 15, fontWeight: "600", textAlign: "center" }}>
        {title}
      </ExpoText>
      {subtitle ? (
        <ExpoText textStyle={{ color: theme.mutedText, fontSize: 13, textAlign: "center", lineHeight: 18 }}>
          {subtitle}
        </ExpoText>
      ) : null}
    </Column>
  );
}

type ChipTone = "accent" | "olive" | "muted";

/** Small status/label pill. */
export function Chip({ label, tone = "muted" }: { label: string; tone?: ChipTone }) {
  const theme = useTheme();
  const map = {
    accent: { bg: theme.accent, fg: theme.onAccent, border: theme.accent },
    olive: { bg: theme.primary, fg: theme.onPrimary, border: theme.primary },
    muted: { bg: theme.cardAlt, fg: theme.mutedText, border: theme.border },
  }[tone];
  return (
    <Row
      style={{
        backgroundColor: map.bg,
        borderColor: map.border,
        borderWidth: 1,
        borderRadius: RADII.pill,
        paddingHorizontal: 12,
        paddingVertical: 5,
      }}
    >
      <ExpoText textStyle={{ color: map.fg, fontSize: 12, fontWeight: "600" }}>{label}</ExpoText>
    </Row>
  );
}

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const addDays = (d: Date, n: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};

/** Week-strip date picker (the calendar from the reference mockup). Chevrons
 *  move by a week; tapping a day selects it. Value is an ISO "YYYY-MM-DD". */
export function WeekStrip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const theme = useTheme();
  const selected = parseYmd(value);
  const weekStart = addDays(selected, -selected.getDay());
  const today = ymd(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <Card spacing={14}>
      <Row spacing={12} alignment="center">
        <Heading>{`${MONTHS[selected.getMonth()]} ${selected.getFullYear()}`}</Heading>
        <PillButton small variant="outline" label="‹" onPress={() => onChange(ymd(addDays(selected, -7)))} />
        <PillButton small variant="outline" label="›" onPress={() => onChange(ymd(addDays(selected, 7)))} />
      </Row>
      <Row spacing={4}>
        {days.map((d) => {
          const key = ymd(d);
          const isSel = key === value;
          const isToday = key === today;
          return (
            <Column key={key} alignment="center" spacing={6} onPress={() => onChange(key)}>
              <ExpoText textStyle={{ color: theme.mutedText, fontSize: 11, fontWeight: "700" }}>
                {DOW[d.getDay()]}
              </ExpoText>
              <Row
                alignment="center"
                style={{
                  backgroundColor: isSel ? theme.accent : "transparent",
                  borderColor: isToday && !isSel ? theme.primary : "transparent",
                  borderWidth: isToday && !isSel ? 1 : 0,
                  borderRadius: RADII.pill,
                  paddingHorizontal: 9,
                  paddingVertical: 8,
                }}
              >
                <ExpoText
                  textStyle={{
                    color: isSel ? theme.onAccent : theme.text,
                    fontSize: 14,
                    fontWeight: isSel ? "700" : "500",
                  }}
                >
                  {pad2(d.getDate())}
                </ExpoText>
              </Row>
            </Column>
          );
        })}
      </Row>
    </Card>
  );
}

/** Screen scaffold: cream page, scroll, consistent padding, serif header block. */
export function Screen({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  // Occasional-tier entrance (animate-expo gate): a gentle fade-up on the outer RN
  // View — the one node outside the @expo/ui Host, so Reanimated can drive it.
  // Reduced motion collapses it to a plain fade, no translation.
  return (
    <Container>
      <ScrollView style={styles.scroll} contentInsetAdjustmentBehavior="never">
        <Animated.View
          style={styles.content}
          entering={FadeInDown.duration(360).reduceMotion(ReduceMotion.System)}
        >
          <Host matchContents={{ vertical: true }}>
            <Column spacing={16}>
              <Column spacing={6}>
                {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
                <Title>{title}</Title>
                {subtitle ? <Body tone="muted">{subtitle}</Body> : null}
              </Column>
              {children}
            </Column>
          </Host>
        </Animated.View>
      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 44 },
});
