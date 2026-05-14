import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, RefreshControl, Alert, Modal, Picker
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import Header from '../../components/layout/Header';
import AvisoCard from '../../components/ui/AvisoCard';
import api from '../../services/api';
import { Colors } from '../../constants/colors';

const TABS = ['Inicio', 'Avisos', 'Usuarios', 'Actividad'];

export default function DirectorDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('Inicio');
  const [avisos, setAvisos]       = useState([]);
  const [usuarios, setUsuarios]   = useState([]);
  const [logs, setLogs]           = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // Form aviso
  const [titulo, setTitulo]       = useState('');
  const [contenido, setContenido] = useState('');
  const [tipo, setTipo]           = useState('general');

  // Form usuario
  const [uNombre, setUNombre]     = useState('');
  const [uEmail, setUEmail]       = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRol, setURol]           = useState('alumno');

  const cargar = useCallback(async () => {
    try {
      const [a, u, l] = await Promise.all([
        api.get('/avisos'),
        api.get('/users'),
        api.get('/logs'),
      ]);
      setAvisos(a.data);
      setUsuarios(u.data);
      setLogs(l.data);
    } catch {}
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const onRefresh = async () => { setRefreshing(true); await cargar(); setRefreshing(false); };

  const handleLogout = async () => { await logout(); router.replace('/auth/login'); };

  const publicarAviso = async () => {
    if (!titulo || !contenido) return Alert.alert('Error', 'Completá título y contenido');
    try {
      await api.post('/avisos', { titulo, contenido, tipo });
      setTitulo(''); setContenido('');
      Alert.alert('✅', 'Aviso publicado');
      cargar();
    } catch { Alert.alert('Error', 'No se pudo publicar'); }
  };

  const crearUsuario = async () => {
    if (!uNombre || !uEmail || !uPassword) return Alert.alert('Error', 'Completá todos los campos');
    try {
      await api.post('/users', { nombre: uNombre, email: uEmail, password: uPassword, rol: uRol });
      setUNombre(''); setUEmail(''); setUPassword('');
      Alert.alert('✅', 'Usuario creado');
      cargar();
    } catch { Alert.alert('Error', 'No se pudo crear el usuario'); }
  };

  const eliminarAviso = (id) => {
    Alert.alert('Eliminar', '¿Eliminás este aviso?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await api.delete(`/avisos/${id}`); cargar(); } }
    ]);
  };

  const ROL_COLOR = { director:'#7c3aed', secretaria:'#2256a8', preceptor:'#0e7490', profesor:'#16a34a', alumno:'#b45309' };

  return (
    <View style={styles.container}>
      <Header titulo="Panel Director" usuario={user} onLogout={handleLogout} />

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.azul]} />}
      >

        {/* INICIO */}
        {activeTab === 'Inicio' && (
          <View>
            <View style={styles.statsGrid}>
              {[
                { icon:'👥', val: usuarios.length,  label:'Usuarios' },
                { icon:'📢', val: avisos.length,    label:'Avisos' },
                { icon:'🎓', val: usuarios.filter(u=>u.rol==='alumno').length, label:'Alumnos' },
                { icon:'📋', val: logs.length,      label:'Registros' },
              ].map(s => (
                <View key={s.label} style={styles.statCard}>
                  <Text style={styles.statIcon}>{s.icon}</Text>
                  <Text style={styles.statVal}>{s.val}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.sectionTitle}>Últimos avisos</Text>
            {avisos.slice(0,3).map(a => <AvisoCard key={a.id} aviso={a} />)}
          </View>
        )}

        {/* AVISOS */}
        {activeTab === 'Avisos' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Publicar aviso</Text>
              <TextInput style={styles.input} placeholder="Título" value={titulo} onChangeText={setTitulo} />
              <View style={styles.tipoRow}>
                {['general','tarea','horario','urgente'].map(t => (
                  <TouchableOpacity key={t} style={[styles.tipoBadge, tipo===t && styles.tipoBadgeActive]} onPress={() => setTipo(t)}>
                    <Text style={[styles.tipoText, tipo===t && styles.tipoTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={[styles.input, styles.textarea]} placeholder="Contenido del aviso..." value={contenido} onChangeText={setContenido} multiline numberOfLines={4} />
              <TouchableOpacity style={styles.btnPrimary} onPress={publicarAviso}>
                <Text style={styles.btnPrimaryText}>📤 Publicar</Text>
              </TouchableOpacity>
            </View>
            {avisos.map(a => (
              <View key={a.id}>
                <AvisoCard aviso={a} />
                <TouchableOpacity style={styles.btnDanger} onPress={() => eliminarAviso(a.id)}>
                  <Text style={styles.btnDangerText}>🗑️ Eliminar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* USUARIOS */}
        {activeTab === 'Usuarios' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Crear usuario</Text>
              <TextInput style={styles.input} placeholder="Nombre completo" value={uNombre} onChangeText={setUNombre} />
              <TextInput style={styles.input} placeholder="Email" value={uEmail} onChangeText={setUEmail} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={styles.input} placeholder="Contraseña inicial" value={uPassword} onChangeText={setUPassword} secureTextEntry />
              <View style={styles.tipoRow}>
                {['alumno','profesor','preceptor','secretaria','director'].map(r => (
                  <TouchableOpacity key={r} style={[styles.tipoBadge, uRol===r && styles.tipoBadgeActive]} onPress={() => setURol(r)}>
                    <Text style={[styles.tipoText, uRol===r && styles.tipoTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.btnPrimary} onPress={crearUsuario}>
                <Text style={styles.btnPrimaryText}>➕ Crear usuario</Text>
              </TouchableOpacity>
            </View>
            {usuarios.map(u => (
              <View key={u.id} style={styles.userCard}>
                <View style={[styles.userAvatar, { backgroundColor: ROL_COLOR[u.rol] || Colors.gris }]}>
                  <Text style={styles.userAvatarText}>{u.nombre[0].toUpperCase()}</Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{u.nombre}</Text>
                  <Text style={styles.userEmail}>{u.email}</Text>
                </View>
                <View style={[styles.rolBadge, { backgroundColor: ROL_COLOR[u.rol] + '22' }]}>
                  <Text style={[styles.rolBadgeText, { color: ROL_COLOR[u.rol] }]}>{u.rol}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ACTIVIDAD */}
        {activeTab === 'Actividad' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Registro de actividad</Text>
            {logs.map(l => (
              <View key={l.id} style={styles.logItem}>
                <View>
                  <Text style={styles.logNombre}>{l.nombre}</Text>
                  <Text style={styles.logAccion}>{l.accion || '—'}</Text>
                </View>
                <Text style={styles.logFecha}>{new Date(l.fecha).toLocaleDateString('es-AR')}</Text>
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.claro },
  tabsScroll:      { backgroundColor: '#fff', maxHeight: 52 },
  tabsContent:     { paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' },
  tab:             { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 8, backgroundColor: Colors.claro },
  tabActive:       { backgroundColor: Colors.azul },
  tabText:         { fontSize: 13, fontWeight: '600', color: Colors.gris },
  tabTextActive:   { color: '#fff' },
  scroll:          { flex: 1 },
  scrollContent:   { padding: 16 },
  statsGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  statCard:        { width: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  statIcon:        { fontSize: 24, marginBottom: 8 },
  statVal:         { fontSize: 26, fontWeight: '700', color: Colors.texto },
  statLabel:       { fontSize: 12, color: Colors.gris, marginTop: 2 },
  sectionTitle:    { fontSize: 16, fontWeight: '700', color: Colors.texto, marginBottom: 12 },
  card:            { backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardTitle:       { fontSize: 15, fontWeight: '700', color: Colors.texto, marginBottom: 14 },
  input:           { backgroundColor: Colors.claro, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 14, color: Colors.texto, marginBottom: 10 },
  textarea:        { minHeight: 90, textAlignVertical: 'top' },
  tipoRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tipoBadge:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.claro, borderWidth: 1, borderColor: '#e5e7eb' },
  tipoBadgeActive: { backgroundColor: Colors.azul, borderColor: Colors.azul },
  tipoText:        { fontSize: 12, fontWeight: '600', color: Colors.gris },
  tipoTextActive:  { color: '#fff' },
  btnPrimary:      { backgroundColor: Colors.azul, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  btnPrimaryText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnDanger:       { backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, alignItems: 'center', marginTop: -8, marginBottom: 12 },
  btnDangerText:   { color: Colors.rojo, fontWeight: '600', fontSize: 13 },
  userCard:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  userAvatar:      { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  userAvatarText:  { color: '#fff', fontWeight: '700', fontSize: 16 },
  userInfo:        { flex: 1 },
  userName:        { fontSize: 14, fontWeight: '600', color: Colors.texto },
  userEmail:       { fontSize: 12, color: Colors.gris, marginTop: 2 },
  rolBadge:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  rolBadgeText:    { fontSize: 11, fontWeight: '700' },
  logItem:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  logNombre:       { fontSize: 13, fontWeight: '600', color: Colors.texto },
  logAccion:       { fontSize: 12, color: Colors.gris },
  logFecha:        { fontSize: 11, color: Colors.gris },
});
