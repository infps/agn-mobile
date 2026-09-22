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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

function validate(formData: typeof EMPTY_FORM) {
  const errs: Partial<typeof EMPTY_FORM> = {};
  if (!formData.firstName) errs.firstName = "Required";
  if (!formData.lastName) errs.lastName = "Required";
  if (!formData.email) errs.email = "Required";
  else if (!EMAIL_RE.test(formData.email)) errs.email = "Invalid email";
  if (!formData.username) errs.username = "Required";
  else if (!USERNAME_RE.test(formData.username)) errs.username = "Letters, numbers, underscores only";
  else if (formData.username.length < 3) errs.username = "Min 3 characters";
  if (!formData.password) errs.password = "Required";
  else if (formData.password.length < 8) errs.password = "Min 8 characters";
  if (!formData.confirmPassword) errs.confirmPassword = "Required";
  else if (formData.password !== formData.confirmPassword) errs.confirmPassword = "Passwords don't match";
  return errs;
}

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  username: "",
  password: "",
  confirmPassword: "",
};

const Signup = () => {
  const { signUp, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof typeof EMPTY_FORM, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const errors = validate(formData);

  function touch(field: keyof typeof EMPTY_FORM) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setFormData((f) => ({ ...f, [field]: value }));
  }

  function showError(field: keyof typeof EMPTY_FORM) {
    return (touched[field] || submitAttempted) ? errors[field] : undefined;
  }

  const handleSignUp = async () => {
    setSubmitAttempted(true);
    if (Object.keys(errors).length > 0) return;
    try {
      await signUp({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        username: formData.username,
        password: formData.password,
      });
    } catch (error) {
      console.error("Signup error:", error);
    }
  };

  function field(
    key: keyof typeof EMPTY_FORM,
    placeholder: string,
    extra?: React.ComponentProps<typeof TextInput>
  ) {
    const err = showError(key);
    return (
      <View className="mt-6">
        <View className={`border-2 ${err ? "border-red-400" : "border-cyan-600"} rounded-xl px-4 py-4 bg-gray-50`}>
          <TextInput
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            className="text-base py-0 text-black"
            autoCapitalize="none"
            value={formData[key]}
            onChangeText={(t) => set(key, t)}
            onBlur={() => touch(key)}
            {...extra}
          />
        </View>
        {err ? <Text className="text-red-500 text-xs mt-1 ml-1">{err}</Text> : null}
      </View>
    );
  }

  const pwErr = showError("password");
  const cpErr = showError("confirmPassword");

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
        {field("firstName", "First Name")}
        {field("lastName", "Last Name")}
        {field("email", "Email", { keyboardType: "email-address" })}
        {field("username", "Username")}

        {/* Password */}
        <View className="mt-6">
          <View className={`border-2 ${pwErr ? "border-red-400" : "border-gray-200"} rounded-xl px-4 py-4 bg-gray-50 flex-row items-center`}>
            <TextInput
              placeholder="Password"
              placeholderTextColor="#9CA3AF"
              className="text-base py-0 text-black flex-1"
              secureTextEntry={!showPassword}
              value={formData.password}
              onChangeText={(t) => set("password", t)}
              onBlur={() => touch("password")}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? "eye-off" : "eye"} size={22} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          {pwErr ? <Text className="text-red-500 text-xs mt-1 ml-1">{pwErr}</Text> : null}
        </View>

        {/* Confirm Password */}
        <View className="mt-6">
          <View className={`border-2 ${cpErr ? "border-red-400" : "border-gray-200"} rounded-xl px-4 py-4 bg-gray-50 flex-row items-center`}>
            <TextInput
              placeholder="Confirm Password"
              placeholderTextColor="#9CA3AF"
              className="text-base py-0 text-black flex-1"
              secureTextEntry={!showConfirmPassword}
              value={formData.confirmPassword}
              onChangeText={(t) => set("confirmPassword", t)}
              onBlur={() => touch("confirmPassword")}
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
              <Ionicons name={showConfirmPassword ? "eye-off" : "eye"} size={22} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          {cpErr ? <Text className="text-red-500 text-xs mt-1 ml-1">{cpErr}</Text> : null}
        </View>

        <TouchableOpacity
          className="bg-cyan-600 rounded-xl py-4 mt-8"
          onPress={handleSignUp}
          disabled={isLoading}
        >
          <Text className="text-white text-center text-lg font-semibold">
            Sign up
          </Text>
        </TouchableOpacity>

        <View className="mt-6 flex-row justify-center">
          <Text className="text-gray-600">Already have an account </Text>
          <Link href={"/login"} asChild>
            <Pressable>
              <Text className="font-bold text-gray-900">Login</Text>
            </Pressable>
          </Link>
        </View>

        <View className="mt-8">
          <Text className="text-center text-cyan-600 mb-6">
            Or continue with
          </Text>
          <View className="flex-row justify-center gap-4">
            <TouchableOpacity className="bg-gray-200 rounded-lg p-4 w-16 h-16 items-center justify-center">
              <Text className="text-2xl font-bold">G</Text>
            </TouchableOpacity>
            <TouchableOpacity className="bg-gray-200 rounded-lg p-4 w-16 h-16 items-center justify-center">
              <Ionicons name="logo-facebook" size={28} color="#000" />
            </TouchableOpacity>
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
