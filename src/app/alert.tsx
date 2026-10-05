import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions, Vibration, Platform,
  View,
} from 'react-native';
import ScreenBackground from '../components/ScreenBackground';
import * as Location from 'expo-location';

const MSG91_MOBILE_WIDGET_ID = process.env.EXPO_PUBLIC_MSG91_WIDGET_ID || '';
const MSG91_MOBILE_TOKEN_AUTH = process.env.EXPO_PUBLIC_MSG91_TOKEN_AUTH || '';
const MSG91_WEB_WIDGET_ID = process.env.EXPO_PUBLIC_MSG91_WEB_WIDGET_ID || '';
const MSG91_WEB_TOKEN_AUTH = process.env.EXPO_PUBLIC_MSG91_WEB_TOKEN_AUTH || '';

type WebOtpApi = {
  sendOtp: (identifier: string, success?: (data: any) => void, failure?: (error: any) => void) => void;
  retryOtp: (channel: string | null, success?: (data: any) => void, failure?: (error: any) => void, reqId?: string) => void;
  verifyOtp: (otp: string, success?: (data: any) => void, failure?: (error: any) => void, reqId?: string) => void;
};

declare global {
  interface Window {
    sendOtp?: WebOtpApi['sendOtp'];
    retryOtp?: WebOtpApi['retryOtp'];
    verifyOtp?: WebOtpApi['verifyOtp'];
    initSendOTP?: (configuration: any) => void;
  }
}


export default function AlertScreen() {
  const { width } = useWindowDimensions();
  const isMobile  = width < 768;

  const [otp, setOtp]     = useState(['', '', '', '']);
  const [safe, setSafe]   = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [location, setLocation] = useState({ latitude: null as number | null, longitude: null as number | null, accuracy: null as number | null, text: 'Getting your live location...' });
  const [police, setPolice] = useState({ name: 'Finding nearest police station...', address: 'Please wait...', distanceKm: null as number | null, mapsUrl: '' });
  const [sosSaved, setSosSaved] = useState(false);
  const locationWatchRef = useRef<any>(null);
  const policeTimerRef = useRef<any>(null);
  const alertIdRef = useRef<string | null>(null);
  const createdRef = useRef(false);
  const contactsNotifiedRef = useRef(false);
  const stopOtpSentRef = useRef(false);
  const stopOtpReqIdRef = useRef('');

  const inputs    = [useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null)];
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const safeOpacity = useRef(new Animated.Value(0)).current;

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

  const API_URL =
    process.env.EXPO_PUBLIC_BACKEND_URL || 'https://wsapp-9w4r.onrender.com';

  const getStoredUser = async () => {
    try {
      const raw = await AsyncStorage.getItem('wsUser');
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  };

  const getStoredToken = async () => {
    try {
      return await AsyncStorage.getItem('wsToken');
    } catch { return null; }
  };

  const getContactsForUser = async (uid: string) => {
    if (!uid) return [];
    try {
      const raw = await AsyncStorage.getItem(`wsapp_emergency_contacts_${uid.trim().toLowerCase()}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((c: any) => c?.phone) : [];
    } catch { return []; }
  };

  const getWebIdentifier = (phone: string) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    return digits;
  };

  const loadWebOtpSdk = async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
    if (!MSG91_WEB_WIDGET_ID || !MSG91_WEB_TOKEN_AUTH) return false;
    if (window.sendOtp && window.verifyOtp && window.retryOtp) return true;
    await new Promise<void>((resolve, reject) => {
      const existing = document.getElementById('msg91-otp-sdk');
      if (existing) {
        const timer = window.setInterval(() => {
          if (window.sendOtp && window.verifyOtp && window.retryOtp) {
            window.clearInterval(timer); resolve();
          }
        }, 100);
        window.setTimeout(() => { window.clearInterval(timer); reject(new Error('MSG91 OTP SDK unavailable')); }, 10000);
        return;
      }
      const script = document.createElement('script');
      script.id = 'msg91-otp-sdk';
      script.src = 'https://verify.msg91.com/otp-provider.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load MSG91 OTP SDK'));
      document.head.appendChild(script);
    });
    window.initSendOTP?.({
      widgetId: MSG91_WEB_WIDGET_ID,
      tokenAuth: MSG91_WEB_TOKEN_AUTH,
      exposeMethods: true,
      identifier: '',
      success: (data: any) => data,
      failure: (error: any) => error,
    });
    return !!(window.sendOtp && window.verifyOtp && window.retryOtp);
  };

  const sendStopOtp = async (phone: string) => {
    if (stopOtpSentRef.current || !phone) return;
    stopOtpSentRef.current = true;
    try {
      const identifier = getWebIdentifier(phone);
      if (Platform.OS === 'web') {
        const ready = await loadWebOtpSdk();
        if (!ready || !window.sendOtp) throw new Error('MSG91 Web OTP is unavailable');
        await new Promise<void>((resolve, reject) => {
          window.sendOtp!(identifier, (data: any) => {
            stopOtpReqIdRef.current = String(data?.reqId ?? data?.reqID ?? data?.requestId ?? '');
            resolve();
          }, (error: any) => reject(new Error(error?.message || 'Unable to send safety OTP')));
        });
        return;
      }
      if (!MSG91_MOBILE_WIDGET_ID || !MSG91_MOBILE_TOKEN_AUTH) throw new Error('MSG91 mobile OTP is not configured');
      const mod = await import('@msg91comm/sendotp-react-native');
      const OTPWidget = mod.OTPWidget;
      await OTPWidget.initializeWidget(MSG91_MOBILE_WIDGET_ID, MSG91_MOBILE_TOKEN_AUTH);
      const response = await OTPWidget.sendOTP({ identifier });
      stopOtpReqIdRef.current = String(response?.reqId ?? response?.reqID ?? response?.requestId ?? '');
      if (!stopOtpReqIdRef.current) throw new Error(response?.message || 'MSG91 did not return a request ID');
    } catch (e) {
      stopOtpSentRef.current = false;
      console.warn('Stop Alert OTP send failed:', e);
    }
  };

  const notifyEmergencyContacts = async (user: any, latitude: number, longitude: number) => {
    if (contactsNotifiedRef.current || !user?.uid) return;
    contactsNotifiedRef.current = true;
    try {
      const contacts = await getContactsForUser(String(user.uid));
      if (!contacts.length) { contactsNotifiedRef.current = false; return; }
      const token = await getStoredToken();
      const headers: Record<string,string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/sos/notify-contacts`, {
        method: 'POST', headers,
        body: JSON.stringify({
          uid: user.uid,
          fullName: user.fullName || user.name || 'WS App User',
          latitude, longitude,
          contacts,
        }),
      });
      if (!res.ok) contactsNotifiedRef.current = false;
    } catch { contactsNotifiedRef.current = false; }
  };

  const updateRealSosLocation = async (coords: { latitude: number; longitude: number; accuracy?: number | null; policeStation?: string; policeAddress?: string; policeDistanceKm?: number | null }) => {
    if (!alertIdRef.current) return;
    try {
      await fetch(`${API_URL}/api/sos/${encodeURIComponent(alertIdRef.current)}/location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
      });
    } catch {}
  };

  const loadNearestPolice = async (latitude: number, longitude: number) => {
    const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=police+station+near+${latitude},${longitude}`;
    setPolice({
      name: 'Finding nearest police station...',
      address: 'Searching from your live GPS location',
      distanceKm: null,
      mapsUrl: fallbackUrl,
    });

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(
          `${API_URL}/api/police/nearest?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        const data = await res.json();
        if (res.ok && data?.success && data.police) {
          const p = data.police;
          const station = {
            name: p.name || 'Police Station',
            address: p.address || 'Nearby police station',
            distanceKm: typeof p.distanceKm === 'number' ? p.distanceKm : null,
            mapsUrl:
              p.mapsUrl ||
              `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`,
          };

          setPolice(station);

          await updateRealSosLocation({
            latitude,
            longitude,
            accuracy: location.accuracy,
            policeStation: station.name,
            policeAddress: station.address,
            policeDistanceKm: station.distanceKm,
          });

          return;
        }
      } catch {}

      if (attempt === 1) {
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }

    setPolice({
      name: 'Police station search unavailable',
      address: 'Use Google Maps below to search nearby stations',
      distanceKm: null,
      mapsUrl: fallbackUrl,
    });
  };

  const applyLocation = (latitude: number, longitude: number, accuracy?: number | null) => {
    const acc = typeof accuracy === 'number' ? accuracy : null;
    setLocation({ latitude, longitude, accuracy: acc, text: acc != null ? 'Live GPS location' : 'Live GPS location' });
    updateRealSosLocation({ latitude, longitude, accuracy: acc });
    void (async () => {
      const user = await getStoredUser();
      await notifyEmergencyContacts(user, latitude, longitude);
    })();
    if (policeTimerRef.current) clearTimeout(policeTimerRef.current);
    policeTimerRef.current = setTimeout(() => loadNearestPolice(latitude, longitude), 150);
  };

  const getLiveLocation = async () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          applyLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          if (typeof pos.coords.accuracy === 'number' && pos.coords.accuracy <= 50) {
            navigator.geolocation.clearWatch(watchId);
            locationWatchRef.current = null;
          }
        },
        () => setLocation({ latitude: null, longitude: null, accuracy: null, text: 'Location permission not available' }),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
      locationWatchRef.current = watchId;
      setTimeout(() => {
        if (locationWatchRef.current != null) {
          navigator.geolocation.clearWatch(locationWatchRef.current);
          locationWatchRef.current = null;
        }
      }, 15000);
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocation({ latitude: null, longitude: null, accuracy: null, text: 'Location permission denied' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      applyLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
    } catch {
      setLocation({ latitude: null, longitude: null, accuracy: null, text: 'Unable to get live location' });
    }
  };

  const createRealSos = async () => {
    if (createdRef.current) return;
    createdRef.current = true;
    try {
      const user = (await getStoredUser()) || {};
      const token = await getStoredToken();
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
      if (res.ok && data?.success) {
        alertIdRef.current = data.id || null;
        setSosSaved(true);
        // IMPORTANT: create the Firestore SOS document first, then attach live GPS.
        await getLiveLocation();
        await sendStopOtp(String(user?.phone || ''));
      } else {
        createdRef.current = false;
        console.warn('SOS create failed:', data?.message || 'Unknown error');
      }
    } catch (e) {
      createdRef.current = false;
      console.warn('SOS create failed:', e);
    }
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
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && locationWatchRef.current != null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
      if (policeTimerRef.current) clearTimeout(policeTimerRef.current);
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
    const user = (await getStoredUser()) || {};
    const phone = String(user?.phone || '');
    const code = otp.join('');
    if (code.length !== 4) {
      const msg = 'Enter the 4-digit safety OTP sent to your registered number.';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('OTP Required', msg);
      return;
    }

    try {
      let response: any;
      if (Platform.OS === 'web') {
        const ready = await loadWebOtpSdk();
        if (!ready || !window.verifyOtp) throw new Error('MSG91 Web OTP is unavailable');
        response = await new Promise<any>((resolve, reject) => {
          window.verifyOtp!(code, (data: any) => resolve(data), (error: any) => reject(new Error(error?.message || 'Invalid OTP')), stopOtpReqIdRef.current || undefined);
        });
      } else {
        const mod = await import('@msg91comm/sendotp-react-native');
        response = await mod.OTPWidget.verifyOTP({ reqId: stopOtpReqIdRef.current, otp: code });
      }
      const accessToken = String(response?.message ?? response?.accessToken ?? response?.['access-token'] ?? response?.token ?? '').trim();
      if (!accessToken) throw new Error(response?.message || 'Invalid OTP');

      const verifyRes = await fetch(`${API_URL}/api/otp/verify-access-token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, phone, uid: user?.uid || '' }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData?.success) throw new Error(verifyData?.message || 'OTP verification failed');

      Vibration.cancel();
      if (alertIdRef.current) {
        await fetch(`${API_URL}/api/sos/${encodeURIComponent(alertIdRef.current)}/resolve`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        });
      }
      setSafe(true);
      Animated.timing(safeOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      setTimeout(() => router.replace('/' as any), 2500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid OTP. Alert is still active.';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Invalid OTP', msg);
      setOtp(['', '', '', '']);
    }
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
            <Text style={styles.locationCoords}>{location.latitude != null && location.longitude != null ? `${location.latitude.toFixed(6)}°N, ${location.longitude.toFixed(6)}°E${location.accuracy != null ? `  •  ±${Math.round(location.accuracy)} m` : ''}` : 'Waiting for live coordinates...'}</Text>
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
            <View style={styles.policeIco}>
              <Text style={{ fontSize: 24 }}>🚔</Text>
            </View>
            <View style={styles.policeInfo}>
              <Text style={styles.policeName}>{police.name}</Text>
              <Text style={styles.policeAddr}>{police.address}</Text>
              <Text style={styles.policeDist}>
                {police.distanceKm != null
                  ? `📍 ${police.distanceKm.toFixed(2)} km away`
                  : '📍 Searching from your live GPS location...'}
              </Text>
            </View>
          </View>

          {police.mapsUrl ? (
            <TouchableOpacity
              style={styles.mapBtn}
              onPress={() => Linking.openURL(police.mapsUrl)}
            >
              <Text style={styles.mapBtnTxt}>🗺️  Open Nearest Police Station</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.callPoliceBtn} onPress={() => Linking.openURL('tel:100')}>
            <Text style={styles.callPoliceTxt}>📞  Call Police — 100</Text>
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
