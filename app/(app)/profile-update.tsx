import { PickedPhoto, pickBirdPhoto } from "@/components/BirdPhoto";
import { useAuth, useToast } from "@/context";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Profile settings — the portal's /profile page.
 *
 * PUT /api/user/profile takes multipart form data and writes every field it is
 * given — and nulls every one it is not. So the whole form is sent each time,
 * and, as the portal does, an empty field is simply left out. The picture goes
 * in the same request under `image`.
 *
 * Username, email, account status and role are shown but cannot be changed
 * here; the route ignores them.
 */

// The portal's country list (lib/flag-constants.ts).
const COUNTRIES: Record<string, string> = {
  AE: "United Arab Emirates", AL: "Albania", AO: "Angola", AR: "Argentina", AT: "Austria",
  AU: "Australia", BE: "Belgium", BG: "Bulgaria", CA: "Canada", CH: "Switzerland", CN: "China",
  CU: "Cuba", CZ: "Czech Republic", DE: "Germany", DK: "Denmark", DV: "Divehi", EG: "Egypt",
  ES: "Spain", FR: "France", GB: "Great Britain", IE: "Ireland", IN: "India", IQ: "Iraq",
  IT: "Italy", KW: "Kuwait", MX: "Mexico", NL: "Netherlands", PH: "Philippines", PL: "Poland",
  PR: "Puerto Rico", PT: "Portugal", PU: "Punjab", QA: "Qatar", RO: "Romania", SA: "Saudi Arabia",
  SK: "Slovakia", TT: "Trinidad and Tobago", UK: "United Kingdom", US: "United States",
  ZA: "South Africa", ZW: "Zimbabwe",
};

const EMPTY = {
  name: "",
  lastName: "",
  displayUsername: "",
  country: "",
  state: "",
  city: "",
  address: "",
  postalCode: "",
  phoneNumber: "",
  webAddress: "",
  note: "",
  defaultTeamName: "",
};
type Form = typeof EMPTY;

interface Profile extends Partial<Form> {
  id: string;
  email: string;
  username?: string | null;
  image?: string | null;
  status?: string | null;
  role: string;
}

const ProfileUpdate = () => {
  const { refreshUser } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  useEffect(() => {
    // Read from the route rather than the cached user: only the route carries
    // defaultTeamName, and a stale cache would silently wipe newer values.
    api
      .get("/user/profile")
      .then((res) => {
        const u = res.data?.user as Profile;
        setProfile(u);
        const next = { ...EMPTY };
        (Object.keys(EMPTY) as (keyof Form)[]).forEach((k) => {
          next[k] = (u?.[k] as string | null | undefined) ?? "";
        });
        setForm(next);
      })
      .catch(() => toast.error("Failed to load profile data"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (field: keyof Form, value: string) =>
    setForm((prev) =>
      // A state belongs to its country, so changing the country clears it.
      field === "country" ? { ...prev, country: value, state: "" } : { ...prev, [field]: value }
    );

  const countries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    return Object.entries(COUNTRIES).filter(
      ([code, name]) => !q || name.toLowerCase().includes(q) || code.toLowerCase().includes(q)
    );
  }, [countrySearch]);

  const choosePhoto = () => {
    const pick = async (from: "camera" | "library") => {
      try {
        const picked = await pickBirdPhoto(from);
        if (picked) setPhoto({ ...picked, name: picked.name.replace(/^bird-/, "profile-") });
      } catch (e: any) {
        toast.error(e?.message || "Could not open the photo picker");
      }
    };
    Alert.alert("Profile image", undefined, [
      { text: "Take photo", onPress: () => pick("camera") },
      { text: "Choose from library", onPress: () => pick("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const onSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("First name is required");
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      (Object.keys(form) as (keyof Form)[]).forEach((k) => {
        const value = form[k].trim();
        if (value) body.append(k, value);
      });
      if (photo) body.append("image", photo as any);

      await api.put("/user/profile", body, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
      await refreshUser();
      toast.success("Profile updated successfully");
      router.back();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const input = (field: keyof Form, label: string, placeholder = "", props: object = {}) => (
    <View className="mb-4">
      <Text className="text-gray-600 text-sm mb-1">{label}</Text>
      <TextInput
        className="border border-gray-300 rounded-lg px-4 py-2 text-black"
        value={form[field]}
        onChangeText={(text) => set(field, text)}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        {...props}
      />
    </View>
  );

  const readOnly = (label: string, value: string, hint: string) => (
    <View className="mb-4">
      <Text className="text-gray-600 text-sm mb-1">{label}</Text>
      <View className="border border-gray-200 bg-gray-100 rounded-lg px-4 py-2.5">
        <Text className="text-gray-500">{value || "-"}</Text>
      </View>
      <Text className="text-[11px] text-gray-400 mt-1">{hint}</Text>
    </View>
  );

  const imageUri = photo?.uri ?? profile?.image ?? null;

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <View className="bg-primary p-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold ml-4">Profile Settings</Text>
        </View>
        <TouchableOpacity onPress={onSubmit} disabled={saving || loading}>
          <Text className="text-white text-base font-medium">{saving ? "Saving..." : "Save"}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#189AB4" />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
          <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
            {/* Profile image */}
            <View className="items-center my-4">
              <TouchableOpacity onPress={choosePhoto}>
                <Image
                  source={imageUri ? { uri: imageUri } : require("../../assets/profile.png")}
                  className="w-32 h-32 rounded-full"
                />
                <View className="absolute bottom-0 right-0 bg-primary p-2 rounded-full border-2 border-white">
                  <Ionicons name="camera" size={20} color="white" />
                </View>
              </TouchableOpacity>
              <Text className="mt-2 text-gray-600 text-xs">
                {photo ? "New image selected — save to upload" : "Tap to change photo"}
              </Text>
            </View>

            <View className="bg-white p-4 rounded-lg mb-4">
              <Text className="text-lg font-bold mb-4 text-gray-800">Personal Information</Text>
              <View className="flex-row">
                <View className="flex-1 mr-2">{input("name", "First Name *", "First name")}</View>
                <View className="flex-1 ml-2">{input("lastName", "Last Name", "Last name")}</View>
              </View>
              {input("displayUsername", "Display Username", "", { autoCapitalize: "none" })}
              {readOnly("Username", profile?.username ?? "", "Username cannot be changed")}
            </View>

            <View className="bg-white p-4 rounded-lg mb-4">
              <Text className="text-lg font-bold mb-4 text-gray-800">Contact</Text>
              {input("phoneNumber", "Phone Number", "", { keyboardType: "phone-pad" })}
              {input("webAddress", "Website", "https://", { keyboardType: "url", autoCapitalize: "none" })}
            </View>

            <View className="bg-white p-4 rounded-lg mb-4">
              <Text className="text-lg font-bold mb-4 text-gray-800">Location</Text>
              <View className="mb-4">
                <Text className="text-gray-600 text-sm mb-1">Country</Text>
                <TouchableOpacity
                  onPress={() => setCountryOpen(true)}
                  className="border border-gray-300 rounded-lg px-4 py-2.5 flex-row items-center justify-between"
                >
                  <Text className={form.country ? "text-black" : "text-gray-400"}>
                    {form.country ? COUNTRIES[form.country] ?? form.country : "Select country"}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#9ca3af" />
                </TouchableOpacity>
              </View>
              <View className="flex-row">
                <View className="flex-1 mr-2">
                  {input("state", "State", form.country ? "State code, e.g. CA" : "Select country first", {
                    autoCapitalize: "characters",
                    editable: !!form.country,
                  })}
                </View>
                <View className="flex-1 ml-2">{input("city", "City")}</View>
              </View>
              {input("address", "Address")}
              {input("postalCode", "Postal Code")}
            </View>

            <View className="bg-white p-4 rounded-lg mb-4">
              <Text className="text-lg font-bold mb-4 text-gray-800">Additional Information</Text>
              {profile?.role === "BREEDER"
                ? input(
                    "defaultTeamName",
                    "Default Team Name",
                    "Pre-fills the loft name when you register for an event"
                  )
                : null}
              <View className="mb-4">
                <Text className="text-gray-600 text-sm mb-1">Notes</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-4 py-2 text-black"
                  style={{ minHeight: 96, textAlignVertical: "top" }}
                  multiline
                  value={form.note}
                  onChangeText={(text) => set("note", text)}
                  placeholder="Add any additional notes..."
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              {readOnly("Email", profile?.email ?? "", "Email cannot be changed from this page")}
              {readOnly("Account Status", profile?.status ?? "", "Status is managed by administrators")}
              {readOnly("Role", profile?.role ?? "", "Role is managed by administrators")}
            </View>

            <TouchableOpacity
              className="bg-primary py-3 rounded-lg items-center mt-2"
              onPress={onSubmit}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Save Changes</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              className="py-3 rounded-lg items-center mt-2 mb-10"
              onPress={() => router.back()}
              disabled={saving}
            >
              <Text className="text-gray-600 font-medium">Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Country picker */}
      <Modal visible={countryOpen} animationType="slide" onRequestClose={() => setCountryOpen(false)}>
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200">
            <Text className="text-lg font-bold">Select country</Text>
            <TouchableOpacity onPress={() => setCountryOpen(false)}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-2 mx-4 mt-3 text-black"
            placeholder="Search"
            placeholderTextColor="#9CA3AF"
            value={countrySearch}
            onChangeText={setCountrySearch}
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {countries.map(([code, name]) => (
              <Pressable
                key={code}
                onPress={() => {
                  set("country", code);
                  setCountryOpen(false);
                  setCountrySearch("");
                }}
                className="px-4 py-3 border-b border-gray-100 flex-row justify-between"
              >
                <Text className={`text-base ${form.country === code ? "text-primary font-bold" : "text-gray-800"}`}>
                  {name}
                </Text>
                <Text className="text-xs text-gray-400">{code}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

export default ProfileUpdate;

export { ErrorBoundary } from "@/components/ErrorScreen";
