import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

const TIPO_CONFIG = {
  general:  { color: '#4338ca', bg: '#e0e7ff', emoji: '📣' },
  tarea:    { color: '#16a34a', bg: '#dcfce7', emoji: '📚' },
  horario:  { color: '#b45309', bg: '#fef3c7', emoji: '🕐' },
  urgente:  { color: '#dc2626', bg: '#fee2e2', emoji: '🚨' },
};

export default function AvisoCard({ aviso }) {
  const cfg = TIPO_CONFIG[aviso.tipo] || TIPO_CONFIG.general;
  const fecha = new Date(aviso.fecha).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.badgeText, { color: cfg.color }]}>
            {cfg.emoji} {aviso.tipo.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.fecha}>{fecha}</Text>
      </View>
      <Text style={styles.titulo}>{aviso.titulo}</Text>
      <Text style={styles.contenido} numberOfLines={3}>{aviso.contenido}</Text>
      {aviso.autor && (
        <Text style={styles.autor}>Por: {aviso.autor}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  fecha:     { fontSize: 11, color: Colors.gris },
  titulo:    { fontSize: 15, fontWeight: '700', color: Colors.texto, marginBottom: 6 },
  contenido: { fontSize: 13, color: Colors.gris, lineHeight: 19 },
  autor:     { fontSize: 11, color: Colors.gris, marginTop: 8, fontStyle: 'italic' },
});
