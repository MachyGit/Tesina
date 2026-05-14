import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl,
  StyleSheet, TouchableOpacity, FlatList, Alert
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../hooks/useAuth';
import AvisoCard from '../../components/ui/AvisoCard';
import Header from '../../components/layout/Header';
import api from '../../services/api';
import { Colors } from '../../constants/colors';

const TABS = ['Avisos', 'Tareas', 'Asistencia'];

export default function AlumnoDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab]     = useState('Avisos');
  const [avisos, setAvisos]           = useState([]);
  const [asistencia, setAsistencia]   = useState([]);
  const [refreshing, setRefreshing]   = useState(false);

  const cargarDatos = useCallback(async () => {
    try {
      const { data } = await api.get('/avisos');
      setAvisos(data);
      if (user?.id) {
        const res = await api.get(`/asistencia/${user.id}`);
        setAsistencia(res.data);
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar los datos');
    }
  }, [user]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const onRefresh = async () => {
    setRefreshing(true);
    await cargarDatos();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/auth/login');
  };

  const tareas = avisos.filter(a => a.tipo === 'tarea');

  const ESTADO_COLOR = { presente: Colors.verde, ausente: Colors.rojo, tarde: Colors.acento };

  return (
    <View style={styles.container}>
      <Header titulo={`Hola, ${user?.nombre?.split(' ')[0] || 'Alumno'} 👋`} usuario={user} onLogout={handleLogout} />

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.azul]} />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* AVISOS */}
        {activeTab === 'Avisos' && (
          <View>
            {avisos.filter(a => a.tipo !== 'tarea').length === 0
              ? <View style={styles.empty}><Text style={styles.emptyIcon}>📭</Text><Text style={styles.emptyText}>No hay avisos</Text></View>
              : avisos.filter(a => a.tipo !== 'tarea').map(a => <AvisoCard key={a.id} aviso={a} />)
            }
          </View>
        )}

        {/* TAREAS */}
        {activeTab === 'Tareas' && (
          <View>
            {tareas.length === 0
              ? <View style={styles.empty}><Text style={styles.emptyIcon}>📚</Text><Text style={styles.emptyText}>No hay tareas</Text></View>
              : tareas.map(a => <AvisoCard key={a.id} aviso={a} />)
            }
          </View>
        )}

        {/* ASISTENCIA */}
        {activeTab === 'Asistencia' && (
          <View>
            {asistencia.length === 0
              ? <View style={styles.empty}><Text style={styles.emptyIcon}>✅</Text><Text style={styles.emptyText}>Sin registros de asistencia</Text></View>
              : asistencia.map(a => (
                  <View key={a.id} style={styles.asistItem}>
                    <View style={[styles.asistDot, { backgroundColor: ESTADO_COLOR[a.estado] }]} />
                    <Text style={styles.asistFecha}>{new Date(a.fecha).toLocaleDateString('es-AR')}</Text>
                    <Text style={[styles.asistEstado, { color: ESTADO_COLOR[a.estado] }]}>
                      {a.estado.charAt(0).toUpperCase() + a.estado.slice(1)}
                    </Text>
                  </View>
                ))
            }
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.claro },
  tabs:           { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  tab:            { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', backgroundColor: Colors.claro },
  tabActive:      { backgroundColor: Colors.azul },
  tabText:        { fontSize: 13, fontWeight: '600', color: Colors.gris },
  tabTextActive:  { color: '#fff' },
  scroll:         { flex: 1 },
  scrollContent:  { padding: 16 },
  empty:          { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:      { fontSize: 40, marginBottom: 12 },
  emptyText:      { color: Colors.gris, fontSize: 15 },
  asistItem:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8 },
  asistDot:       { width: 10, height: 10, borderRadius: 5 },
  asistFecha:     { flex: 1, fontSize: 14, color: Colors.texto, fontWeight: '500' },
  asistEstado:    { fontSize: 13, fontWeight: '600' },
});
