import 'expo-router';

declare global {
  namespace ReactNavigation {
    interface RootParamList {
      '(tabs)': undefined;
      // Add other routes as needed
    }
  }
}