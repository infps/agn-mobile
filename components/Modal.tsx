import React from "react";
import { StyleSheet, View } from "react-native";
import RNModal from "react-native-modal";

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
    <RNModal isVisible={open} animationIn="zoomIn" animationOut="zoomOut">
      <View
        className="bg-white rounded-[8px] px-[14px] pt-[20px] pb-[10px]"
        style={styles.rnmModal}
      >
        {children}
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
