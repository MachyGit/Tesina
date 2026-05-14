import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { AuthProvider } from '../hooks/useAuth';
import { Colors } from '../constants/colors';

export default function RootLayout() {
  return (
    <AuthProvider>
      <PaperProvider>
        <StatusBar style="light" backgroundColor={Colors.azul} />
        <Stack screenOptions={{ headerShown: false }} />
      </PaperProvider>
    </AuthProvider>
  );
}
