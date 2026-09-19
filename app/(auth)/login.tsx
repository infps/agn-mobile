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
  const [problem, setProblem] = useState<string | null>(null);
  const [user, setUser] = useState({
    username: "",
    password: "",
  });

  /**
   * A failed sign-in used to be swallowed into console.log, so the screen sat
   * there looking like nothing had happened. Worse, the two reasons it fails
   * need completely different responses: a wrong password is the person's to
   * fix, an unreachable server is not, and telling them apart is the whole
   * difference between retyping a password and checking whether the portal is
   * running.
   */
  const handelLogin = async () => {
    setProblem(null);

    if (!user.username.trim() || !user.password) {
      setProblem("Enter your username and password.");
      return;
    }

    try {
      await signIn(user.username.trim(), user.password);
    } catch (error: any) {
      const status = error?.response?.status;

      if (!error?.response) {
        // No response at all: DNS, timeout, refused connection.
        setProblem(
          "Could not reach the server. Check you are on the same network as it, and that it is running."
        );
      } else if (status === 401 || status === 403) {
        setProblem("That username and password do not match.");
      } else {
        setProblem(
          error?.response?.data?.message ?? "Sign-in failed. Please try again."
        );
      }
      console.log("[login] failed", status ?? error?.message, error?.config?.baseURL);
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

        {problem ? (
          <View className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <Text className="text-sm text-rose-800">{problem}</Text>
          </View>
        ) : null}

        {/* Sign In Button */}
        <TouchableOpacity
          className={`rounded-xl py-4 mt-8 ${isLoading ? "bg-cyan-400" : "bg-cyan-600"}`}
          onPress={handelLogin}
          disabled={isLoading}
        >
          <Text className="text-white text-center text-lg font-semibold">
            {isLoading ? "Signing in…" : "Sign in"}
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
