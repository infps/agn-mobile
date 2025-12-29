import Header from "@/components/header";
import Modal from "@/components/Modal";
import { useAuth } from "@/context";
import api from "@/service/api.service";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
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
  idBreeder: number | null;
  idTeam: number | null;
  teamName: string;
}

const Teams = () => {
  const { user } = useAuth();
  const [teamsData, setTeams] = useState<Team[]>([]);
  const [team, setTeam] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

  useEffect(() => {
    const getBreederTeams = async () => {
      try {
        const res = await api.get(`/users/teams/${user?.idBreeder.toString()}`);
        if (res?.data?.success) {
          setTeams(res?.data?.data);
        }
      } catch (err) {
        console.log(err);
      }
    };
    getBreederTeams();
  }, [user?.idBreeder]);
  const addTeam = async () => {
    try {
      const res = api.post(`/users/teams`, {
        breederId: user?.idBreeder,
        teamName: team,
      });
      console.log((await res).data.data);
    } catch (err) {
      console.log(err);
    }
  };
  return (
    <SafeAreaView className="flex-1 relative">
      <Header title="Teams" />
      <View className="flex-1 w-full px-2">
        <FlatList
          data={teamsData}
          keyExtractor={(_, index) => index.toString()}
          renderItem={({ item }) => (
            <View className="w-full flex-row bg-white rounded-xl shadow-sm border border-gray-100 mt-2">
              <View className="px-2 py-2">
                <Text className="text-sm text-gray-600">{item.teamName}</Text>
              </View>
              <View className="flex-1" />
              <TouchableOpacity className="px-2 py-2">
                <Ionicons name="trash" size={24} color="red" />
              </TouchableOpacity>
              <TouchableOpacity
                className="px-2 py-2"
                onPress={() => {
                  setOpenEdit(true);
                  setTeam(item.teamName);
                }}
              >
                <Ionicons name="pencil" size={24} color="black" />
              </TouchableOpacity>
            </View>
          )}
          className="flex-1"
        />
      </View>
      <Modal open={open} setOpen={setOpen}>
        <Text className="text-2xl font-bold">Add Bird</Text>
        <View className="mt-2">
          <Text className="text-lg">Team Name</Text>
          <TextInput
            className="border rounded-[8px] p-2"
            value={team}
            onChangeText={(text) => setTeam(text)}
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
              setTeam("");
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
            className="border rounded-[8px] p-2"
            value={team}
            onChangeText={(text) => setTeam(text)}
          />
        </View>
        <View className="flex-row justify-end mt-4">
          <TouchableOpacity
            className="bg-primary mr-4 p-2 rounded-xl items-center"
            onPress={()=>{}}
          >
            <Text className="text-white">Submit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-primary p-2 rounded-xl items-center"
            onPress={() => {
              setOpenEdit(false);
              setTeam("");
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
