# 📱 Campus Virtual — App Móvil
React Native + Expo · Android & iOS

## 🚀 Cómo arrancar

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar la URL del backend
Editá `constants/index.js` y poné la IP de tu servidor:
```js
export const API_URL = 'http://192.168.1.X:5000/api'; // red local
// o
export const API_URL = 'https://tu-backend.railway.app/api'; // producción
```

### 3. Correr la app
```bash
npx expo start
```
Escaneá el QR con **Expo Go** desde tu celu.

---

## 📦 Build para las tiendas

### Configurar EAS
```bash
npm install -g eas-cli
eas login
eas build:configure
```

### Build Android (APK para prueba)
```bash
eas build --platform android --profile preview
```

### Build producción (Google Play + App Store)
```bash
eas build --platform all --profile production
```

---

## 📁 Estructura
```
escuela-mobile/
├── app/
│   ├── _layout.jsx          → Root layout
│   ├── index.jsx            → Redirige según rol
│   ├── auth/
│   │   └── login.jsx        → Pantalla de login
│   └── dashboard/
│       ├── director.jsx     → Panel director
│       ├── secretaria.jsx   → Panel secretaria
│       ├── preceptor.jsx    → Panel preceptor
│       ├── profesor.jsx     → Panel profesor
│       └── alumno.jsx       → Panel alumno
├── components/
│   ├── ui/AvisoCard.jsx     → Tarjeta de aviso
│   └── layout/Header.jsx    → Header con gradiente
├── hooks/useAuth.js         → Contexto de autenticación
├── services/
│   ├── api.js               → Axios con JWT
│   └── auth.js              → Login, logout, getUser
└── constants/
    ├── colors.js            → Paleta de colores
    └── index.js             → URL del backend
```

## 🎨 Roles y colores
- 🟣 Director   → #7c3aed
- 🔵 Secretaria → #2256a8
- 🔵 Preceptor  → #0e7490
- 🟢 Profesor   → #15803d
- 🟡 Alumno     → #e8a020
