import Header from "@/components/header";
import Modal from "@/components/Modal";
import { useAuth, useToast } from "@/context";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Team {
  breederId: number | null;
  id: number | null;
  name: string;
}

const Teams = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [teamsData, setTeams] = useState<Team[]>([]);
  const [team, setTeam] = useState<Team>({
    breederId: null,
    id: null,
    name: "",
  });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

  useEffect(() => {
    getBreederTeams();
  }, [user?.id]);
  const getBreederTeams = async () => {
    try {
      const res = await api.get("/breeder/teams", { params: { breederId: user?.id } });
      if (res?.data) {
        setTeams(res?.data?.teams);
        setLoading(false);
      }
    } catch (err) {
      console.log(err);
      setLoading(false);
    }
  };
  const addTeam = async () => {
    try {
      if (team.name === "") {
        toast.success("Team name is required");
        return;
      }
      const res = await api.post("/breeder/teams", {
        breederId: user?.id,
        name: team.name,
      });
      if (res.data) {
        toast.success("Team added successfully");
        getBreederTeams();
      }
    } catch (err) {
      console.log(err);
    }
  };
  const deleteTeam = async (teamId: string) => {
    try {
      if (!teamId) return;
      const res = await api.delete("/breeder/teams", { data: { teamId } });
      if (res.data) {
        toast.success("Team deleted successfully");
        getBreederTeams();
      } else {
        toast.error("Team Not Deleted");
      }
    } catch (err: any) {
      console.log(err.message);
      toast.error("Failed to delete team: " + (err.message || "Unknown error"));
    }
  };
  const updateTeam = async () => {
    try {
      if (!team.id) return;
      if (!team.name.trim()) {
        toast.success("Team name is required");
        return;
      }
      const res = await api.put("/breeder/teams", {
        teamId: team.id,
        name: team.name,
      });
      if (res.data) {
        toast.success("Team updated successfully");
        getBreederTeams();
        setOpenEdit(false);
      } else {
        toast.error("Team Not Updated");
      }
    } catch (err: any) {
      console.log(err.message);
    }
  };
  return (
    <SafeAreaView className="flex-1 relative">
      <Header title="Teams" />
      <View className="flex-1 w-full px-2">
        {loading ? (
          [1, 2, 3, 4, 5].map((_, index) => (
            <View className="p-2 mr-4 flex-row justify-between" key={index}>
              <View className="w-full h-8 bg-gray-200 rounded" />
              <View className="w-full h-8 bg-gray-200 rounded" />
              <View className="w-full h-8 bg-gray-200 rounded" />
              <View className="w-full h-8 bg-gray-200 rounded" />
              <View className="w-full h-8 bg-gray-200 rounded" />
              <View className="w-full h-8 bg-gray-200 rounded" />
            </View>
          ))
        ) : (
          <FlatList
            data={teamsData}
            keyExtractor={(_, index) => index.toString()}
            renderItem={({ item }) => (
              <View className="w-full flex-row bg-white rounded-xl shadow-sm border border-gray-100 mt-2">
                <View className="px-2 py-2">
                  <Text className="text-sm text-gray-600">{item.name}</Text>
                </View>
                <View className="flex-1" />
                <TouchableOpacity
                  className="px-2 py-2"
                  onPress={() => {
                    item.id && deleteTeam(item?.id);
                  }}
                >
                  <Ionicons name="trash" size={24} color="red" />
                </TouchableOpacity>
                <TouchableOpacity
                  className="px-2 py-2"
                  onPress={() => {
                    setOpenEdit(true);
                    setTeam(item);
                  }}
                >
                  <Ionicons name="pencil" size={24} color="black" />
                </TouchableOpacity>
              </View>
            )}
            className="flex-1"
          />
        )}
      </View>
      <Modal open={open} setOpen={setOpen}>
        <Text className="text-2xl font-bold">Add Bird</Text>
        <View className="mt-2">
          <Text className="text-lg">Team Name</Text>
          <TextInput
            className="border rounded-[8px] p-2 text-black"
            value={team.name}
            onChangeText={(text) => setTeam({ ...team, name: text })}
          />
        </View>
        <View className="flex-row justify-end mt-4">
          <TouchableOpacity
            className="bg-primary mr-4 p-2 rounded-xl items-center"
            onPress={addTeam}
          >
            <Text className="text-white">Submit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-primary p-2 rounded-xl items-center"
            onPress={() => {
              setOpen(false);
              setTeam({
                breederId: null,
                id: null,
                name: "",
              });
            }}
          >
            <Text className="text-white">Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
      <Modal open={openEdit} setOpen={setOpenEdit}>
        <Text className="text-2xl font-bold">Edit Team</Text>
        <View className="mt-2">
          <Text className="text-lg">Team Name</Text>
          <TextInput
            className="border rounded-[8px] p-2 text-black"
            value={team.name}
            onChangeText={(text) => setTeam({ ...team, name: text })}
          />
        </View>
        <View className="flex-row justify-end mt-4">
          <TouchableOpacity
            className="bg-primary mr-4 p-2 rounded-xl items-center"
            onPress={updateTeam}
          >
            <Text className="text-white">Submit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-primary p-2 rounded-xl items-center"
            onPress={() => {
              setOpenEdit(false);
              setTeam({
                breederId: null,
                id: null,
                name: "",
              });
            }}
          >
            <Text className="text-white">Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
      {/* Fixed Bottom Button */}
      <View className="absolute bottom-0 left-0 right-0 p-4 pb-6">
        <TouchableOpacity
          className="bg-primary py-3 px-6 rounded-full items-center"
          onPress={() => setOpen(true)}
        >
          <Text className="text-white font-semibold text-base">
            Add New Team
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default Teams;

const styles = StyleSheet.create({});
