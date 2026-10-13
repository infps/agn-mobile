import BirdForm, {
  bandOf,
  birdPayload,
  BirdFormState,
  emptyBirdForm,
  validateBirdForm,
} from "@/components/BirdForm";
import { PickedPhoto, pickBirdPhoto, uploadBirdPhoto } from "@/components/BirdPhoto";
import Header from "@/components/header";
import { getSexLabel } from "@/constants/bird";
import { useBirds, useToast } from "@/context";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** The bulk route refuses more than this in one request. */
const BULK_LIMIT = 50;

interface Staged extends BirdFormState {
  tempId: string;
}

interface OwnBird {
  id: number;
  band: string | null;
  birdName: string | null;
  sex: number | null;
}

/**
 * Add a bird, add many, or edit one.
 *
 * Without a `birdId` this is the portal's "Add Bird" page: fill the form and
 * register it, or keep pressing "Add another" to stage a batch and send the
 * lot through `POST /breeder/birds/bulk`. With a `birdId` it edits that bird
 * through `PATCH /breeder/birds/[id]`, which also takes the note, the
 * public/private switch and the parents.
 */
export default function BirdNew() {
  const { birdId } = useLocalSearchParams<{ birdId?: string }>();
  const isEdit = !!birdId;
  const router = useRouter();
  const toast = useToast();
  const { fetchBirds } = useBirds();

  const [form, setForm] = useState<BirdFormState>(emptyBirdForm());
  const patch = useCallback(
    (p: Partial<BirdFormState>) => setForm((prev) => ({ ...prev, ...p })),
    []
  );

  const [staged, setStaged] = useState<Staged[]>([]);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  // Edit-only fields.
  const [note, setNote] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [fatherId, setFatherId] = useState<number | null>(null);
  const [motherId, setMotherId] = useState<number | null>(null);
  const [ownBirds, setOwnBirds] = useState<OwnBird[]>([]);
  const [picking, setPicking] = useState<"father" | "mother" | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    (async () => {
      try {
        const [one, all] = await Promise.all([
          api.get(`/breeder/birds/${birdId}`),
          api.get("/breeder/birds"),
        ]);
        if (!alive) return;
        const b = one.data?.bird;
        if (!b || !one.data?.isOwner) {
          toast.error("Only the bird's owner can edit it.");
          router.back();
          return;
        }
        setForm({
          name: b.birdName ?? "",
          band1: b.band1 ?? "AU",
          band2: b.band2 ?? "",
          band3: b.band3 ?? "",
          band4: b.band4 ?? "",
          color: b.color ?? "BB",
          sex: String(b.sex ?? 0),
          rfid: b.rfid ?? "",
          attention: !!b.attention,
        });
        setNote(b.note ?? "");
        setIsPublic(b.isPublic === 1);
        setFatherId(b.fatherId ?? null);
        setMotherId(b.motherId ?? null);
        setOwnBirds((all.data?.birds ?? []).filter((x: OwnBird) => String(x.id) !== String(birdId)));
      } catch {
        if (alive) {
          toast.error("Could not load this bird.");
          router.back();
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [birdId]);

  const choosePhoto = () => {
    const run = async (from: "camera" | "library") => {
      try {
        const picked = await pickBirdPhoto(from);
        if (picked) setPhoto(picked);
      } catch (err: any) {
        toast.error(err?.message ?? "Could not open the photo picker.");
      }
    };
    Alert.alert("Bird photo", undefined, [
      { text: "Take photo", onPress: () => run("camera") },
      { text: "Choose from library", onPress: () => run("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const saveEdit = async () => {
    const problem = validateBirdForm(form);
    if (problem) return toast.error(problem);
    setSaving(true);
    try {
      await api.patch(`/breeder/birds/${birdId}`, {
        ...birdPayload(form),
        rfid: form.rfid.trim() || null,
        note: note.trim() || null,
        isPublic: isPublic ? 1 : 0,
        fatherId,
        motherId,
      });
      toast.success("Bird updated");
      fetchBirds();
      router.back();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to update bird");
    } finally {
      setSaving(false);
    }
  };

  const createOne = async () => {
    const problem = validateBirdForm(form);
    if (problem) return toast.error(problem);
    setSaving(true);
    try {
      const { data } = await api.post("/breeder/birds", birdPayload(form));
      const created = data?.bird;
      if (photo && created?.id) {
        try {
          await uploadBirdPhoto(created.id, photo);
        } catch {
          toast.info("Bird added, but the photo did not upload. Add it from the bird's page.");
        }
      }
      toast.success("Bird added");
      fetchBirds();
      router.back();
    } catch (err: any) {
      toast.error(
        err?.response?.status === 409
          ? "Band already exists"
          : err?.response?.data?.message ?? "Failed to add bird"
      );
    } finally {
      setSaving(false);
    }
  };

  const stage = () => {
    const problem = validateBirdForm(form);
    if (problem) return toast.error(problem);
    if (staged.length >= BULK_LIMIT) {
      return toast.error(`Up to ${BULK_LIMIT} birds can be created at once.`);
    }
    const normalised = { ...form, band3: form.band3.trim().toUpperCase() };
    if (staged.some((b) => bandOf(b) === bandOf(normalised))) {
      return toast.error("Band already staged");
    }
    setStaged((prev) => [...prev, { ...normalised, tempId: `${Date.now()}-${prev.length}` }]);
    // Keep federation and year, step the band number on — the next bird in a
    // round of rings is almost always the next number.
    const next = parseInt(form.band4, 10);
    setForm({
      ...emptyBirdForm(),
      band1: form.band1,
      band2: form.band2,
      band4: isNaN(next) ? "" : String(next + 1),
    });
    setPhoto(null);
  };

  const createAll = async () => {
    if (staged.length === 0) return;
    setSaving(true);
    try {
      const { data } = await api.post("/breeder/birds/bulk", {
        birds: staged.map((b) => birdPayload(b)),
      });
      const errors: { band: string; message: string }[] = data?.errors ?? [];
      if (data?.created > 0) toast.success(`${data.created} bird(s) created`);
      fetchBirds();
      if (errors.length > 0) {
        const failed = new Map(errors.map((e) => [e.band, e.message]));
        setStaged((prev) => prev.filter((b) => failed.has(bandOf(b))));
        Alert.alert(
          `${errors.length} bird(s) failed`,
          errors.map((e) => `${e.band}: ${e.message}`).join("\n")
        );
      } else {
        setStaged([]);
        router.back();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to create birds");
    } finally {
      setSaving(false);
    }
  };

  const nameOf = (id: number | null) => {
    if (id == null) return "None";
    const b = ownBirds.find((x) => x.id === id);
    return b ? `${b.band ?? "No band"}${b.birdName ? ` · ${b.birdName}` : ""}` : `Bird #${id}`;
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header title="Edit Bird" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#189AB4" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <Header title={isEdit ? "Edit Bird" : staged.length ? `Add Birds (${staged.length} staged)` : "Add Bird"} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled">
          <View className="mt-4 rounded-xl bg-white p-4 border border-gray-200">
            <BirdForm value={form} onChange={patch} />

            {isEdit ? (
              <>
                <View className="mt-3">
                  <Text className="text-sm mb-1 text-gray-600">Note</Text>
                  <TextInput
                    className="border rounded-lg p-3 text-black border-gray-300 bg-white"
                    style={{ minHeight: 80, textAlignVertical: "top" }}
                    multiline
                    value={note}
                    placeholder="Anything worth remembering about this bird"
                    placeholderTextColor="#9ca3af"
                    onChangeText={setNote}
                  />
                </View>

                <View className="mt-3 flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-sm text-gray-700">Public profile</Text>
                    <Text className="text-xs text-gray-500">
                      Anyone with the link can see a public bird.
                    </Text>
                  </View>
                  <Switch
                    value={isPublic}
                    onValueChange={setIsPublic}
                    trackColor={{ true: "#189AB4" }}
                  />
                </View>

                {(["father", "mother"] as const).map((which) => {
                  const current = which === "father" ? fatherId : motherId;
                  const set = which === "father" ? setFatherId : setMotherId;
                  // Unknown-sex birds are offered for either parent.
                  const wrongSex = which === "father" ? 2 : 1;
                  const candidates = ownBirds.filter((b) => b.sex !== wrongSex);
                  const open = picking === which;
                  return (
                    <View key={which} className="mt-3">
                      <Text className="text-sm mb-1 text-gray-600">
                        {which === "father" ? "Father" : "Mother"}
                      </Text>
                      <TouchableOpacity
                        className="border rounded-lg p-3 border-gray-300 bg-white flex-row items-center justify-between"
                        onPress={() => setPicking(open ? null : which)}
                      >
                        <Text className="text-black flex-1">{nameOf(current)}</Text>
                        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#6b7280" />
                      </TouchableOpacity>
                      {open && (
                        <View className="mt-1 rounded-lg border border-gray-200 bg-white">
                          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                            <TouchableOpacity
                              className="p-3 border-b border-gray-100"
                              onPress={() => {
                                set(null);
                                setPicking(null);
                              }}
                            >
                              <Text className="text-gray-500">None</Text>
                            </TouchableOpacity>
                            {candidates.map((b) => (
                              <TouchableOpacity
                                key={b.id}
                                className={`p-3 border-b border-gray-100 ${current === b.id ? "bg-primary/10" : ""}`}
                                onPress={() => {
                                  set(b.id);
                                  setPicking(null);
                                }}
                              >
                                <Text className="text-black">
                                  {b.band ?? "No band"}
                                  {b.birdName ? ` · ${b.birdName}` : ""}
                                </Text>
                              </TouchableOpacity>
                            ))}
                            {candidates.length === 0 && (
                              <Text className="p-3 text-xs text-gray-500">
                                None of your other birds can fill this.
                              </Text>
                            )}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            ) : (
              <View className="mt-4 flex-row items-center">
                {photo ? (
                  <Image source={{ uri: photo.uri }} className="h-16 w-16 rounded-lg" />
                ) : (
                  <View className="h-16 w-16 rounded-lg bg-gray-100 items-center justify-center">
                    <Ionicons name="image-outline" size={24} color="#9ca3af" />
                  </View>
                )}
                <View className="ml-3 flex-1">
                  <TouchableOpacity onPress={choosePhoto}>
                    <Text className="text-primary font-semibold">
                      {photo ? "Change photo" : "Add a photo"}
                    </Text>
                  </TouchableOpacity>
                  {photo ? (
                    <TouchableOpacity onPress={() => setPhoto(null)}>
                      <Text className="text-xs text-red-500 mt-1">Remove</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text className="text-xs text-gray-500 mt-1">
                      Sent with "Register Bird". Staged birds get theirs from the bird's page.
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>

          {isEdit ? (
            <TouchableOpacity
              className="mt-4 bg-primary py-3 rounded-full items-center"
              disabled={saving}
              onPress={saveEdit}
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">Update</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View className="mt-4 flex-row gap-3">
              <TouchableOpacity
                className="flex-1 border border-primary py-3 rounded-full items-center bg-white"
                disabled={saving}
                onPress={stage}
              >
                <Text className="text-primary font-semibold">Add another</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 bg-primary py-3 rounded-full items-center"
                disabled={saving}
                onPress={createOne}
              >
                {saving && staged.length === 0 ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-semibold">Register Bird</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {!isEdit && staged.length > 0 && (
            <View className="mt-5 rounded-xl bg-white border border-gray-200 p-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="font-semibold text-gray-900">
                  Staged ({staged.length}/{BULK_LIMIT})
                </Text>
                <TouchableOpacity
                  className="bg-primary px-4 py-2 rounded-full"
                  disabled={saving}
                  onPress={createAll}
                >
                  {saving ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text className="text-white font-semibold text-xs">Create All</Text>
                  )}
                </TouchableOpacity>
              </View>
              {staged.map((b) => (
                <View
                  key={b.tempId}
                  className="flex-row items-center border-t border-gray-100 py-2"
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-gray-900">{b.name}</Text>
                    <Text className="text-xs text-gray-500">
                      {bandOf(b)} · {b.color} · {getSexLabel(parseInt(b.sex, 10))}
                      {b.rfid ? ` · ${b.rfid}` : ""}
                      {b.attention ? " · attention" : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => setStaged((prev) => prev.filter((x) => x.tempId !== b.tempId))}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
