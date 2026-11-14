import Header from "@/components/header";
import Modal from "@/components/Modal";
import { useToast } from "@/context";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * My Teams — the portal's /teams page.
 *
 * GET /api/breeder/teams returns each team already enriched with the events it
 * is registered in and the birds under it (band, sex, colour, basket, and the
 * furthest race status the bird has reached), so one call draws everything
 * here. Name and note are edited in place through PATCH /breeder/birds/[id],
 * exactly as the portal's inline cells do.
 */

interface TeamBird {
  id: number;
  band: string;
  name: string | null;
  note: string | null;
  status: string | null;
  position: number | null;
  vaccinated: boolean;
  color?: string | null;
  sex?: string | null;
  eventId?: number | null;
  basketLabel?: string | null;
}

interface Team {
  id: number;
  name: string;
  breederId: number;
  birdCount?: number;
  birds?: TeamBird[];
  events?: { id: number; name: string }[];
  races?: string[];
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string }> = {
  REGISTERED: { label: "Inventory", bg: "#f3f4f6", fg: "#4b5563" },
  LOFT_BASKETED: { label: "In Loft Basket", bg: "#dbeafe", fg: "#1d4ed8" },
  IN_RACE_BASKET: { label: "In Race Basket", bg: "#f3e8ff", fg: "#7e22ce" },
  RELEASED: { label: "Flying", bg: "#fef3c7", fg: "#b45309" },
  ARRIVED: { label: "Arrived", bg: "#dcfce7", fg: "#15803d" },
  FOREIGN_BIRD: { label: "Did Not Finish", bg: "#fee2e2", fg: "#b91c1c" },
};

const SEX_FILTERS = [
  { value: "all", label: "All Sexes" },
  { value: "Cock", label: "Cock" },
  { value: "Hen", label: "Hen" },
];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`px-3 py-1.5 rounded-full mr-2 border ${
        active ? "bg-primary border-primary" : "bg-white border-gray-200"
      }`}
    >
      <Text className={`text-xs font-semibold ${active ? "text-white" : "text-gray-700"}`}>{label}</Text>
    </TouchableOpacity>
  );
}

const Teams = () => {
  const toast = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selected, setSelected] = useState<{ teamId: number; eventId: number } | null>(null);
  const [search, setSearch] = useState("");
  const [filterSex, setFilterSex] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Add / rename dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);

  // Bird name / note dialog
  const [birdEdit, setBirdEdit] = useState<{ bird: TeamBird; field: "name" | "note"; value: string } | null>(null);
  const [birdEditOpen, setBirdEditOpen] = useState(false);
  const [savingBird, setSavingBird] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/breeder/teams");
      setTeams(res.data?.teams || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load teams");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First team and its first event are shown until something else is picked.
  const defaultSel = useMemo(() => {
    if (teams.length === 0) return null;
    const first = teams[0];
    return { teamId: first.id, eventId: first.events?.[0]?.id ?? -1 };
  }, [teams]);
  const activeTeamId = selected?.teamId ?? defaultSel?.teamId ?? null;
  const activeEventId = selected?.eventId ?? defaultSel?.eventId ?? null;
  const selectedTeam = teams.find((t) => t.id === activeTeamId) ?? null;
  const selectedEvent = selectedTeam?.events?.find((e) => e.id === activeEventId) ?? null;

  const filteredBirds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (selectedTeam?.birds ?? []).filter((b) => {
      if (activeEventId !== -1 && b.eventId !== activeEventId) return false;
      if (filterSex !== "all" && (b.sex ?? "Unknown") !== filterSex) return false;
      if (filterStatus !== "all" && (b.status ?? "") !== filterStatus) return false;
      if (q && !b.band.toLowerCase().includes(q) && !(b.name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [selectedTeam, activeEventId, filterSex, filterStatus, search]);

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingTeam(null);
    setTeamName("");
  };

  const submitTeam = async () => {
    const name = teamName.trim();
    if (!name) {
      toast.error("Team name is required");
      return;
    }
    setSavingTeam(true);
    try {
      if (editingTeam) {
        await api.put("/breeder/teams", { teamId: editingTeam.id, name });
        toast.success("Team updated");
      } else {
        await api.post("/breeder/teams", { name });
        toast.success("Team created");
      }
      closeDialog();
      load();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || (editingTeam ? "Failed to update team" : "Failed to create team")
      );
    } finally {
      setSavingTeam(false);
    }
  };

  const confirmDelete = (team: Team) => {
    Alert.alert("Delete team", `Delete team "${team.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete("/breeder/teams", { data: { teamId: team.id } });
            toast.success("Team deleted");
            if (selected?.teamId === team.id) setSelected(null);
            load();
          } catch (err: any) {
            toast.error(err?.response?.data?.message || "Failed to delete team");
          }
        },
      },
    ]);
  };

  const saveBirdField = async () => {
    if (!birdEdit) return;
    const { bird, field, value } = birdEdit;
    // The route rejects an empty name (min length 1); a note may be cleared.
    if (field === "name" && !value.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    setSavingBird(true);
    try {
      await api.patch(`/breeder/birds/${bird.id}`, field === "name" ? { name: value.trim() } : { note: value });
      setBirdEditOpen(false);
      setBirdEdit(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || `Failed to save ${field}`);
    } finally {
      setSavingBird(false);
    }
  };

  const openBirdEdit = (bird: TeamBird, field: "name" | "note") => {
    setBirdEdit({ bird, field, value: (field === "name" ? bird.name : bird.note) ?? "" });
    setBirdEditOpen(true);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <Header title="My Teams" />

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#189AB4" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
        >
          <Text className="text-xs text-gray-500 mb-2">Your teams and their registered birds.</Text>

          {teams.length === 0 ? (
            <View className="bg-white rounded-xl py-12 items-center">
              <Ionicons name="people-outline" size={40} color="#9ca3af" />
              <Text className="text-gray-500 mt-2">No teams yet. Create your first team.</Text>
            </View>
          ) : (
            <>
              {/* Team list with the events each is registered in */}
              <View className="bg-white rounded-xl overflow-hidden">
                {teams.map((team, i) => {
                  const events = team.events ?? [];
                  const birdCount = team.birdCount ?? team.birds?.length ?? 0;
                  const teamActive = activeTeamId === team.id;
                  return (
                    <View key={team.id} className={i > 0 ? "border-t border-gray-100" : ""}>
                      <TouchableOpacity
                        className="flex-row items-center px-3 py-3 bg-gray-50"
                        onPress={() => setSelected({ teamId: team.id, eventId: events[0]?.id ?? -1 })}
                      >
                        <Ionicons name="people" size={18} color={teamActive ? "#189AB4" : "#6b7280"} />
                        <View className="flex-1 ml-2">
                          <Text className="text-sm font-semibold text-gray-800">{team.name}</Text>
                          <Text className="text-[11px] text-gray-500">
                            {birdCount} bird{birdCount !== 1 ? "s" : ""}
                          </Text>
                        </View>
                        <TouchableOpacity
                          className="p-2"
                          onPress={() => {
                            setEditingTeam(team);
                            setTeamName(team.name);
                            setDialogOpen(true);
                          }}
                        >
                          <Ionicons name="pencil" size={18} color="#4b5563" />
                        </TouchableOpacity>
                        <TouchableOpacity className="p-2" onPress={() => confirmDelete(team)}>
                          <Ionicons name="trash" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </TouchableOpacity>

                      {events.length === 0 ? (
                        <Text className="pl-10 pr-3 py-2 text-xs text-gray-400">No events registered</Text>
                      ) : (
                        events.map((ev) => {
                          const isSelected = teamActive && activeEventId === ev.id;
                          const evBirds = (team.birds ?? []).filter((b) => b.eventId === ev.id).length;
                          return (
                            <TouchableOpacity
                              key={ev.id}
                              onPress={() => setSelected({ teamId: team.id, eventId: ev.id })}
                              className={`flex-row items-center pl-10 pr-3 py-2 ${
                                isSelected ? "bg-[#e8f6f9] border-l-2 border-primary" : ""
                              }`}
                            >
                              <Ionicons name="calendar-outline" size={14} color="#6b7280" />
                              <View className="ml-2 flex-1">
                                <Text className="text-xs font-medium text-gray-800" numberOfLines={1}>
                                  {ev.name}
                                </Text>
                                <Text className="text-[11px] text-gray-500">
                                  {evBirds} bird{evBirds !== 1 ? "s" : ""}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Birds of the selected team / event */}
              {selectedTeam && (
                <View className="mt-4">
                  <Text className="text-sm font-bold text-gray-800 mb-2">
                    {selectedTeam.name}
                    {selectedEvent ? ` — ${selectedEvent.name}` : ""} · Birds
                  </Text>

                  <View className="flex-row items-center bg-white rounded-lg px-3 mb-2 border border-gray-200">
                    <Ionicons name="search" size={16} color="#9ca3af" />
                    <TextInput
                      className="flex-1 py-2 ml-2 text-sm text-black"
                      placeholder="Search band or name"
                      placeholderTextColor="#9ca3af"
                      value={search}
                      onChangeText={setSearch}
                      autoCapitalize="none"
                    />
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
                    {SEX_FILTERS.map((f) => (
                      <Chip
                        key={f.value}
                        label={f.label}
                        active={filterSex === f.value}
                        onPress={() => setFilterSex(f.value)}
                      />
                    ))}
                  </ScrollView>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
                    <Chip
                      label="All Statuses"
                      active={filterStatus === "all"}
                      onPress={() => setFilterStatus("all")}
                    />
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <Chip
                        key={k}
                        label={v.label}
                        active={filterStatus === k}
                        onPress={() => setFilterStatus(k)}
                      />
                    ))}
                  </ScrollView>

                  {filteredBirds.length === 0 ? (
                    <View className="bg-white rounded-xl py-10 items-center">
                      <Text className="text-sm text-gray-500">
                        {search ? "No birds match your search." : "No birds in this team."}
                      </Text>
                    </View>
                  ) : (
                    filteredBirds.map((bird, idx) => {
                      const sc = bird.status ? STATUS_CONFIG[bird.status] : null;
                      return (
                        <View key={`${bird.id}-${bird.eventId ?? "x"}-${idx}`} className="bg-white rounded-xl p-3 mb-2">
                          <View className="flex-row items-center justify-between">
                            <Text className="text-sm font-bold text-primary">
                              {idx + 1}. {bird.band}
                            </Text>
                            {sc ? (
                              <View style={{ backgroundColor: sc.bg }} className="rounded-full px-2 py-0.5">
                                <Text style={{ color: sc.fg }} className="text-[11px] font-semibold">
                                  {sc.label}
                                  {bird.status === "ARRIVED" && bird.position ? ` #${bird.position}` : ""}
                                </Text>
                              </View>
                            ) : bird.vaccinated ? (
                              <View className="rounded-full px-2 py-0.5 bg-emerald-100">
                                <Text className="text-[11px] font-semibold text-emerald-700">Vaccinated</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text className="text-xs text-gray-500 mt-1">
                            Sex: {bird.sex ?? "—"} · Color: {bird.color ?? "—"} · Basket: {bird.basketLabel ?? "—"}
                          </Text>
                          <TouchableOpacity
                            className="flex-row items-center mt-2"
                            onPress={() => openBirdEdit(bird, "name")}
                          >
                            <Text className="text-xs text-gray-500 w-12">Name</Text>
                            <Text className={`flex-1 text-sm ${bird.name ? "text-gray-800" : "text-gray-400"}`}>
                              {bird.name ?? "—"}
                            </Text>
                            <Ionicons name="pencil" size={14} color="#9ca3af" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            className="flex-row items-center mt-1"
                            onPress={() => openBirdEdit(bird, "note")}
                          >
                            <Text className="text-xs text-gray-500 w-12">Note</Text>
                            <Text
                              className={`flex-1 text-sm ${bird.note ? "text-gray-800" : "text-gray-400"}`}
                              numberOfLines={2}
                            >
                              {bird.note ?? "—"}
                            </Text>
                            <Ionicons name="pencil" size={14} color="#9ca3af" />
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  )}
                  <Text className="text-right text-xs text-gray-400 mt-1">
                    {filteredBirds.length} bird{filteredBirds.length !== 1 ? "s" : ""}
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Add / rename team */}
      <Modal open={dialogOpen} setOpen={setDialogOpen}>
        <Text className="text-xl font-bold">{editingTeam ? "Edit Team" : "Add Team"}</Text>
        <Text className="text-xs text-gray-500 mt-1">
          A team name must not be empty and must be unique among your teams.
        </Text>
        <View className="mt-3">
          <Text className="text-sm text-gray-700 mb-1">Team Name</Text>
          <TextInput
            className="border border-gray-300 rounded-[8px] p-2 text-black"
            value={teamName}
            onChangeText={setTeamName}
            placeholder="Enter team name"
            placeholderTextColor="#9ca3af"
            autoFocus
          />
        </View>
        <View className="flex-row justify-end mt-4 mb-2">
          <TouchableOpacity className="px-4 py-2 mr-2 rounded-xl border border-gray-300" onPress={closeDialog}>
            <Text className="text-gray-700">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-primary px-4 py-2 rounded-xl"
            onPress={submitTeam}
            disabled={savingTeam}
          >
            <Text className="text-white font-semibold">
              {savingTeam ? "Saving…" : editingTeam ? "Update" : "Create"}
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Bird name / note */}
      <Modal open={birdEditOpen} setOpen={setBirdEditOpen}>
        <Text className="text-xl font-bold">
          {birdEdit?.field === "note" ? "Edit Note" : "Edit Name"}
        </Text>
        <Text className="text-xs text-gray-500 mt-1">{birdEdit?.bird.band}</Text>
        <TextInput
          className="border border-gray-300 rounded-[8px] p-2 text-black mt-3"
          value={birdEdit?.value ?? ""}
          onChangeText={(text) => setBirdEdit((prev) => (prev ? { ...prev, value: text } : prev))}
          multiline={birdEdit?.field === "note"}
          autoFocus
        />
        <View className="flex-row justify-end mt-4 mb-2">
          <TouchableOpacity
            className="px-4 py-2 mr-2 rounded-xl border border-gray-300"
            onPress={() => {
              setBirdEditOpen(false);
              setBirdEdit(null);
            }}
          >
            <Text className="text-gray-700">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-primary px-4 py-2 rounded-xl"
            onPress={saveBirdField}
            disabled={savingBird}
          >
            <Text className="text-white font-semibold">{savingBird ? "Saving…" : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <View className="absolute bottom-0 left-0 right-0 p-4 pb-6">
        <TouchableOpacity
          className="bg-primary py-3 px-6 rounded-full items-center"
          onPress={() => {
            setEditingTeam(null);
            setTeamName("");
            setDialogOpen(true);
          }}
        >
          <Text className="text-white font-semibold text-base">Add New Team</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default Teams;

export { ErrorBoundary } from "@/components/ErrorScreen";
