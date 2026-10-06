import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
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
  useWindowDimensions,
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
  const [sosSaved, setSosSaved] = useState(false);
  const [smsStatus, setSmsStatus] = useState<'pending' | 'sent' | 'failed'>('pending');
  const [smsMessage, setSmsMessage] = useState('Waiting for a precise GPS fix before alerting your emergency contacts...');
  const locationWatchRef = useRef<any>(null);
  const policeTimerRef = useRef<any>(null);
  const alertIdRef = useRef<string | null>(null);
  const createdRef = useRef(false);
  const contactsNotifiedRef = useRef(false);
  const GOOD_ACCURACY_METERS = 200;          // precise GPS fix
  const MAX_USABLE_ACCURACY_METERS = 20000;  // ignore only completely useless fixes
  const lastFixRef = useRef<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const policeRef = useRef<any>(null);
  const policeSearchRef = useRef<{ latitude: number; longitude: number; good: boolean } | null>(null);
  const notifyAttemptsRef = useRef(0);
  const lastNotifyAtRef = useRef(0);
  const createTriesRef = useRef(0);
  const activeRef = useRef(true);
  const userNameRef = useRef('A WS App user');
  const fallbackCodeRef = useRef(String(Math.floor(1000 + Math.random() * 9000)));
  const sharedManuallyRef = useRef(false);
  const lastFixAtRef = useRef(0);
  const autoAlertedRef = useRef(false);
  const contactsRef = useRef<any[]>([]);
  const policeSeqRef = useRef(0);
  const policeAbortRef = useRef<any>(null);
  const [shared, setShared] = useState(false);
  const [contactList, setContactList] = useState<any[]>([]);

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

  const getStorageValue = async (keys: string[]) => {
    for (const key of keys) {
      try {
        const nativeValue = await AsyncStorage.getItem(key);
        if (nativeValue) return nativeValue;
      } catch {}

      try {
        if (typeof globalThis !== 'undefined') {
          const storage: any = (globalThis as any).localStorage;
          const webValue = storage?.getItem?.(key);
          if (webValue) return webValue;
        }
      } catch {}
    }
    return null;
  };

  const getStoredUser = async () => {
    try {
      const raw = await getStorageValue(['wsUser', 'user', 'userData', 'wsappUser']);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const getStoredToken = async () => {
    return await getStorageValue(['wsToken', 'token', 'idToken', 'wsAuthToken']);
  };

  const getContactsForUser = async (user: any) => {
    const rawKeys = [user?.uid, user?.id, user?.email, user?.phone]
      .map((value: any) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    const keys = [...new Set(rawKeys)].map(value => `wsapp_emergency_contacts_${value}`);
    if (!keys.length) return [];

    for (const key of keys) {
      try {
        const nativeRaw = await AsyncStorage.getItem(key);
        if (nativeRaw) {
          const parsed = JSON.parse(nativeRaw);
          if (Array.isArray(parsed)) {
            const valid = parsed.filter((c: any) => c?.phone);
            if (valid.length) return valid;
          }
        }
      } catch {}

      try {
        if (typeof globalThis !== 'undefined') {
          const storage: any = (globalThis as any).localStorage;
          const webRaw = storage?.getItem?.(key);
          if (webRaw) {
            const parsed = JSON.parse(webRaw);
            if (Array.isArray(parsed)) {
              const valid = parsed.filter((c: any) => c?.phone);
              if (valid.length) return valid;
            }
          }
        }
      } catch {}
    }

    return [];
  };

  // Safety OTP is generated by the backend and sent to the saved emergency contacts.
  // The SOS user does not receive this OTP.

  const distanceMeters = (la1: number, lo1: number, la2: number, lo2: number) => {
    const R = 6371000;
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLa = rad(la2 - la1);
    const dLo = rad(lo2 - lo1);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const notifyEmergencyContacts = async (user: any, latitude: number | null, longitude: number | null, sosId: string) => {
    if (contactsNotifiedRef.current || !user?.uid) return;
    if (notifyAttemptsRef.current >= 3) return;
    if (Date.now() - lastNotifyAtRef.current < 15000) return;
    lastNotifyAtRef.current = Date.now();
    notifyAttemptsRef.current += 1;
    contactsNotifiedRef.current = true;
    setSmsStatus('pending');
    setSmsMessage('Sending SOS alert and live-location link to your emergency contacts...');

    try {
      const contacts = await getContactsForUser(user);
      if (!contacts.length) {
        notifyAttemptsRef.current = 99; // no contacts: do not retry
        contactsNotifiedRef.current = false;
        setSmsStatus('failed');
        setSmsMessage('No emergency contacts are saved. Add contacts from the Emergency Contacts page.');
        return;
      }

      const token = await getStoredToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/sos/notify-contacts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          uid: user.uid,
          fullName: user.fullName || user.name || 'WS App User',
          latitude,
          longitude,
          sosId,
          contacts,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setSmsStatus('sent');
        setSmsMessage(data?.message || `SOS alert accepted for ${data?.sent ?? contacts.length} contact(s).`);
      } else {
        contactsNotifiedRef.current = false;
        if (res.status === 503) notifyAttemptsRef.current = 99; // provider not configured: do not retry
        setSmsStatus('failed');
        setSmsMessage(res.status === 503
          ? 'Automatic SMS is not active yet (provider approval pending). Use "Alert Your Contacts" below to send the alert on WhatsApp / SMS.'
          : (data?.message || 'Automatic SMS could not be sent.') + ' Use "Alert Your Contacts" below to send the alert yourself.');
        console.warn('SOS contact SMS failed:', data?.message || 'Unknown error', data?.provider || '');
      }
    } catch (e) {
      contactsNotifiedRef.current = false;
      setSmsStatus('failed');
      setSmsMessage('Automatic SMS service not reachable. Use "Alert Your Contacts" below to send the alert yourself.');
      console.warn('SOS contact SMS request failed:', e);
    }
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
    const seq = ++policeSeqRef.current;           // newer search cancels older ones
    try { policeAbortRef.current?.abort(); } catch {}
    setPolice({
      name: 'Finding nearest police station...',
      address: 'Searching from your live GPS location (can take up to a minute the first time)',
      distanceKm: null,
      mapsUrl: fallbackUrl,
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (seq !== policeSeqRef.current || !activeRef.current) return;
      const controller = new AbortController();
      policeAbortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), 60000); // server may be waking up
      try {
        const res = await fetch(
          `${API_URL}/api/police/nearest?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        const data = await res.json();

        if (res.ok && data?.success && data.police) {
          if (seq !== policeSeqRef.current || !activeRef.current) return;
          const p = data.police;
          const station = {
            name: p.name || 'Police Station',
            address: p.address || 'Nearby police station',
            distanceKm: typeof p.distanceKm === 'number' ? p.distanceKm : null,
            mapsUrl:
              p.mapsUrl ||
              `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`,
          };
          policeRef.current = station;
          setPolice(station);
          await updateRealSosLocation({
            latitude,
            longitude,
            accuracy: lastFixRef.current?.accuracy ?? null,
            policeStation: station.name,
            policeAddress: station.address,
            policeDistanceKm: station.distanceKm,
          });
          return;
        }
      } catch {
        clearTimeout(timeoutId);
      }

      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (seq !== policeSeqRef.current || !activeRef.current) return;
    setPolice({
      name: 'Police station search unavailable',
      address: 'Use Google Maps below to search nearby stations',
      distanceKm: null,
      mapsUrl: fallbackUrl,
    });
    // allow a new search with the next GPS fix after 10 seconds
    setTimeout(() => { policeSearchRef.current = null; }, 10000);
  };

  const applyLocation = (
    latitude: number,
    longitude: number,
    accuracy?: number | null
  ) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const acc = typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null;

    // A coarse network fix (e.g. +-50000 m) must never replace a good GPS fix.
    const prevFix = lastFixRef.current;
    if (
      prevFix && prevFix.accuracy != null &&
      (acc == null || acc > Math.max(prevFix.accuracy * 4, 300)) &&
      Date.now() - lastFixAtRef.current < 30000
    ) return;

    if (acc != null && acc > MAX_USABLE_ACCURACY_METERS) {
      setLocation(prev => ({
        ...prev,
        text: `Weak GPS signal (±${Math.round(acc)} m). Move near a window or outdoors.`,
      }));
      return;
    }

    const good = acc != null && acc <= GOOD_ACCURACY_METERS;
    lastFixRef.current = { latitude, longitude, accuracy: acc };
    lastFixAtRef.current = Date.now();
    setLocation({
      latitude,
      longitude,
      accuracy: acc,
      text: good ? 'Live GPS location' : 'Approximate location (getting more precise...)',
    });
    updateRealSosLocation({ latitude, longitude, accuracy: acc });

    if (good) void autoOpenAlert();

    // Alert contacts on the FIRST usable fix (no need to wait for a perfect one).
    void (async () => {
      const user = await getStoredUser();
      if (alertIdRef.current) {
        await notifyEmergencyContacts(user, latitude, longitude, alertIdRef.current);
      }
    })();

    // Nearest police: search at once, again when GPS becomes precise, or when user moves 500 m.
    const last = policeSearchRef.current;
    const moved = last ? distanceMeters(last.latitude, last.longitude, latitude, longitude) : Infinity;
    if (!last || (good && !last.good) || moved > 500) {
      policeSearchRef.current = { latitude, longitude, good };
      if (policeTimerRef.current) clearTimeout(policeTimerRef.current);
      policeTimerRef.current = setTimeout(() => loadNearestPolice(latitude, longitude), 150);
    }
  };

  const stopLocationWatch = () => {
    const w = locationWatchRef.current;
    locationWatchRef.current = null;
    if (w == null) return;
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined') navigator.geolocation?.clearWatch(w);
      } else {
        w.remove?.();
      }
    } catch {}
  };

  const getLiveLocation = async () => {
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setLocation(prev => ({ ...prev, text: 'This browser does not support location.' }));
        return;
      }
      setLocation(prev => ({ ...prev, text: 'Getting your location...' }));
      const onErr = (err: any) => {
        if (lastFixRef.current) return; // keep the last good fix on screen
        setLocation(prev => ({
          ...prev,
          text: err?.code === 1
            ? 'Location permission denied. Allow location for this site and reload.'
            : 'Location unavailable. Turn on GPS / Wi-Fi and use https.',
        }));
      };
      navigator.geolocation.getCurrentPosition(
        pos => applyLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        onErr,
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
      locationWatchRef.current = navigator.geolocation.watchPosition(
        pos => applyLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        onErr,
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
      );
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocation({ latitude: null, longitude: null, accuracy: null, text: 'Location permission denied. Allow location in phone settings.' });
        return;
      }
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        setLocation(prev => ({ ...prev, text: 'Turn ON location (GPS) in your phone settings.' }));
      }

      // 1) fast: a very recent known position
      try {
        const known = await Location.getLastKnownPositionAsync({ maxAge: 120000 });
        if (known) applyLocation(known.coords.latitude, known.coords.longitude, known.coords.accuracy);
      } catch {}

      // 2) quick current fix
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(pos => applyLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy))
        .catch(() => {});

      // 3) continuous live tracking until SAFE (no time limit)
      locationWatchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 0 },
        pos => applyLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy)
      );
    } catch {
      setLocation({ latitude: null, longitude: null, accuracy: null, text: 'Unable to get live location' });
    }
  };

  const createRealSos = async () => {
    if (createdRef.current || !activeRef.current) return;
    createdRef.current = true;
    try {
      const user = (await getStoredUser()) || {};
      const token = await getStoredToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const fix = lastFixRef.current;
      const res = await fetch(`${API_URL}/api/sos`, {
        method: 'POST', headers,
        body: JSON.stringify({
          uid: user?.uid || user?.id || null,
          fullName: user?.fullName || user?.name || null,
          phone: user?.phone || null,
          email: user?.email || null,
          latitude: fix?.latitude ?? null,
          longitude: fix?.longitude ?? null,
          accuracy: fix?.accuracy ?? null,
          locationText: null,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        alertIdRef.current = data.id || null;
        setSosSaved(true);
        // GPS may already have a fix while the server was waking up: send it now.
        const f = lastFixRef.current;
        if (f && alertIdRef.current) {
          updateRealSosLocation({
            ...f,
            policeStation: policeRef.current?.name,
            policeAddress: policeRef.current?.address,
            policeDistanceKm: policeRef.current?.distanceKm,
          });
          await notifyEmergencyContacts(user, f.latitude, f.longitude, alertIdRef.current);
        }
        return;
      }
      throw new Error(data?.message || 'SOS create failed');
    } catch (e) {
      createdRef.current = false;
      console.warn('SOS create failed:', e);
      createTriesRef.current += 1;
      if (activeRef.current) setTimeout(createRealSos, 10000); // keeps trying until internet returns
    }
  };

  useEffect(() => {
    activeRef.current = true;
    // Start GPS at once (do not wait for the server), and create the SOS in parallel.
    createRealSos();
    getLiveLocation();
    (async () => {
      const u = await getStoredUser();
      if (u) {
        userNameRef.current = u.fullName || u.name || 'A WS App user';
        const list = await getContactsForUser(u);
        contactsRef.current = list;
        setContactList(list);
      }
    })();

    // If GPS is slow or offline, still open the alert SMS after 10 seconds.
    const autoTimer = setTimeout(() => { void autoOpenAlert(); }, 10000);

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
      activeRef.current = false;
      clearInterval(timer);
      clearTimeout(autoTimer);
      loop.stop();
      stopLocationWatch();
      if (policeTimerRef.current) clearTimeout(policeTimerRef.current);
    };
  }, []);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleOtp = (val: string, idx: number) => {
    const digit = String(val || '').replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 3) inputs[idx + 1].current?.focus();

    if (next.every(d => d !== '') && next.join('').length === 4) {
      setTimeout(() => markSafe(next.join('')), 300);
    }
  };

  const handleKey = (e: any, idx: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputs[idx - 1].current?.focus();
    }
  };

  const showMsg = (title: string, msg: string) => {
    if (Platform.OS === 'web') window.alert(msg); else Alert.alert(title, msg);
  };

  const buildMessage = (kind: 'alert' | 'safe') => {
    if (kind === 'safe') {
      return 'I am safe now. The WS App emergency alert has been stopped. Thank you for your help.';
    }
    const f = lastFixRef.current;
    const link = f ? `https://www.google.com/maps?q=${f.latitude},${f.longitude}` : 'location not ready yet';
    return `EMERGENCY! ${userNameRef.current} pressed the SOS button in WS App and may be in danger.\nHer latest location: ${link}\nPlease go to her now or call 112.\nAfter you find her, tell her this safety code: ${fallbackCodeRef.current}`;
  };

  const sendToContact = (c: any, kind: 'alert' | 'safe', via: 'whatsapp' | 'sms') => {
    const msg = buildMessage(kind);
    if (kind === 'alert') { sharedManuallyRef.current = true; setShared(true); }
    const digits = String(c?.phone || '').replace(/\D/g, '');
    const num = digits.length === 10 ? `91${digits}` : digits.length === 11 && digits.startsWith('0') ? `91${digits.slice(1)}` : digits;
    const url = via === 'whatsapp'
      ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
      : `sms:${digits}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => showMsg('Could not open', 'Unable to open WhatsApp / SMS on this device.'));
  };

  const sendSmsToAll = () => {
    const nums = contactsRef.current.map((c: any) => String(c?.phone || '').replace(/\D/g, '')).filter(Boolean);
    if (!nums.length) return;
    sharedManuallyRef.current = true;
    setShared(true);
    const msg = buildMessage('alert');
    Linking.openURL(`sms:${nums.join(',')}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(msg)}`)
      .catch(() => showMsg('Could not open', 'Unable to open SMS on this device.'));
  };

  // Opens the SMS screen for ALL contacts by itself as soon as SOS starts (phone only,
  // the user just presses Send). SMS needs no internet, so this also works offline.
  const autoOpenAlert = async () => {
    if (autoAlertedRef.current || !activeRef.current || Platform.OS === 'web') return;
    if (!contactsRef.current.length) {
      const u = await getStoredUser();
      if (u) contactsRef.current = await getContactsForUser(u);
    }
    if (!contactsRef.current.length) return;
    autoAlertedRef.current = true;
    sendSmsToAll();
  };

  const resolveOnServer = async () => {
    if (!alertIdRef.current) return;
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(`${API_URL}/api/sos/${encodeURIComponent(alertIdRef.current)}/resolve`, { method: 'PATCH' });
        if (res.ok) return;
      } catch {}
      await new Promise(r => setTimeout(r, 1500));
    }
  };

  const cancelFalseAlarm = () => {
    const run = async () => {
      await resolveOnServer();
      stopLocationWatch();
      router.replace('/' as any);
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Cancel this alert? Use this only if SOS was pressed by mistake.')) void run();
      return;
    }
    Alert.alert('Cancel alert?', 'Use this only if SOS was pressed by mistake.', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, cancel', onPress: () => { void run(); } },
    ]);
  };

  const markSafe = async (codeOverride?: string) => {
    const code = String(codeOverride ?? otp.join('')).replace(/\D/g, '');

    if (code.length !== 4) {
      showMsg('Code Required', 'Enter the 4-digit safety code given by your emergency contact.');
      return;
    }

    let ok = false;
    let errMsg = 'Wrong code. The alert is still active.';
    if (!sharedManuallyRef.current) {
      errMsg = 'First send the alert to your contact (WhatsApp / SMS). The safety code is inside that message.';
    } else if (code === fallbackCodeRef.current) {
      ok = true;
      await resolveOnServer();
    }

    if (!ok) {
      showMsg('Wrong Code', errMsg);
      setOtp(['', '', '', '']);
      inputs[0].current?.focus();
      return;
    }

    stopLocationWatch();
    setSafe(true);
    Animated.timing(safeOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
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
            Alert stopped after successful safety OTP verification.
          </Text>
          <View style={styles.safeBadge}>
            <Text style={styles.safeBadgeTxt}>✅ ALERT RESOLVED</Text>
          </View>
          {contactList.length > 0 && (
            <View style={{ width: '100%', gap: 8 }}>
              <Text style={styles.safeRedirect}>Tell your contacts you are safe:</Text>
              {contactList.map((c: any, i: number) => (
                <TouchableOpacity key={i} style={styles.shareBtn} onPress={() => sendToContact(c, 'safe', 'whatsapp')}>
                  <Text style={styles.shareBtnTxt}>💬  {c.name || c.phone} - "I am safe"</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity style={[styles.safeBtn, { width: '100%' }]} onPress={() => router.replace('/' as any)}>
            <Text style={styles.safeBtnTxt}>🏠  Go Home</Text>
          </TouchableOpacity>
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
          <Text style={styles.alertTitle}>Emergency Alert Active</Text>
          <Text style={styles.alertSub}>
            Your SOS alert is active. GPS and emergency-contact communication are updating below.
          </Text>
        </View>

        {/* STATUS ROW */}
        <View style={styles.statusGrid}>
          {[
            { i: '📡', t: 'Alert Recorded', c: sosSaved ? '#4ade80' : '#fbbf24' },
            { i: '📍', t: 'GPS Location', c: location.latitude != null ? '#4ade80' : '#fbbf24' },
            { i: '📱', t: smsStatus === 'sent' ? 'SOS SMS Sent' : smsStatus === 'failed' ? 'SOS SMS Failed' : 'SOS SMS Pending', c: smsStatus === 'sent' ? '#4ade80' : smsStatus === 'failed' ? '#f87171' : '#fbbf24' },
            { i: '☁️', t: 'Admin Synced', c: sosSaved ? '#4ade80' : '#fbbf24' },
          ].map((s, idx) => (
            <View key={idx} style={styles.statusCard}>
              <Text style={styles.statusIco}>{s.i}</Text>
              <Text style={styles.statusTxt}>{s.t}</Text>
              <View style={[styles.statusDot, { backgroundColor: s.c }]} />
            </View>
          ))}
        </View>

        <View style={[styles.smsNotice, smsStatus === 'sent' ? styles.smsNoticeSent : smsStatus === 'failed' ? styles.smsNoticeFailed : styles.smsNoticePending]}>
          <Text style={styles.smsNoticeTitle}>🚨 Emergency Contact Alert</Text>
          <Text style={styles.smsNoticeText}>{smsMessage}</Text>
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

        {/* ALERT YOUR CONTACTS (manual WhatsApp / SMS) */}
        <View style={styles.card}>
          <View style={styles.cardTopLine} />
          <Text style={styles.cardTitle}>📲 Alert Your Contacts</Text>
          <Text style={styles.shareHint}>
            Tap to send your location and the safety code on WhatsApp or SMS. Your contact does not need the WS App. A phone cannot send these silently, so press Send in the message screen.
          </Text>
          {contactList.length > 1 && (
            <TouchableOpacity style={[styles.shareBtn, { marginBottom: 12 }]} onPress={sendSmsToAll}>
              <Text style={styles.shareBtnTxt}>✉️  SMS to ALL contacts</Text>
            </TouchableOpacity>
          )}
          {contactList.length === 0 ? (
            <Text style={styles.shareHint}>No emergency contacts saved. Add them from the Emergency Contacts page.</Text>
          ) : (
            contactList.map((c: any, i: number) => (
              <View key={i} style={styles.shareRow}>
                <Text style={styles.shareName}>{c.name || 'Contact'}  •  {c.phone}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[styles.shareBtn, { flex: 1 }]} onPress={() => sendToContact(c, 'alert', 'whatsapp')}>
                    <Text style={styles.shareBtnTxt}>💬 WhatsApp</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.shareBtn, { flex: 1 }]} onPress={() => sendToContact(c, 'alert', 'sms')}>
                    <Text style={styles.shareBtnTxt}>✉️ SMS</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── STOP ALERT — OTP ── */}
        <View style={[styles.card, styles.stopCard]}>
          <View style={[styles.cardTopLine, { backgroundColor: 'rgba(74,222,128,0.45)' }]} />
          <Text style={styles.stopTitle}>🛡️ Stop Alert</Text>
          <Text style={styles.stopSub}>
            Your emergency contact has a 4-digit safety code. They tell it to you after they find you.
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

          <Text style={styles.otpHint}>💡 The safety code is inside the message you sent to your contact. They tell it to you only after they reach you.</Text>

          {/* Manual safe button */}
          <TouchableOpacity style={styles.safeBtn} onPress={() => markSafe()} activeOpacity={0.85}>
            <Text style={styles.safeBtnTxt}>✅  She is Safe — Stop Alert</Text>
          </TouchableOpacity>
        </View>

        {!shared && smsStatus !== 'sent' && (
          <TouchableOpacity style={styles.cancelBtn} onPress={cancelFalseAlarm}>
            <Text style={styles.cancelTxt}>Pressed by mistake? Cancel alert</Text>
          </TouchableOpacity>
        )}

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

  statusGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%', paddingHorizontal: 16, marginVertical: 16 },
  statusCard:   { flex: 1, minWidth: 135, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 12, alignItems: 'center', gap: 5 },
  statusIco:    { fontSize: 20 },
  statusTxt:    { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  statusDot:    { width: 6, height: 6, borderRadius: 3, shadowColor: '#4ade80', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4, elevation: 3 },
  smsNotice:      { width: '100%', marginHorizontal: 16, borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 14 },
  smsNoticeSent:  { backgroundColor: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.25)' },
  smsNoticeFailed:{ backgroundColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.25)' },
  smsNoticePending:{ backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.25)' },
  smsNoticeTitle: { color: '#fff', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  smsNoticeText:  { color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 18 },


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

  shareHint:    { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  shareRow:     { marginBottom: 12 },
  shareName:    { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  shareBtn:     { backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.4)', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, alignItems: 'center' },
  shareBtnTxt:  { color: '#C9A84C', fontSize: 13, fontWeight: '800' },

  cancelBtn:    { width: '100%', borderWidth: 1, borderColor: 'rgba(248,113,113,0.35)', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 14 },
  cancelTxt:    { color: '#f87171', fontSize: 13, fontWeight: '700' },
  footer:       { width: '100%', alignItems: 'center', paddingVertical: 20 },
  footerLine:   { width: 60, height: 1, backgroundColor: 'rgba(201,168,76,0.3)', marginBottom: 14 },
  footerTxt:    { color: 'rgba(201,168,76,0.65)', fontSize: 13, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
});