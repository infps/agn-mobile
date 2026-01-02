import { DimensionValue, View } from "react-native";

const SkeletonCard = ({
  width,
  marginRight,
  marginBottom,
}: {
  width?: DimensionValue;
  marginRight?: DimensionValue;
  marginBottom?: DimensionValue;
}) => {
  return (
    <View
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
      style={{
        width: width,
        marginRight: marginRight,
        marginBottom: marginBottom,
      }}
    >
      <View className="relative">
        <View className="w-full h-40 bg-gray-200 animate-pulse" />
        <View
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            backgroundColor: "rgba(156, 163, 175, 0.5)",
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 12,
          }}
        >
          <View className="w-20 h-3 bg-gray-300 rounded" />
        </View>
      </View>
      <View className="px-2 py-2">
        <View className="w-24 h-3 bg-gray-200 rounded mb-1" />
        <View className="w-20 h-3 bg-gray-200 rounded mb-2" />
        <View className="w-32 h-4 bg-gray-200 rounded mb-3" />
        <View className="w-full h-8 bg-gray-200 rounded" />
      </View>
    </View>
  );
};

export default SkeletonCard;
