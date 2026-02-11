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
  const [birdData, setBirdData] = useState({
    birdName: "",
    color: "",
    sex: "UNKNOWN",
    band1: "",
    band2: "",
    band3: "",
    band4: "",
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
          sex: "UNKNOWN",
          band1: "",
          band2: "",
          band3: "",
          band4: "",
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
              item?.birdId || index.toString()
            }
            renderItem={({ item }: { item: BirdType }) => (
              <View className="w-full p-2 flex-row justify-between border border-b border-t-[0px] border-gray-300">
                <Text className="text-gray-400 text-[12px]">{item.birdId}</Text>
                <Text className="text-gray-400 text-[12px]">
                  {item.birdName}
                </Text>
                <Text className="text-gray-400 text-[12px]">{item.color}</Text>
                <Text className="text-gray-400 text-[12px]">
                  {item.sex === "COCK" ? "Male" : item.sex === "HEN" ? "Female" : "N/A"}
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
          <View className="flex-row gap-2 mt-1">
            {([
              { value: "UNKNOWN", label: "N/A" },
              { value: "COCK", label: "Male" },
              { value: "HEN", label: "Female" },
            ] as const).map((option) => (
              <TouchableOpacity
                key={option.value}
                className={`flex-1 rounded-[8px] p-2 border ${
                  birdData.sex === option.value
                    ? "bg-primary border-primary"
                    : "border-gray-300 bg-gray-50"
                }`}
                onPress={() => setBirdData({ ...birdData, sex: option.value })}
              >
                <Text
                  className={`text-center ${
                    birdData.sex === option.value ? "text-white font-semibold" : "text-black"
                  }`}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Text className="text-lg mt-2 font-semibold">Band</Text>
        <View className="flex-row gap-2 mt-1">
          <TextInput
            className="border rounded-[8px] p-2 text-black flex-1"
            placeholder="Band 1"
            value={birdData.band1}
            onChangeText={(text) => setBirdData({ ...birdData, band1: text })}
          />
          <TextInput
            className="border rounded-[8px] p-2 text-black flex-1"
            placeholder="Band 2"
            value={birdData.band2}
            onChangeText={(text) => setBirdData({ ...birdData, band2: text })}
          />
        </View>
        <View className="flex-row gap-2 mt-2">
          <TextInput
            className="border rounded-[8px] p-2 text-black flex-1"
            placeholder="Band 3"
            value={birdData.band3}
            onChangeText={(text) => setBirdData({ ...birdData, band3: text })}
          />
          <TextInput
            className="border rounded-[8px] p-2 text-black flex-1"
            placeholder="Band 4"
            value={birdData.band4}
            onChangeText={(text) => setBirdData({ ...birdData, band4: text })}
          />
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
