import * as SecureStore from 'expo-secure-store';
import api from './api';

export const login = async (email, password) => {
  const { data } = await api.post('/auth/login', { email, password });
  await SecureStore.setItemAsync('token', data.token);
  await SecureStore.setItemAsync('user', JSON.stringify(data.user));
  return data;
};

export const logout = async () => {
  try { await api.post('/auth/logout'); } catch {}
  await SecureStore.deleteItemAsync('token');
  await SecureStore.deleteItemAsync('user');
};

export const getUser = async () => {
  const u = await SecureStore.getItemAsync('user');
  return u ? JSON.parse(u) : null;
};

export const isLoggedIn = async () => {
  const token = await SecureStore.getItemAsync('token');
  return !!token;
};
