import { useAuth } from "@/context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const NAV_ITEMS: { title: string; icon: IoniconName; link: string }[] = [
  { title: "Events",          icon: "calendar-outline",            link: "/events" },
  { title: "My Events",       icon: "bookmark-outline",            link: "/my-events" },
  { title: "Races",           icon: "flag-outline",                link: "/races" },
  { title: "Race Calendar",   icon: "today-outline",               link: "/race-calendar" },
  { title: "Results",         icon: "trophy-outline",              link: "/result" },
  { title: "Teams",           icon: "people-outline",              link: "/teams" },
  { title: "My Birds",        icon: "egg-outline",                 link: "/birds" },
  { title: "Notifications",   icon: "notifications-outline",       link: "/notifications" },
  { title: "Messages",        icon: "chatbubble-ellipses-outline", link: "/messages" },
];

const OTHER_ITEMS: { title: string; icon: IoniconName; link: string }[] = [
  { title: "Payments",            icon: "card-outline",               link: "/payments" },
  { title: "About Us",            icon: "information-circle-outline",  link: "/about-us" },
  { title: "Privacy Policy",      icon: "shield-checkmark-outline",   link: "/privacy-policy" },
  { title: "Contact Us",          icon: "call-outline",               link: "/contact-us" },
  { title: "Terms & Conditions",  icon: "document-text-outline",      link: "/terms-condition" },
];

function MenuItem({ item, isLast, onPress }: { item: typeof NAV_ITEMS[0]; isLast: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.menuItem, !isLast && s.menuItemBorder]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={s.menuLeft}>
        <View style={s.iconBox}>
          <Ionicons name={item.icon} size={18} color="#189AB4" />
        </View>
        <Text style={s.menuLabel}>{item.title}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
    </TouchableOpacity>
  );
}

function MenuSection({ title, items, onPress }: { title?: string; items: typeof NAV_ITEMS; onPress: (link: string) => void }) {
  return (
    <View style={s.section}>
      {title && <Text style={s.sectionTitle}>{title}</Text>}
      {items.map((item, i) => (
        <MenuItem key={item.link} item={item} isLast={i === items.length - 1} onPress={() => onPress(item.link)} />
      ))}
    </View>
  );
}

export default function Settings() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const go = (link: string) => router.push(link as any);

  const handleShare = async () => {
    try {
      await Share.share({ message: "Check out AGN Pigeon Racing!\nhttps://play.google.com/store/apps/details?id=com.mobile.agn" });
    } catch {}
  };

  return (
    <SafeAreaView style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <View style={{ marginLeft: 12 }}>
              <Text style={s.headerName}>{user?.name ?? "My Account"}</Text>
              <TouchableOpacity onPress={() => go("/profile-update")}>
                <Text style={s.headerSub}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity onPress={() => go("/profile")} style={s.avatar}>
            <Ionicons name="person-outline" size={22} color="white" />
          </TouchableOpacity>
        </View>

        {/* Nav */}
        <View style={{ marginTop: 20 }}>
          <MenuSection items={NAV_ITEMS} onPress={go} />
        </View>

        {/* Other */}
        <View style={{ marginTop: 12 }}>
          <MenuSection title="More" items={OTHER_ITEMS} onPress={go} />
        </View>

        {/* Share */}
        <TouchableOpacity style={[s.section, s.actionRow]} onPress={handleShare} activeOpacity={0.6}>
          <View style={s.menuLeft}>
            <View style={s.iconBox}>
              <Ionicons name="share-social-outline" size={18} color="#189AB4" />
            </View>
            <Text style={s.menuLabel}>Share This App</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity style={[s.section, s.actionRow, { marginTop: 12 }]} onPress={signOut} activeOpacity={0.6}>
          <View style={s.menuLeft}>
            <View style={[s.iconBox, { backgroundColor: "#fef2f2" }]}>
              <Ionicons name="log-out-outline" size={18} color="#ef4444" />
            </View>
            <Text style={[s.menuLabel, { color: "#ef4444" }]}>Log Out</Text>
          </View>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f4f6" },
  scroll: { paddingBottom: 40 },
  header: {
    backgroundColor: "#189AB4",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  headerName: { color: "white", fontSize: 17, fontWeight: "700" },
  headerSub: { color: "#bfdbfe", fontSize: 12, marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  section: {
    backgroundColor: "white",
    borderRadius: 16,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 11, fontWeight: "700", color: "#9ca3af",
    textTransform: "uppercase", letterSpacing: 0.8,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  menuItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  menuLeft: { flexDirection: "row", alignItems: "center" },
  iconBox: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center", justifyContent: "center",
    marginRight: 12,
  },
  menuLabel: { fontSize: 15, fontWeight: "500", color: "#1f2937" },
  actionRow: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
});
