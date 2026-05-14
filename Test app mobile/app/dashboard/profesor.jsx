import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, RefreshControl, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import Header from '../../components/layout/Header';
import AvisoCard from '../../components/ui/AvisoCard';
import api from '../../services/api';
import { Colors } from '../../constants/colors';

export default function ProfesorDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('Mis Tareas');
  const [avisos, setAvisos]       = useState([]);
  const [titulo, setTitulo]       = useState('');
  const [contenido, setContenido] = useState('');
  const [tipo, setTipo]           = useState('tarea');
  const [refreshing, setRefreshing] = useState(false);

  const cargar = useCallback(async () => {
    try { const { data } = await api.get('/avisos'); setAvisos(data); } catch {}
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  const onRefresh = async () => { setRefreshing(true); await cargar(); setRefreshing(false); };
  const handleLogout = async () => { await logout(); router.replace('/auth/login'); };

  const publicar = async () => {
    if (!titulo || !contenido) return Alert.alert('Error', 'Completá todos los campos');
    try {
      await api.post('/avisos', { titulo, contenido, tipo });
      setTitulo(''); setContenido('');
      Alert.alert('✅', 'Publicado correctamente');
      cargar();
    } catch { Alert.alert('Error', 'No se pudo publicar'); }
  };

  const misTareas = avisos.filter(a => a.autor_id === user?.id);

  return (
    <View style={styles.container}>
      <Header titulo="Panel Profesor" usuario={user} onLogout={handleLogout} />
      <View style={styles.tabs}>
        {['Mis Tareas', 'Avisos'].map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab===tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab===tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.verde]} />}>
        {activeTab === 'Mis Tareas' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Publicar tarea o aviso</Text>
              <TextInput style={styles.input} placeholder="Título" value={titulo} onChangeText={setTitulo} />
              <View style={styles.tipoRow}>
                {['tarea','general'].map(t => (
                  <TouchableOpacity key={t} style={[styles.tipoBadge, tipo===t && styles.tipoBadgeActive]} onPress={() => setTipo(t)}>
                    <Text style={[styles.tipoText, tipo===t && styles.tipoTextActive]}>{t === 'tarea' ? '📚 Tarea' : '📣 Aviso'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={[styles.input, styles.textarea]} placeholder="Descripción..." value={contenido} onChangeText={setContenido} multiline numberOfLines={4} />
              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: Colors.verde }]} onPress={publicar}>
                <Text style={styles.btnText}>📤 Publicar</Text>
              </TouchableOpacity>
            </View>
            {misTareas.length === 0
              ? <View style={styles.empty}><Text style={styles.emptyIcon}>📚</Text><Text style={styles.emptyText}>Aún no publicaste nada</Text></View>
              : misTareas.map(a => <AvisoCard key={a.id} aviso={a} />)
            }
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
  tabActive:      { backgroundColor: Colors.verde },
  tabText:        { fontSize: 13, fontWeight: '600', color: Colors.gris },
  tabTextActive:  { color: '#fff' },
  scroll:         { flex: 1 },
  scrollContent:  { padding: 16 },
  card:           { backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardTitle:      { fontSize: 15, fontWeight: '700', color: Colors.texto, marginBottom: 14 },
  input:          { backgroundColor: Colors.claro, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 14, color: Colors.texto, marginBottom: 10 },
  textarea:       { minHeight: 90, textAlignVertical: 'top' },
  tipoRow:        { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tipoBadge:      { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', backgroundColor: Colors.claro, borderWidth: 1, borderColor: '#e5e7eb' },
  tipoBadgeActive:{ backgroundColor: Colors.verde, borderColor: Colors.verde },
  tipoText:       { fontSize: 13, fontWeight: '600', color: Colors.gris },
  tipoTextActive: { color: '#fff' },
  btnPrimary:     { borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  btnText:        { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty:          { alignItems: 'center', paddingVertical: 48 },
  emptyIcon:      { fontSize: 36, marginBottom: 10 },
  emptyText:      { color: Colors.gris, fontSize: 14 },
});
