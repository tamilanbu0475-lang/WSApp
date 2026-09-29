import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions, Vibration,
  View,
} from 'react-native';
import ScreenBackground from '../components/ScreenBackground';


export default function AlertScreen() {
  const { width } = useWindowDimensions();
  const isMobile  = width < 768;

  const [otp, setOtp]     = useState(['', '', '', '']);
  const [safe, setSafe]   = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [location, setLocation] = useState({ latitude: null as number | null, longitude: null as number | null, accuracy: null as number | null, text: 'Getting your live location...' });
  const [police, setPolice] = useState({ name: 'Finding nearest police station...', address: 'Please wait...', distanceKm: null as number | null, mapsUrl: '' });
  const alertIdRef = useRef<string | null>(null);
  const createdRef = useRef(false);

  const inputs    = [useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null)];
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const safeOpacity = useRef(new Animated.Value(0)).current;
  const locationWatchRef = useRef<any>(null);
  const lastPoliceKeyRef = useRef('');

  // ── BLOCK BACK BUTTON until safe ──────────
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (!safe) return true; // block back
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [safe])
  );

  const API_URL = Platform.OS === 'web' ? 'http://127.0.0.1:5000' : 'http://10.81.141.192:5000';

  const getStoredUser = () => {
    try {
      const storage: any = typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : null;
      const candidates = ['wsUser', 'user', 'userData', 'wsappUser'];
      for (const key of candidates) {
        const raw = storage?.getItem?.(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed) return parsed;
        }
      }
    } catch {}
    return null;
  };

  const getStoredToken = () => {
    try {
      const storage: any = typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : null;
      const keys = ['wsToken', 'token', 'idToken', 'wsAuthToken'];
      for (const key of keys) {
        const value = storage?.getItem?.(key);
        if (value) return value;
      }
      return null;
    } catch { return null; }
  };

  const fetchNearestPolice = async (latitude: number, longitude: number, accuracy: number | null) => {
    const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    if (lastPoliceKeyRef.current === key) return;
    lastPoliceKeyRef.current = key;
    try {
      const res = await fetch(`${API_URL}/api/police/nearest?lat=${latitude}&lon=${longitude}`);
      const data = await res.json();
      if (res.ok && data?.success && data?.police) {
        const p = data.police;
        setPolice({
          name: p.name || 'Nearest Police Station',
          address: p.address || 'Address unavailable',
          distanceKm: typeof p.distanceKm === 'number' ? p.distanceKm : null,
          mapsUrl: p.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`,
        });
        updateRealSosLocation({
          latitude,
          longitude,
          accuracy: accuracy ?? undefined,
          policeStation: p.name || '',
          policeAddress: p.address || '',
          policeDistanceKm: typeof p.distanceKm === 'number' ? p.distanceKm : null,
        });
      }
    } catch {
      // Keep the SOS active even if the external police directory is unavailable.
    }
  };

  const applyLivePosition = (latitude: number, longitude: number, accuracy: number | null) => {
    setLocation({ latitude, longitude, accuracy, text: 'Live GPS location' });
    updateRealSosLocation({ latitude, longitude, accuracy: accuracy ?? undefined });
    fetchNearestPolice(latitude, longitude, accuracy);
  };

  const getLiveLocation = async () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => applyLivePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        () => setLocation(prev => ({ ...prev, text: 'Location permission not available' })),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
      // Keep refining the position while SOS is active; no waiting is required.
      try {
        locationWatchRef.current = navigator.geolocation.watchPosition(
          (pos) => applyLivePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
          () => {},
          { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
        );
      } catch {}
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocation(prev => ({ ...prev, text: 'Location permission denied' }));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      applyLivePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null);
      try {
        locationWatchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
          (next) => applyLivePosition(next.coords.latitude, next.coords.longitude, next.coords.accuracy ?? null)
        );
      } catch {}
    } catch {
      setLocation(prev => ({ ...prev, text: 'Unable to get live location' }));
    }
  };

  const createRealSos = async () => {
    if (createdRef.current) return;
    createdRef.current = true;
    try {
      const user = getStoredUser() || {};
      const token = getStoredToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/sos`, {
        method: 'POST', headers,
        body: JSON.stringify({
          uid: user?.uid || user?.id || null,
          fullName: user?.fullName || user?.name || null,
          phone: user?.phone || null,
          email: user?.email || null,
          latitude: null, longitude: null, accuracy: null, locationText: null,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.success) alertIdRef.current = data.id || null;
    } catch (e) {
      console.warn('SOS create failed:', e);
    } finally {
      // SOS record is created first. Location acquisition starts immediately after,
      // without blocking the emergency screen or waiting for a long accuracy warm-up.
      getLiveLocation();
    }
  };

  const updateRealSosLocation = async (coords: { latitude: number; longitude: number; accuracy?: number; policeStation?: string; policeAddress?: string; policeDistanceKm?: number | null }) => {
    if (!alertIdRef.current) return;
    try {
      await fetch(`${API_URL}/api/sos/${encodeURIComponent(alertIdRef.current)}/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
      });
    } catch {}
  };

  useEffect(() => {
    // Start vibration
    Vibration.vibrate([400, 300, 400, 300, 400, 300], true);
    createRealSos();

    // Timer
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);

    // Pulse animation
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();

    return () => {
      Vibration.cancel();
      clearInterval(timer);
      loop.stop();
      try {
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof locationWatchRef.current === 'number') {
          navigator.geolocation.clearWatch(locationWatchRef.current);
        } else {
          locationWatchRef.current?.remove?.();
        }
      } catch {}
    };
  }, []);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleOtp = (val: string, idx: number) => {
    const n = [...otp];
    n[idx] = val;
    setOtp(n);
    if (val && idx < 3) inputs[idx + 1].current?.focus();
    if (n.every(d => d !== '') && n.join('').length === 4) {
      // All 4 digits entered — stop alert
      setTimeout(() => markSafe(), 300);
    }
  };

  const handleKey = (e: any, idx: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0)
      inputs[idx - 1].current?.focus();
  };

  const markSafe = async () => {
    Vibration.cancel();
    try {
      if (alertIdRef.current) {
        await fetch(`${API_URL}/api/sos/${encodeURIComponent(alertIdRef.current)}/resolve`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch {}
    setSafe(true);
    Animated.timing(safeOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    setTimeout(() => router.replace('/' as any), 2500);
  };

  // ── SAFE SCREEN ───────────────────────────
  if (safe) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <ScreenBackground opacity={0.18} mobileOpacity={0.10} desktopWidth="55%" />
        <StatusBar barStyle="light-content" backgroundColor="#1A0310" />
        <View style={styles.glowGreen} />
        <Animated.View style={[styles.safeCard, { opacity: safeOpacity }]}>
          <View style={[styles.cardTopLine, { backgroundColor: 'rgba(74,222,128,0.5)' }]} />
          <View style={styles.safeIco}><Text style={{ fontSize: 52 }}>🛡️</Text></View>
          <Text style={styles.safeTitle}>She is Safe!</Text>
          <Text style={styles.safeSub}>
            Alert stopped. All your emergency contacts have been notified that you are safe.
          </Text>
          <View style={styles.safeBadge}>
            <Text style={styles.safeBadgeTxt}>✅ ALERT RESOLVED</Text>
          </View>
          <Text style={styles.safeRedirect}>Redirecting to home...</Text>
        </Animated.View>
      </View>
    );
  }

  // ── ALERT SCREEN ──────────────────────────
  return (
    <View style={styles.container}>
      <ScreenBackground opacity={0.18} mobileOpacity={0.10} desktopWidth="55%" />
      <View style={styles.overlay} />
      <StatusBar barStyle="light-content" backgroundColor="#1A0310" />
      <View style={styles.glowRed} />
      <View style={styles.glowBR} />

      {/* ── TOP BAR (no back button — locked) ── */}
      <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
        <View style={styles.sosActiveBadge}>
          <View style={styles.sosDot} />
          <Text style={styles.sosActiveText}>SOS ACTIVE</Text>
        </View>
        <Text style={styles.topTitle}>🚨 Emergency Alert</Text>
        <View style={styles.timerBadge}>
          <Text style={styles.timerTxt}>{formatTime(elapsed)}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, !isMobile && styles.scrollDesktop]}
        showsVerticalScrollIndicator={false}
      >

        {/* PULSING SOS */}
        <View style={styles.alertHero}>
          <View style={styles.alertTopLine} />
          <Animated.View style={[styles.sosOuter, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.sosMid}>
              <View style={styles.sosCore}>
                <Text style={styles.sosTxt}>🆘</Text>
                <Text style={styles.sosSubTxt}>ALERT ACTIVE</Text>
              </View>
            </View>
          </Animated.View>
          <Text style={styles.alertTitle}>Emergency Alert Sent!</Text>
          <Text style={styles.alertSub}>
            Your SOS alert is being recorded with your live location
          </Text>
        </View>

        {/* STATUS ROW */}
        <View style={styles.statusGrid}>
          {[
            { i: '📡', t: 'Alert Recorded', c: '#4ade80' },
            { i: '📍', t: 'Location Shared', c: '#4ade80' },
            { i: '☁️', t: 'Admin Synced',    c: '#4ade80' },
          ].map((s, idx) => (
            <View key={idx} style={styles.statusCard}>
              <Text style={styles.statusIco}>{s.i}</Text>
              <Text style={styles.statusTxt}>{s.t}</Text>
              <View style={[styles.statusDot, { backgroundColor: s.c }]} />
            </View>
          ))}
        </View>

        {/* LOCATION */}
        <View style={styles.card}>
          <View style={styles.cardTopLine} />
          <Text style={styles.cardTitle}>📍 Your Live Location</Text>
          <View style={styles.locationBox}>
            <Text style={styles.locationTxt}>{location.text}</Text>
            <Text style={styles.locationCoords}>{location.latitude != null && location.longitude != null ? `${location.latitude.toFixed(6)}°N, ${location.longitude.toFixed(6)}°E${location.accuracy != null ? `  •  ±${Math.round(location.accuracy)} m` : ''}` : 'Getting GPS...'}</Text>
          </View>
          <TouchableOpacity
            style={styles.mapBtn}
            onPress={() => {
              const url = location.latitude != null && location.longitude != null
                ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}`
                : 'https://maps.google.com';
              Linking.openURL(url);
            }}
          >
            <Text style={styles.mapBtnTxt}>🗺️  Open in Google Maps</Text>
          </TouchableOpacity>
        </View>

        {/* NEAREST POLICE */}
        <View style={styles.card}>
          <View style={styles.cardTopLine} />
          <Text style={styles.cardTitle}>🚔 Nearest Police Station</Text>
          <View style={styles.policeRow}>
            <View style={styles.policeIco}><Text style={{ fontSize: 24 }}>🚔</Text></View>
            <View style={styles.policeInfo}>
              <Text style={styles.policeName}>{police.name}</Text>
              <Text style={styles.policeAddr}>{police.address}</Text>
              <Text style={styles.policeDist}>{police.distanceKm != null ? `📍 ${police.distanceKm.toFixed(2)} km away` : '📍 Calculating nearest station...'}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.callPoliceBtn} onPress={() => Linking.openURL('tel:100')}>
            <Text style={styles.callPoliceTxt}>📞  Call Police — 100</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.callPoliceBtn, { marginTop: 8 }]}
            disabled={!police.mapsUrl}
            onPress={() => police.mapsUrl && Linking.openURL(police.mapsUrl)}
          >
            <Text style={styles.callPoliceTxt}>🗺️  Open Nearest Police Station</Text>
          </TouchableOpacity>
        </View>

        {/* ── STOP ALERT — OTP ── */}
        <View style={[styles.card, styles.stopCard]}>
          <View style={[styles.cardTopLine, { backgroundColor: 'rgba(74,222,128,0.45)' }]} />
          <Text style={styles.stopTitle}>🛡️ Stop Alert</Text>
          <Text style={styles.stopSub}>
            Enter 4-digit OTP sent to your registered number to confirm you are safe
          </Text>

          <View style={styles.otpRow}>
            {otp.map((digit, idx) => (
              <View key={idx} style={[styles.otpBox, digit && styles.otpBoxFilled]}>
                <TextInput
                  ref={inputs[idx]}
                  style={[styles.otpInp, { outlineStyle: 'none' } as any]}
                  value={digit}
                  onChangeText={v => handleOtp(v.slice(-1), idx)}
                  onKeyPress={e => handleKey(e, idx)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                />
              </View>
            ))}
          </View>

          <Text style={styles.otpHint}>💡 Enter the 4-digit safety OTP to stop the alert</Text>

          {/* Manual safe button */}
          <TouchableOpacity style={styles.safeBtn} onPress={markSafe} activeOpacity={0.85}>
            <Text style={styles.safeBtnTxt}>✅  She is Safe — Stop Alert</Text>
          </TouchableOpacity>
        </View>

        {/* EMERGENCY HELPLINES */}
        <View style={styles.card}>
          <View style={styles.cardTopLine} />
          <Text style={styles.cardTitle}>📞 Emergency Helplines</Text>
          {[
            ['🚔', 'Police',          '100'],
            ['👩', 'Women Helpline',  '1091'],
            ['🚑', 'Ambulance',       '108'],
          ].map(([ico, name, num]) => (
            <TouchableOpacity
              key={num}
              style={styles.hlRow}
              onPress={() => Linking.openURL(`tel:${num}`)}
            >
              <Text style={{ fontSize: 20 }}>{ico}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.hlName}>{name}</Text>
                <Text style={styles.hlNum}>{num}</Text>
              </View>
              <Text style={styles.hlCall}>Call →</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLine} />
          <Text style={styles.footerTxt}>Always With You</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
    bgImage: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    top: 0,
    width: '55%',
    height: '100%',
    opacity: 0.18,
    tintColor: '#ffffff',
  },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(26,3,16,0.72)',
    zIndex: 0,
  },
  container: { flex: 1, backgroundColor: '#1A0310' },
  glowRed:   { position: 'absolute', top: -60, left: -60, width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(192,57,43,0.32)' },
  glowBR:    { position: 'absolute', bottom: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(11,110,79,0.1)' },
  glowGreen: { position: 'absolute', top: '20%', left: '20%', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(11,110,79,0.2)' },

  topBar:       { backgroundColor: 'rgba(20,2,12,0.92)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(192,57,43,0.3)', zIndex: 10 },
  topBarMobile: { paddingTop: 44 },
  sosActiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(192,57,43,0.12)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.3)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  sosDot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: '#f87171', shadowColor: '#f87171', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4, elevation: 4 },
  sosActiveText:{ color: '#f87171', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  topTitle:     { color: '#fff', fontSize: 14, fontWeight: '800' },
  timerBadge:   { backgroundColor: 'rgba(192,57,43,0.15)', borderWidth: 1, borderColor: 'rgba(192,57,43,0.35)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  timerTxt:     { color: '#f87171', fontSize: 13, fontWeight: '800', letterSpacing: 2 },

  scroll:        { alignItems: 'center', paddingBottom: 30 },
  scrollDesktop: { paddingHorizontal: 40, maxWidth: 680, alignSelf: 'center', width: '100%' },

  alertHero:    { width: '100%', backgroundColor: 'rgba(192,57,43,0.07)', borderBottomWidth: 1, borderBottomColor: 'rgba(192,57,43,0.2)', padding: 28, alignItems: 'center', position: 'relative', overflow: 'hidden' },
  alertTopLine: { position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, backgroundColor: 'rgba(192,57,43,0.45)' },
  sosOuter:     { width: 148, height: 148, borderRadius: 74, borderWidth: 2.5, borderColor: 'rgba(192,57,43,0.55)', alignItems: 'center', justifyContent: 'center', marginBottom: 18, shadowColor: '#C0392B', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 22, elevation: 14 },
  sosMid:       { width: 120, height: 120, borderRadius: 60, borderWidth: 1.5, borderColor: 'rgba(192,57,43,0.3)', alignItems: 'center', justifyContent: 'center' },
  sosCore:      { width: 94, height: 94, borderRadius: 47, backgroundColor: 'rgba(192,57,43,0.2)', borderWidth: 1.5, borderColor: 'rgba(192,57,43,0.55)', alignItems: 'center', justifyContent: 'center' },
  sosTxt:       { fontSize: 38 },
  sosSubTxt:    { color: '#f87171', fontSize: 8, fontWeight: '800', letterSpacing: 1.5, marginTop: 2 },
  alertTitle:   { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 8 },
  alertSub:     { color: 'rgba(255,255,255,0.42)', fontSize: 12, textAlign: 'center' },

  statusGrid:   { flexDirection: 'row', gap: 10, width: '100%', paddingHorizontal: 16, marginVertical: 16 },
  statusCard:   { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 12, alignItems: 'center', gap: 5 },
  statusIco:    { fontSize: 20 },
  statusTxt:    { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  statusDot:    { width: 6, height: 6, borderRadius: 3, shadowColor: '#4ade80', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4, elevation: 3 },

  card:         { width: '100%', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 18, padding: 18, marginBottom: 14, overflow: 'hidden', paddingHorizontal: 16 },
  cardTopLine:  { position: 'absolute', top: 0, left: '15%', right: '15%', height: 1, backgroundColor: 'rgba(201,168,76,0.3)' },
  cardTitle:    { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 14 },

  locationBox:  { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 12 },
  locationTxt:  { color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: '700' },
  locationCoords:{ color: 'rgba(255,255,255,0.42)', fontSize: 12, marginTop: 4 },
  mapBtn:       { backgroundColor: 'rgba(96,165,250,0.1)', borderWidth: 1, borderColor: 'rgba(96,165,250,0.28)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  mapBtnTxt:    { color: '#60a5fa', fontSize: 13, fontWeight: '700' },

  policeRow:    { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  policeIco:    { width: 48, height: 48, borderRadius: 13, backgroundColor: 'rgba(26,58,107,0.2)', borderWidth: 1, borderColor: 'rgba(26,58,107,0.3)', alignItems: 'center', justifyContent: 'center' },
  policeInfo:   { flex: 1 },
  policeName:   { color: '#fff', fontSize: 14, fontWeight: '800' },
  policeAddr:   { color: 'rgba(255,255,255,0.42)', fontSize: 12, marginTop: 3 },
  policeDist:   { color: 'rgba(74,222,128,0.72)', fontSize: 11, marginTop: 3 },
  callPoliceBtn:{ backgroundColor: 'rgba(26,58,107,0.18)', borderWidth: 1, borderColor: 'rgba(96,165,250,0.28)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  callPoliceTxt:{ color: '#60a5fa', fontSize: 13, fontWeight: '700' },

  stopCard:     { borderColor: 'rgba(74,222,128,0.22)', backgroundColor: 'rgba(74,222,128,0.04)' },
  stopTitle:    { color: '#fff', fontSize: 17, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  stopSub:      { color: 'rgba(255,255,255,0.42)', fontSize: 12, textAlign: 'center', marginBottom: 20, lineHeight: 18 },

  otpRow:       { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 10 },
  otpBox:       { width: 62, height: 70, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  otpBoxFilled: { borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.09)', shadowColor: '#4ade80', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  otpInp:       { color: '#4ade80', fontSize: 26, fontWeight: '900', textAlign: 'center', width: '100%', height: '100%' },
  otpHint:      { color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center', marginBottom: 16 },

  safeBtn:      { backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.38)', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  safeBtnTxt:   { color: '#4ade80', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },

  hlRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  hlName:       { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '700' },
  hlNum:        { color: '#C9A84C', fontSize: 14, fontWeight: '800', marginTop: 2 },
  hlCall:       { color: '#C9A84C', fontSize: 12, fontWeight: '700' },

  safeCard:     { width: '100%', maxWidth: 380, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)', borderRadius: 28, padding: 36, alignItems: 'center', gap: 14, overflow: 'hidden' },
  safeIco:      { width: 100, height: 100, borderRadius: 28, backgroundColor: 'rgba(11,110,79,0.18)', borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.35)', alignItems: 'center', justifyContent: 'center' },
  safeTitle:    { color: '#fff', fontSize: 28, fontWeight: '900' },
  safeSub:      { color: 'rgba(255,255,255,0.42)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  safeBadge:    { backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  safeBadgeTxt: { color: '#4ade80', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  safeRedirect: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },

  footer:       { width: '100%', alignItems: 'center', paddingVertical: 20 },
  footerLine:   { width: 60, height: 1, backgroundColor: 'rgba(201,168,76,0.3)', marginBottom: 14 },
  footerTxt:    { color: 'rgba(201,168,76,0.65)', fontSize: 13, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
});
