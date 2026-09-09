import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  const scheme = useColorScheme();
  return <SafeAreaProvider><StatusBar style={scheme === 'dark' ? 'light' : 'dark'} translucent /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} /></SafeAreaProvider>;
}
