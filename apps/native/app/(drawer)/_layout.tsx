import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { Drawer } from "expo-router/drawer";

import { HeaderButton } from "@/components/header-button";
import { NAV_THEME } from "@/lib/constants";
import { useColorScheme } from "@/lib/use-color-scheme";

const DrawerLayout = () => {
  const { colorScheme } = useColorScheme();
  const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;

  return (
    <Drawer
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.background,
        },
        headerTitleStyle: {
          color: theme.text,
        },
        headerTintColor: theme.text,
        drawerStyle: {
          backgroundColor: theme.background,
        },
        drawerLabelStyle: {
          color: theme.text,
        },
        drawerInactiveTintColor: theme.text,
      }}
    >
      <Drawer.Screen
        name="index"
        options={{
          headerTitle: "Home",
          drawerLabel: "Home",
          drawerIcon: ({ size, color }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="track"
        options={{
          headerTitle: "Track",
          drawerLabel: "Track",
          drawerIcon: ({ size, color }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="habits"
        options={{
          headerTitle: "Habits",
          drawerLabel: "Habits (his)",
          drawerIcon: ({ size, color }) => (
            <Ionicons name="fitness-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="dashboard"
        options={{
          headerTitle: "Dashboard",
          drawerLabel: "Shared dashboard",
          drawerIcon: ({ size, color }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="consent"
        options={{
          headerTitle: "Sharing",
          drawerLabel: "Sharing",
          drawerIcon: ({ size, color }) => (
            <Ionicons name="lock-closed-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="todos"
        options={{
          headerTitle: "To-dos",
          drawerLabel: "To-dos & invite",
          drawerIcon: ({ size, color }) => (
            <Ionicons name="checkbox-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="coaching"
        options={{
          headerTitle: "Coaching",
          drawerLabel: "Coaching (Pro)",
          drawerIcon: ({ size, color }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="(tabs)"
        options={{
          headerTitle: "Tabs",
          drawerLabel: "Tabs",
          drawerIcon: ({ size, color }) => (
            <MaterialIcons name="border-bottom" size={size} color={color} />
          ),
          headerRight: () => (
            <Link href="/modal" asChild>
              <HeaderButton />
            </Link>
          ),
        }}
      />
    </Drawer>
  );
};

export default DrawerLayout;
