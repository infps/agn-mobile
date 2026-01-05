import Header from "@/components/header";
import Modal from "@/components/Modal";
import { useBirds } from "@/context";
import { BirdType } from "@/context/BirdContext";
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

const Birds = () => {
  const { birds, loading, addBird, fetchBirds } = useBirds();
  const [open, setOpen] = useState(false);
  const [sexModalOpen, setSexModalOpen] = useState(false);
  const [birdData, setBirdData] = useState({
    birdName: "",
    color: "",
    sex: 0,
  });
  useEffect(() => {
    fetchBirds();
  }, []);
  const addNewBird = async () => {
    try {
      const success = await addBird(birdData);
      if (success) {
        setOpen(false);
        setBirdData({
          birdName: "",
          color: "",
          sex: 0,
        });
      }
    } catch (err) {
      console.log(err);
    }
  };
  return (
    <SafeAreaView className="flex-1">
      <Header title="Birds" />
      <View className="p-2 bg-primary flex-row justify-between mt-2 mx-2">
        <Text className="text-white text-[10px]">SL. NO.</Text>
        <Text className="text-white text-[10px]">Bird Name</Text>
        <Text className="text-white text-[10px]">Color</Text>
        <Text className="text-white text-[10px]">Sex</Text>
        <Text className="text-white text-[10px]">Action</Text>
      </View>
      <View className="px-2 w-full pb-[100px]">
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
        ) : birds.length > 0 ? (
          <FlatList
            data={birds}
            keyExtractor={(item: BirdType, index: number) =>
              item?.idBird?.toString() || index.toString()
            }
            renderItem={({ item }: { item: BirdType }) => (
              <View className="w-full p-2 flex-row justify-between border border-b border-t-[0px] border-gray-300">
                <Text className="text-gray-400 text-[12px]">{item.idBird}</Text>
                <Text className="text-gray-400 text-[12px]">
                  {item.birdName}
                </Text>
                <Text className="text-gray-400 text-[12px]">{item.color}</Text>
                <Text className="text-gray-400 text-[12px]">
                  {item.sex === 0 ? "N/A" : item.sex === 1 ? "Male" : "Female"}
                </Text>
                <Text className="text-gray-400 text-[12px]">Action</Text>
              </View>
            )}
          />
        ) : (
          <Text className="text-center py-4 border border-gray-300">
            No Bird Added
          </Text>
        )}
      </View>
      <Modal open={open} setOpen={setOpen}>
        <Text className="text-2xl font-bold">Add Bird</Text>
        <View className="mt-2">
          <Text className="text-lg">Bird Name</Text>
          <TextInput
            className="border rounded-[8px] p-2 text-black"
            value={birdData.birdName}
            onChangeText={(text) =>
              setBirdData({ ...birdData, birdName: text })
            }
          />
        </View>
        <View className="mt-2">
          <Text className="text-lg">Color</Text>
          <TextInput
            className="border rounded-[8px] p-2 text-black"
            value={birdData.color}
            onChangeText={(text) => setBirdData({ ...birdData, color: text })}
          />
        </View>
        <View className="mt-2">
          <Text className="text-lg">Sex</Text>
          <TouchableOpacity
            className="border rounded-[8px] p-2"
            onPress={() => setSexModalOpen(true)}
          >
            <Text className={birdData?.sex ? "text-black" : "text-gray-400"}>
              {birdData?.sex === 0
                ? "N/A"
                : birdData?.sex === 1
                  ? "Male"
                  : "Female"}
            </Text>
          </TouchableOpacity>
        </View>
        <View className="flex-row justify-end mt-4">
          <TouchableOpacity
            className="bg-primary mr-4 p-2 rounded-xl items-center"
            onPress={addNewBird}
          >
            <Text className="text-white">Submit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-primary p-2 rounded-xl items-center"
            onPress={() => setOpen(false)}
          >
            <Text className="text-white">Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal open={sexModalOpen} setOpen={setSexModalOpen}>
        <Text className="text-xl font-bold mb-4">Select Sex</Text>
        <View className="space-y-3">
          <TouchableOpacity
            className="border border-primary rounded-lg px-3 py-1 bg-gray-50"
            onPress={() => {
              setBirdData({ ...birdData, sex: 0 });
              setSexModalOpen(false);
            }}
          >
            <Text className="text-lg text-primary">N/A</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="border border-primary rounded-lg px-3 py-1 bg-gray-50 mt-2"
            onPress={() => {
              setBirdData({ ...birdData, sex: 1 });
              setSexModalOpen(false);
            }}
          >
            <Text className="text-lg text-primary">Male</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="border border-primary rounded-lg px-3 py-1 bg-gray-50 mt-2"
            onPress={() => {
              setBirdData({ ...birdData, sex: 2 });
              setSexModalOpen(false);
            }}
          >
            <Text className="text-lg text-primary">Female</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          className="bg-gray-300 mt-4 p-2 rounded-xl items-center"
          onPress={() => setSexModalOpen(false)}
        >
          <Text className="text-black">Cancel</Text>
        </TouchableOpacity>
      </Modal>
      <View className="absolute bottom-0 left-0 right-0 p-4 pb-8 bg-white">
        <TouchableOpacity
          className="bg-primary py-3 px-6 rounded-full items-center"
          onPress={() => setOpen(true)}
        >
          <Text className="text-white font-semibold text-base">
            Add New Bird
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default Birds;

const styles = StyleSheet.create({});
