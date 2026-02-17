import Header from "@/components/header";
import Modal from "@/components/Modal";
import { useBirds } from "@/context";
import { BirdType } from "@/context/BirdContext";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FEDERATIONS = ["AU", "IF", "NPA", "CU", "BB", "ARPU", "IPB"];
const COLORS = [
  "BB", "BC", "BBWF", "BBPD", "BCWF", "BCPD", "SPLA", "CHOC", "RC", "SIL",
  "RCSP", "RR", "BLK", "OPAL", "SLAT", "PENC", "WHIT", "GRIZ", "DC", "DCWF",
];
const SEX_OPTIONS = [
  { value: "UNKNOWN", label: "Unknown" },
  { value: "COCK", label: "Cock" },
  { value: "HEN", label: "Hen" },
];

type DropdownProps = {
  label: string;
  value: string;
  options: { value: string; label: string }[] | string[];
  onChange: (value: string) => void;
};

const Dropdown = ({ label, value, options, onChange }: DropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const normalizedOptions = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  const selectedLabel = normalizedOptions.find((o) => o.value === value)?.label || "Select";

  return (
    <View className="flex-1">
      <Text className="text-sm mb-1 text-gray-600">{label}</Text>
      <TouchableOpacity
        className="border rounded-lg p-3 bg-white border-gray-300"
        onPress={() => setIsOpen(!isOpen)}
      >
        <Text className={value ? "text-black" : "text-gray-400"}>
          {selectedLabel}
        </Text>
      </TouchableOpacity>
      {isOpen && (
        <View className="absolute top-16 left-0 right-0 bg-white border border-gray-300 rounded-lg z-50 shadow-lg">
          <ScrollView className="max-h-64">
            {normalizedOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                className={`p-3 border-b border-gray-100 ${value === opt.value ? "bg-primary/10" : ""}`}
                onPress={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                <Text className={value === opt.value ? "text-primary font-semibold" : "text-black"}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const Birds = () => {
  const { birds, loading, addBird, fetchBirds } = useBirds();
  const [open, setOpen] = useState(false);
  const [birdData, setBirdData] = useState({
    birdName: "",
    color: "",
    sex: "UNKNOWN",
    band1: "",
    band2: new Date().getFullYear().toString(),
    band3: "",
    band4: "",
  });
  useEffect(() => {
    fetchBirds();
  }, []);
  const isDuplicateBird = () => {
    const bandKey = `${birdData.band1}-${birdData.band2}-${birdData.band3}-${birdData.band4}`.toLowerCase();
    return birds.some((bird: BirdType) => {
      const existingKey = `${bird.band1 || ""}-${bird.band2 || ""}-${bird.band3 || ""}-${bird.band4 || ""}`.toLowerCase();
      return existingKey === bandKey && bandKey !== "---";
    });
  };

  const addNewBird = async () => {
    if (isDuplicateBird()) {
      Alert.alert(
        "Duplicate Bird",
        "A bird with these band details already exists.",
        [{ text: "OK" }]
      );
      return;
    }

    try {
      const success = await addBird(birdData);
      if (success) {
        setOpen(false);
        setBirdData({
          birdName: "",
          color: "",
          sex: "UNKNOWN",
          band1: "",
          band2: new Date().getFullYear().toString(),
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
                  {item.sex === "COCK" ? "Cock" : item.sex === "HEN" ? "Hen" : "Unknown"}
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
        <View className="mt-3">
          <Text className="text-sm mb-1 text-gray-600">Bird Name</Text>
          <TextInput
            className="border rounded-lg p-3 text-black border-gray-300"
            value={birdData.birdName}
            placeholder="Enter bird name"
            onChangeText={(text) =>
              setBirdData({ ...birdData, birdName: text })
            }
          />
        </View>

        <Text className="text-lg mt-4 font-semibold">Band Details</Text>

        {/* Row 1: Federation Dropdown + Year */}
        <View className="flex-row gap-3 mt-2">
          <Dropdown
            label="Federation"
            value={birdData.band1}
            options={FEDERATIONS}
            onChange={(val) => setBirdData({ ...birdData, band1: val })}
          />
          <View className="flex-1">
            <Text className="text-sm mb-1 text-gray-600">Year</Text>
            <TextInput
              className="border rounded-lg p-3 text-black border-gray-300"
              placeholder="2024"
              keyboardType="numeric"
              value={birdData.band2}
              onChangeText={(text) => {
                const numOnly = text.replace(/[^0-9]/g, "");
                setBirdData({ ...birdData, band2: numOnly });
              }}
            />
          </View>
        </View>

        {/* Row 2: Letters + Color Dropdown */}
        <View className="flex-row gap-3 mt-3">
          <View className="flex-1">
            <Text className="text-sm mb-1 text-gray-600">Letters</Text>
            <TextInput
              className="border rounded-lg p-3 text-black border-gray-300"
              placeholder="ABC"
              autoCapitalize="characters"
              value={birdData.band3}
              onChangeText={(text) =>
                setBirdData({ ...birdData, band3: text.toUpperCase() })
              }
            />
          </View>
          <View className="flex-1">
            <Text className="text-sm mb-1 text-gray-600">Band Number</Text>
            <TextInput
              className="border rounded-lg p-3 text-black border-gray-300"
              placeholder="12345"
              value={birdData.band4}
              onChangeText={(text) => setBirdData({ ...birdData, band4: text })}
            />
          </View>
        </View>

        {/* Row 3: Sex Dropdown + Band Number */}
        <View className="flex-row gap-3 mt-3">
          <Dropdown
            label="Color"
            value={birdData.color}
            options={COLORS}
            onChange={(val) => setBirdData({ ...birdData, color: val })}
          />
          <Dropdown
            label="Sex"
            value={birdData.sex}
            options={SEX_OPTIONS}
            onChange={(val) => setBirdData({ ...birdData, sex: val as "UNKNOWN" | "COCK" | "HEN" })}
          />
        </View>

        <View className="flex-row justify-end mt-6 gap-3">
          <TouchableOpacity
            className="bg-gray-200 px-5 py-3 rounded-xl items-center"
            onPress={() => setOpen(false)}
          >
            <Text className="text-gray-700 font-medium">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-primary px-5 py-3 rounded-xl items-center"
            onPress={addNewBird}
          >
            <Text className="text-white font-medium">Submit</Text>
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
