import { Ionicons } from '@expo/vector-icons'
import { Href, useRouter } from 'expo-router'
import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

const Header = (prop:{title:string; fallback?: Href}) => {
    const router = useRouter()
  return (
      <View className={`bg-primary px-2 py-4 flex-row justify-between w-full`}>
        <TouchableOpacity
          // Opened from a notification or deep link there is no history, and
          // back() would do nothing — go to the parent (home by default) instead.
          onPress={() => (router.canGoBack() ? router.back() : router.replace(prop.fallback ?? "/(app)/home"))}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="w-[5%]"
        >
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-center text-xl font-bold w-[95%]">
          {prop.title}
        </Text>
      </View>
  )
}

export default Header