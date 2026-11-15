import React from "react";
import { Modal as RNModal, StyleSheet, View } from "react-native";

/**
 * A centred popup.
 *
 * Built on React Native's own Modal: react-native-modal calls
 * InteractionManager, which React Native 0.88 removed, so opening it threw.
 */
const Modal = ({
  children,
  open,
  setOpen,
}: {
  children: React.ReactNode;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  return (
    <RNModal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setOpen(false)}
    >
      {/* Tapping outside does not close it, as before — the content owns its
          own close/cancel buttons. Android's back button does. */}
      <View className="flex-1 items-center justify-center bg-black/50 px-5">
        <View
          className="w-full bg-white rounded-[8px] px-[14px] pt-[20px] pb-[10px]"
          style={styles.rnmModal}
        >
          {children}
        </View>
      </View>
    </RNModal>
  );
};

export default Modal;

const styles = StyleSheet.create({
  rnmModal: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});
