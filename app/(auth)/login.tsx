/* eslint-disable react/no-unescaped-entities */
import { useAuth } from "@/context";
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useState } from "react";

import {
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const Login = () => {
  const { signIn, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState({
    username: "",
    password: "",
  });
  const handelLogin = async () => {
    try {
      await signIn(user.username, user.password);
    } catch (error) {
      console.log(error);
    }
  };
  return (
    <View className="flex-1 bg-white px-6 py-10">
      <View className="mt-16">
        <Text className="text-4xl font-bold text-cyan-600 text-center">
          Welcome Pigeon pulse
        </Text>
        <Text className="text-base mt-4 text-center">
          Welcome back you've been missed!
        </Text>
      </View>

      <View className="mt-16">
        {/* Username Input */}
        <View className="border-2 border-cyan-600 rounded-xl px-4 py-4 bg-gray-50">
          <TextInput
            placeholder="Username"
            placeholderTextColor="#9CA3AF"
            className="text-base py-0 text-black"
            autoCapitalize="none"
            value={user.username}
            onChangeText={(text) => {
              setUser({ ...user, username: text });
            }}
          />
        </View>

        {/* Password Input */}
        <View className="border-2 border-gray-200 rounded-xl px-4 py-4 bg-gray-50 mt-6 flex-row items-center">
          <TextInput
            placeholder="Password"
            placeholderTextColor="#9CA3AF"
            className="text-base py-0 text-black flex-1"
            secureTextEntry={!showPassword}
            value={user.password}
            onChangeText={(text) => {
              setUser({ ...user, password: text });
            }}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons name={showPassword ? "eye-off" : "eye"} size={22} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Forgot Password Link */}
        <View className="mt-4 items-end">
          <Pressable>
            <Text className="text-cyan-600 font-medium">
              Forgot your password?
            </Text>
          </Pressable>
        </View>

        {/* Sign In Button */}
        <TouchableOpacity
          className="bg-cyan-600 rounded-xl py-4 mt-8"
          onPress={handelLogin}
        >
          <Text className="text-white text-center text-lg font-semibold">
            Sign in
          </Text>
        </TouchableOpacity>

        {/* Create Account Link */}
        <View className="mt-6 flex-row justify-center">
          <Text className="text-gray-600">Create new account </Text>
          <Link href="/signup" asChild>
            <Pressable>
              <Text className="font-bold text-gray-900">Signup</Text>
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

export default Login;
