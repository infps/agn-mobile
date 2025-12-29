import Header from '@/components/header'
import React from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const EventDetail = () => {
  return (
    <SafeAreaView>
      <Header title='Event Detail'/>
    </SafeAreaView>
  )
}

export default EventDetail

const styles = StyleSheet.create({})