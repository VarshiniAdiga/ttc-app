import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { LockScreen } from "@/components/lock-screen";
import { AppLockProvider, useAppLock } from "@/lib/app-lock";
import { NAV_THEME } from "@/lib/constants";
import { DevUserProvider } from "@/lib/dev-user";
import { queryClient } from "@/lib/query";
import { SessionProvider } from "@/lib/session";
import { useColorScheme } from "@/lib/use-color-scheme";

const LIGHT_THEME = {
  ...DefaultTheme,
  colors: NAV_THEME.light,
};
const DARK_THEME = {
  ...DarkTheme,
  colors: NAV_THEME.dark,
};

export const unstable_settings = {
  initialRouteName: "(drawer)",
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

// Blocks the app behind the PIN/biometric lock when one is set (Phase 9).
function LockGate({ children }: { children: ReactNode }) {
  const lock = useAppLock();
  if (!lock.ready) return null; // brief: keychain check in flight
  if (lock.locked) return <LockScreen />;
  return <>{children}</>;
}

export default function RootLayout() {
  const { isDarkColorScheme } = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <DevUserProvider>
        <SessionProvider>
          <AppLockProvider>
            <ThemeProvider value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}>
              <StatusBar style={isDarkColorScheme ? "light" : "dark"} />
              <GestureHandlerRootView style={styles.container}>
                <LockGate>
                  <Stack>
                    <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
                    <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                    <Stack.Screen name="modal" options={{ title: "Modal", presentation: "modal" }} />
                  </Stack>
                </LockGate>
              </GestureHandlerRootView>
            </ThemeProvider>
          </AppLockProvider>
        </SessionProvider>
      </DevUserProvider>
    </QueryClientProvider>
  );
}
