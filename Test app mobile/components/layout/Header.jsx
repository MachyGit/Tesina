import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';

export default function Header({ titulo, usuario, onLogout }) {
  const inicial = usuario?.nombre?.[0]?.toUpperCase() || '?';

  return (
    <LinearGradient colors={[Colors.azul, Colors.azul2]} style={styles.header}>
      <View>
        <Text style={styles.titulo}>{titulo}</Text>
        <Text style={styles.sub}>Campus Virtual</Text>
      </View>
      <View style={styles.right}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{inicial}</Text>
        </View>
        <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header:     { paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo:     { fontSize: 20, fontWeight: '700', color: '#fff' },
  sub:        { fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 2 },
  right:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.acento, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  logoutBtn:  { backgroundColor: 'rgba(255,255,255,.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  logoutText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
