import { Ionicons } from "@expo/vector-icons";
import {
  Drawer,
  DrawerContentScrollView,
  DrawerItemList,
  type DrawerContentComponentProps,
} from "expo-router/drawer";
import { Text, View, type ColorValue } from "react-native";

import { FONTS, useTheme } from "@/lib/constants";

// The Jogi-themed sidebar: an olive brand cap over a cream list, active items
// rendered as lime pills.
function DrawerContent(props: DrawerContentComponentProps) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ backgroundColor: theme.primary, paddingTop: 58, paddingBottom: 22, paddingHorizontal: 24 }}>
        <Text style={{ color: theme.onPrimary, fontFamily: FONTS.serif, fontSize: 32 }}>TTC</Text>
        <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginTop: 6 }}>
          TRYING, TOGETHER
        </Text>
      </View>
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 8 }}>
        <DrawerItemList {...props} />
      </DrawerContentScrollView>
    </View>
  );
}

const DrawerLayout = () => {
  const theme = useTheme();

  const icon =
    (name: keyof typeof Ionicons.glyphMap) =>
    ({ size, color }: { size: number; color: ColorValue }) => <Ionicons name={name} size={size} color={color as string} />;

  return (
    <Drawer
      drawerContent={DrawerContent}
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerShadowVisible: false,
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text, fontFamily: FONTS.serif, fontSize: 20 },
        drawerActiveBackgroundColor: theme.accent,
        drawerActiveTintColor: theme.onAccent,
        drawerInactiveTintColor: theme.text,
        drawerItemStyle: { borderRadius: 14, marginHorizontal: 10, marginVertical: 2 },
        drawerLabelStyle: { fontSize: 15, fontWeight: "600", marginLeft: -12 },
      }}
    >
      <Drawer.Screen name="index" options={{ headerTitle: "Welcome", drawerLabel: "Welcome", drawerIcon: icon("heart-outline") }} />
      <Drawer.Screen name="track" options={{ headerTitle: "Track", drawerLabel: "Track", drawerIcon: icon("calendar-outline") }} />
      <Drawer.Screen name="habits" options={{ headerTitle: "Habits", drawerLabel: "Habits (his)", drawerIcon: icon("leaf-outline") }} />
      <Drawer.Screen name="dashboard" options={{ headerTitle: "Dashboard", drawerLabel: "Shared dashboard", drawerIcon: icon("people-outline") }} />
      <Drawer.Screen name="consent" options={{ headerTitle: "Sharing", drawerLabel: "Sharing", drawerIcon: icon("lock-closed-outline") }} />
      <Drawer.Screen name="todos" options={{ headerTitle: "To-dos", drawerLabel: "To-dos & invite", drawerIcon: icon("checkbox-outline") }} />
      <Drawer.Screen name="coaching" options={{ headerTitle: "Coaching", drawerLabel: "Coaching (Pro)", drawerIcon: icon("sparkles-outline") }} />
    </Drawer>
  );
};

export default DrawerLayout;
