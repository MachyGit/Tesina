import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { login } from '../../services/auth';
import { useAuth } from '../../hooks/useAuth';
import { Colors } from '../../constants/colors';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const { setUser } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert('Campos vacíos', 'Completá email y contraseña');
    setLoading(true);
    try {
      const data = await login(email.trim().toLowerCase(), password);
      setUser(data.user);
      const rutas = {
        director:   '/dashboard/director',
        secretaria: '/dashboard/secretaria',
        preceptor:  '/dashboard/preceptor',
        profesor:   '/dashboard/profesor',
        alumno:     '/dashboard/alumno',
      };
      router.replace(rutas[data.user.rol] || '/dashboard/alumno');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[Colors.azul, '#0d2447']} style={styles.gradient}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoEmoji}>🏫</Text>
            </View>
            <Text style={styles.appName}>Campus Virtual</Text>
            <Text style={styles.appSub}>Río Tercero · Córdoba</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Iniciar sesión</Text>
            <Text style={styles.cardSub}>Ingresá con tu cuenta institucional</Text>

            <View style={styles.field}>
              <Text style={styles.label}>✉️  Correo electrónico</Text>
              <TextInput
                style={styles.input}
                placeholder="correo@escuela.edu.ar"
                placeholderTextColor={Colors.gris}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>🔒  Contraseña</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={Colors.gris}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity style={styles.forgotWrap}>
              <Text style={styles.forgot}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnLogin, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnLoginText}>Ingresar al Campus</Text>
              }
            </TouchableOpacity>

            {/* Roles info */}
            <View style={styles.rolesWrap}>
              <Text style={styles.rolesTitle}>ROLES DEL SISTEMA</Text>
              <View style={styles.rolesGrid}>
                {[
                  { rol: 'Director',   color: Colors.director },
                  { rol: 'Secretaria', color: Colors.secretaria },
                  { rol: 'Preceptor',  color: Colors.preceptor },
                  { rol: 'Profesor',   color: Colors.profesor },
                  { rol: 'Alumno',     color: Colors.alumno },
                ].map(r => (
                  <View key={r.rol} style={styles.roleBadge}>
                    <View style={[styles.roleDot, { backgroundColor: r.color }]} />
                    <Text style={styles.roleText}>{r.rol}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient:   { flex: 1 },
  kav:        { flex: 1 },
  scroll:     { flexGrow: 1, justifyContent: 'center', padding: 24 },

  header:     { alignItems: 'center', marginBottom: 32 },
  logoBadge:  { width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoEmoji:  { fontSize: 36 },
  appName:    { fontFamily: 'serif', fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  appSub:     { fontSize: 13, color: 'rgba(255,255,255,.6)', marginTop: 4 },

  card:       { backgroundColor: '#fff', borderRadius: 20, padding: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 8 },
  cardTitle:  { fontSize: 22, fontWeight: '700', color: Colors.texto, marginBottom: 4 },
  cardSub:    { fontSize: 13, color: Colors.gris, marginBottom: 24 },

  field:      { marginBottom: 16 },
  label:      { fontSize: 13, fontWeight: '600', color: Colors.texto, marginBottom: 6 },
  input:      { backgroundColor: Colors.claro, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, padding: 13, fontSize: 15, color: Colors.texto },

  forgotWrap: { alignItems: 'flex-end', marginBottom: 20, marginTop: -4 },
  forgot:     { fontSize: 13, color: Colors.azul2 },

  btnLogin:       { backgroundColor: Colors.azul, borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 24 },
  btnDisabled:    { opacity: 0.6 },
  btnLoginText:   { color: '#fff', fontWeight: '700', fontSize: 15 },

  rolesWrap:  { backgroundColor: Colors.claro, borderRadius: 10, padding: 14 },
  rolesTitle: { fontSize: 10, fontWeight: '700', color: Colors.gris, letterSpacing: 1.5, marginBottom: 10 },
  rolesGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleBadge:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleDot:    { width: 8, height: 8, borderRadius: 4 },
  roleText:   { fontSize: 12, color: Colors.texto },
});
