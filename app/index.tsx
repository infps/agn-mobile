// import { Link } from "expo-router";
// import { Text, TouchableOpacity, View } from "react-native";

// const Home = () => {
//   return (
//     <View className="flex-1 bg-white items-center justify-center px-6">
//       <Text className="text-3xl font-bold text-gray-900 mb-8">
//         Welcome to Pigeon Pulse
//       </Text>
//       <Text className="text-gray-600 mb-12 text-center">
//         Choose a screen to navigate to:
//       </Text>

//       <View className="w-full gap-4">
//         {/* Onboarding Button */}
//         <Link href="/onboarding" asChild>
//           <TouchableOpacity className="bg-cyan-600 rounded-xl py-4 px-6">
//             <Text className="text-center text-lg font-semibold">
//               Onboarding
//             </Text>
//           </TouchableOpacity>
//         </Link>

//         {/* Login Button */}
//         <Link href="/login" asChild>
//           <TouchableOpacity className="bg-gray-800 rounded-xl py-4 px-6">
//             <Text className="text-center text-lg font-semibold text-white">Login</Text>
//           </TouchableOpacity>
//         </Link>

//         {/* Signup Button */}
//         <Link href="/signup" asChild>
//           <TouchableOpacity className="bg-gray-800 rounded-xl py-4 px-6">
//             <Text className="text-center text-lg font-semibold text-white">Sign Up</Text>
//           </TouchableOpacity>
//         </Link>
//       </View>
//     </View>
//   );
// };

// export default Home;

// app/index.tsx
import { useAuth } from "@/context/AuthContext";
import { Redirect } from "expo-router";
import "./global.css";

export default function Index() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null; // ⛔ wait until auth restored

  if (user) {
    return <Redirect href="/(app)/home" />;
  }

  return <Redirect href="/(auth)/login" />;
}


