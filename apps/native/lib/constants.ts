import { Platform } from "react-native";

import { useColorScheme } from "./use-color-scheme";

// "Jogi" theme — a warm, editorial wellness palette: oat/cream backgrounds,
// olive/moss brand, chartreuse-lime accents, deep olive-black ink. The 6 keys
// react-navigation reads (background/border/card/notification/primary/text) live
// alongside extra tokens the screens use (accent, olive text, onPrimary, etc.).
export const NAV_THEME = {
  light: {
    // react-navigation required keys
    background: "#ECE6D5", // warm oat page
    border: "#DBD4C0",
    card: "#F7F2E7", // cream surface
    notification: "#B23A2E", // muted brick (errors)
    primary: "#6C6B31", // olive / moss brand
    text: "#2C2B18", // deep olive-black ink
    // extended tokens
    cardAlt: "#FCFAF4", // near-white feature card
    mutedText: "#84815F", // secondary olive-grey
    onPrimary: "#F3F0E2", // cream ink on olive
    accent: "#D8E85C", // chartreuse lime
    onAccent: "#2C2B18", // dark ink on lime
    accent2: "#DC6E3A", // warm terracotta (badges)
  },
  dark: {
    background: "#20200F",
    border: "#3E3D24",
    card: "#2B2A18",
    notification: "#E0705E",
    primary: "#9A9A45",
    text: "#F2EEDC",
    cardAlt: "#33321C",
    mutedText: "#ACA987",
    onPrimary: "#20200F",
    accent: "#D8E85C",
    onAccent: "#20200F",
    accent2: "#E4794A",
  },
};

export type Theme = (typeof NAV_THEME)["light"];

// Native system serifs give the editorial display look with zero bundled assets.
export const FONTS = {
  serif: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" }),
};

export const RADII = { sm: 12, md: 16, lg: 22, pill: 999 };

export function useTheme(): Theme {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
}
