import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { Colors } from '../constants/colors';

export default function Index() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/auth/login');
    } else {
      const rutas = {
        director:   '/dashboard/director',
        secretaria: '/dashboard/secretaria',
        preceptor:  '/dashboard/preceptor',
        profesor:   '/dashboard/profesor',
        alumno:     '/dashboard/alumno',
      };
      router.replace(rutas[user.rol] || '/dashboard/alumno');
    }
  }, [user, loading]);

  return (
    <View style={{ flex:1, justifyContent:'center', alignItems:'center', backgroundColor: Colors.azul }}>
      <ActivityIndicator size="large" color={Colors.acento} />
    </View>
  );
}
