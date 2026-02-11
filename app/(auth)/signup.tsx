// app/signup.tsx
import { useAuth } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const Signup = () => {
  const { signUp, isLoading } = useAuth();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
  });

  const handleSignUp = async () => {
    try {
      if (
        !formData.firstName ||
        !formData.lastName ||
        !formData.email ||
        !formData.username ||
        !formData.password
      ) {
        Alert.alert("Error", "Please fill in all fields");
        return;
      }

      if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
        Alert.alert("Error", "Username can only contain letters, numbers, and underscores");
        return;
      }

      await signUp({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        username: formData.username,
        password: formData.password,
      });

      // Navigation will be handled by the auth context after successful signup
    } catch (error) {
      // Error is already handled in the auth context
      console.error("Signup error:", error);
    }
  };

  return (
    <View className="flex-1 bg-white px-6 py-10">
      <View className="mt-16">
        <Text className="text-3xl font-bold text-cyan-600">
          Welcome Pigeon pulse
        </Text>
        <Text className="text-base mt-4 text-center">
          Create an account so you can explore all the existing jobs
        </Text>
      </View>

      <View className="mt-16">
        <View className="border-2 border-cyan-600 rounded-xl px-4 py-4 bg-gray-50">
          <TextInput
            placeholder="First Name"
            placeholderTextColor="#9CA3AF"
            className="text-base py-0 text-black"
            autoCapitalize="none"
            value={formData.firstName}
            onChangeText={(text) => {
              setFormData({ ...formData, firstName: text });
            }}
          />
        </View>
        <View className="border-2 border-cyan-600 rounded-xl px-4 py-4 bg-gray-50 mt-6">
          <TextInput
            placeholder="Last Name"
            placeholderTextColor="#9CA3AF"
            className="text-base py-0 text-black"
            autoCapitalize="none"
            value={formData.lastName}
            onChangeText={(text) => {
              setFormData({ ...formData, lastName: text });
            }}
          />
        </View>
        {/* Email Input */}
        <View className="border-2 border-cyan-600 rounded-xl px-4 py-4 bg-gray-50 mt-6">
          <TextInput
            placeholder="Email"
            placeholderTextColor="#9CA3AF"
            className="text-base py-0 text-black"
            keyboardType="email-address"
            autoCapitalize="none"
            value={formData.email}
            onChangeText={(text) => {
              setFormData({ ...formData, email: text });
            }}
          />
        </View>
        {/* Username Input */}
        <View className="border-2 border-cyan-600 rounded-xl px-4 py-4 bg-gray-50 mt-6">
          <TextInput
            placeholder="Username (letters, numbers, underscores)"
            placeholderTextColor="#9CA3AF"
            className="text-base py-0 text-black"
            autoCapitalize="none"
            value={formData.username}
            onChangeText={(text) => {
              setFormData({ ...formData, username: text });
            }}
          />
        </View>

        {/* Password Input */}
        <View className="border-2 border-gray-200 rounded-xl px-4 py-4 bg-gray-50 mt-6">
          <TextInput
            placeholder="Password"
            placeholderTextColor="#9CA3AF"
            className="text-base py-0 text-black"
            secureTextEntry
            value={formData.password}
            onChangeText={(text) => {
              setFormData({ ...formData, password: text });
            }}
          />
        </View>
        {/* Sign Up Button */}
        <TouchableOpacity className="bg-cyan-600 rounded-xl py-4 mt-8" onPress={handleSignUp}>
          <Text className="text-white text-center text-lg font-semibold">
            Sign up
          </Text>
        </TouchableOpacity>

        {/* Login Link */}
        <View className="mt-6 flex-row justify-center">
          <Text className="text-gray-600">Already have an account </Text>
          <Link href={"/login"} asChild>
            <Pressable>
              <Text className="font-bold text-gray-900">Login</Text>
            </Pressable>
          </Link>
        </View>

        {/* Social Login Section */}
        <View className="mt-8">
          <Text className="text-center text-cyan-600 mb-6">
            Or continue with
          </Text>

          <View className="flex-row justify-center gap-4">
            {/* Google Button */}
            <TouchableOpacity className="bg-gray-200 rounded-lg p-4 w-16 h-16 items-center justify-center">
              <Text className="text-2xl font-bold">G</Text>
            </TouchableOpacity>

            {/* Facebook Button */}
            <TouchableOpacity className="bg-gray-200 rounded-lg p-4 w-16 h-16 items-center justify-center">
              <Ionicons name="logo-facebook" size={28} color="#000" />
            </TouchableOpacity>

            {/* Apple Button */}
            <TouchableOpacity className="bg-gray-200 rounded-lg p-4 w-16 h-16 items-center justify-center">
              <Ionicons name="logo-apple" size={28} color="#000" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default Signup;
