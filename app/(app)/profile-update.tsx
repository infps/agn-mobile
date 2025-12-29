import { useAuth } from "@/context";
import { User } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ProfileUpdate = () => {
  const { user, updateProfile } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [profileImage, setProfileImage] = useState(user?.idPicture || '');
  const [formData, setFormData] = useState<Partial<User>>({});

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        email2: user.email2 || '',
        phone: user.phone || '',
        cell: user.cell || '',
        address1: user.address1 || '',
        address2: user.address2 || '',
        city1: user.city1 || '',
        state1: user.state1 || '',
        zip1: user.zip1 || '',
        country: user.country || '',
        taxNumber: user.taxNumber || '',
        socialSecurityNumber: user.socialSecurityNumber || '',
        webAddress: user.webAddress || '',
        note: user.note || '',
      });
    }
  }, [user]);

  const handleInputChange = (field: keyof User, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const onSubmit = async () => {
    try {
      setIsLoading(true);
      
      // Create the user data to update
      const userData: User = {
        ...user, // Keep existing user data
        ...formData, // Add updated form data
        idPicture: profileImage // Add profile image
      };

      await updateProfile(userData);
      Alert.alert('Success', 'Profile updated successfully');
      router.back();
    } catch (error) {
      console.error('Update error:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderInput = (field: keyof User, label: string, placeholder: string, props = {}) => (
    <View className="mb-4">
      <Text className="text-gray-600 text-sm mb-1">{label}</Text>
      <TextInput
        className="border border-gray-300 rounded-lg px-4 py-2"
        value={formData[field] as string || ''}
        onChangeText={(text) => handleInputChange(field, text)}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        {...props}
      />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#f5f5f5]">
      <View className="bg-primary p-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold ml-4">Edit Profile</Text>
        </View>
        <TouchableOpacity onPress={onSubmit} disabled={isLoading}>
          <Text className="text-white text-base font-medium">
            {isLoading ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView className="flex-1 p-4">
          {/* Profile Picture */}
          <View className="items-center my-4">
            <View className="relative">
              <Image
                source={
                  profileImage
                    ? { uri: profileImage }
                    : require("../../assets/profile.png")
                }
                className="w-32 h-32 rounded-full"
              />
              <TouchableOpacity
                onPress={pickImage}
                className="absolute bottom-0 right-0 bg-primary p-2 rounded-full border-2 border-white"
              >
                <Ionicons name="camera" size={20} color="white" />
              </TouchableOpacity>
            </View>
            <Text className="mt-2 text-gray-600">Tap to change photo</Text>
          </View>

          {/* Personal Information */}
          <View className="bg-white p-4 rounded-lg mb-4">
            <Text className="text-lg font-bold mb-4 text-gray-800">
              Personal Information
            </Text>
            <View className="flex-row">
              <View className="flex-1 mr-2">
                {renderInput("firstName", "First Name", "Enter first name")}
              </View>
              <View className="flex-1 ml-2">
                {renderInput("lastName", "Last Name", "Enter last name")}
              </View>
            </View>
            {renderInput("email", "Primary Email", "Enter primary email", {
              keyboardType: "email-address",
              autoCapitalize: "none",
            })}
            {renderInput("email2", "Secondary Email", "Enter secondary email", {
              keyboardType: "email-address",
              autoCapitalize: "none",
            })}
          </View>

          {/* Contact Information */}
          <View className="bg-white p-4 rounded-lg mb-4">
            <Text className="text-lg font-bold mb-4 text-gray-800">
              Contact Information
            </Text>
            <View className="flex-row">
              <View className="flex-1 mr-2">
                {renderInput("phone", "Phone", "Enter phone number", {
                  keyboardType: "phone-pad",
                })}
              </View>
              <View className="flex-1 ml-2">
                {renderInput("cell", "Mobile", "Enter mobile number", {
                  keyboardType: "phone-pad",
                })}
              </View>
            </View>
          </View>

          {/* Address */}
          <View className="bg-white p-4 rounded-lg mb-4">
            <Text className="text-lg font-bold mb-4 text-gray-800">Address</Text>
            {renderInput("address1", "Address Line 1", "Enter address line 1")}
            {renderInput(
              "address2",
              "Address Line 2",
              "Enter address line 2 (optional)"
            )}
            <View className="flex-row">
              <View className="flex-1 mr-2">
                {renderInput("city1", "City", "Enter city")}
              </View>
              <View className="flex-1 ml-2">
                {renderInput("state1", "State/Province", "Enter state")}
              </View>
            </View>
            <View className="flex-row">
              <View className="flex-1 mr-2">
                {renderInput("zip1", "Postal Code", "Enter postal code")}
              </View>
              <View className="flex-1 ml-2">
                {renderInput("country", "Country", "Enter country")}
              </View>
            </View>
          </View>

          {/* Additional Information */}
          <View className="bg-white p-4 rounded-lg mb-4">
            <Text className="text-lg font-bold mb-4 text-gray-800">
              Additional Information
            </Text>
            <View className="flex-row">
              <View className="flex-1 mr-2">
                {renderInput("taxNumber", "Tax Number", "Enter tax number")}
              </View>
              <View className="flex-1 ml-2">
                {renderInput("socialSecurityNumber", "SSN", "Enter SSN", {
                  secureTextEntry: true,
                })}
              </View>
            </View>
            {renderInput("webAddress", "Website", "https://example.com", {
              keyboardType: "url",
              autoCapitalize: "none",
            })}
            <View className="mt-2">
              <Text className="text-gray-600 text-sm mb-1">Notes</Text>
              <TextInput
                className="border border-gray-300 rounded-lg px-4 py-2 h-24 text-align-top"
                multiline
                numberOfLines={4}
                onChangeText={(text) => handleInputChange('note', text)}
                value={formData.note || ''}
                placeholder="Enter any additional notes"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          <TouchableOpacity
            className="bg-red-500 py-3 rounded-lg items-center mt-4 mb-8"
            onPress={() => router.back()}
            disabled={isLoading}
          >
            <Text className="text-white font-medium">Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ProfileUpdate;