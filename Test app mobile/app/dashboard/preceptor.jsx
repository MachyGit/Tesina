import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, RefreshControl, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import Header from '../../components/layout/Header';
import AvisoCard from '../../components/ui/AvisoCard';
import api from '../../services/api';
import { Colors } from '../../constants/colors';

export default function PreceptorDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('Asistencia');
  const [avisos, setAvisos]       = useState([]);
  const [alumnoId, setAlumnoId]   = useState('');
  const [estado, setEstado]       = useState('presente');
  const [refreshing, setRefreshing] = useState(false);

  const cargar = useCallback(async () => {
    try { const { data } = await api.get('/avisos'); setAvisos(data); } catch {}
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  const onRefresh = async () => { setRefreshing(true); await cargar(); setRefreshing(false); };
  const handleLogout = async () => { await logout(); router.replace('/auth/login'); };

  const registrar = async () => {
    if (!alumnoId) return Alert.alert('Error', 'Ingresá el ID del alumno');
    try {
      await api.post('/asistencia', { alumno_id: alumnoId, estado });
      setAlumnoId('');
      Alert.alert('✅', `Asistencia registrada: ${estado}`);
    } catch { Alert.alert('Error', 'No se pudo registrar'); }
  };

  const ESTADOS = ['presente', 'ausente', 'tarde'];
  const ESTADO_COLOR = { presente: Colors.verde, ausente: Colors.rojo, tarde: Colors.acento };

  return (
    <View style={styles.container}>
      <Header titulo="Panel Preceptor" usuario={user} onLogout={handleLogout} />
      <View style={styles.tabs}>
        {['Asistencia', 'Avisos'].map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab===tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab===tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.cyan]} />}>
        {activeTab === 'Asistencia' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Registrar asistencia</Text>
              <TextInput style={styles.input} placeholder="ID del alumno" value={alumnoId} onChangeText={setAlumnoId} keyboardType="numeric" />
              <View style={styles.estadoRow}>
                {ESTADOS.map(e => (
                  <TouchableOpacity key={e} style={[styles.estadoBadge, estado===e && { backgroundColor: ESTADO_COLOR[e] }]} onPress={() => setEstado(e)}>
                    <Text style={[styles.estadoText, estado===e && { color: '#fff' }]}>
                      {e === 'presente' ? '✅' : e === 'ausente' ? '❌' : '⏰'} {e}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: Colors.cyan }]} onPress={registrar}>
                <Text style={styles.btnText}>Registrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {activeTab === 'Avisos' && avisos.map(a => <AvisoCard key={a.id} aviso={a} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.claro },
  tabs:           { flexDirection: 'row', backgroundColor: '#fff', padding: 8, gap: 8 },
  tab:            { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', backgroundColor: Colors.claro },
  tabActive:      { backgroundColor: Colors.cyan },
  tabText:        { fontSize: 13, fontWeight: '600', color: Colors.gris },
  tabTextActive:  { color: '#fff' },
  scroll:         { flex: 1 },
  scrollContent:  { padding: 16 },
  card:           { backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardTitle:      { fontSize: 15, fontWeight: '700', color: Colors.texto, marginBottom: 14 },
  input:          { backgroundColor: Colors.claro, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 14, color: Colors.texto, marginBottom: 12 },
  estadoRow:      { flexDirection: 'row', gap: 8, marginBottom: 14 },
  estadoBadge:    { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: Colors.claro, borderWidth: 1, borderColor: '#e5e7eb' },
  estadoText:     { fontSize: 12, fontWeight: '600', color: Colors.gris },
  btnPrimary:     { borderRadius: 8, padding: 14, alignItems: 'center' },
  btnText:        { color: '#fff', fontWeight: '700', fontSize: 14 },
});
