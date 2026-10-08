import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ScreenBackground from '../components/ScreenBackground';
import { loadSession } from './session-storage';


export default function SplashScreen() {
  // Logo starts at full size (same place and size as the native splash), then gives a soft pulse.
  const logoScale   = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const lineWidth   = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const subOpacity  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.sequence([
        Animated.timing(logoScale, { toValue: 1.08, duration: 350, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
      ]),
      Animated.timing(lineWidth, { toValue: 120, duration: 500, useNativeDriver: false }),
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(subOpacity,  { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    ]).start();
    let cancelled = false;
    const t = setTimeout(async () => {
      let next = '/login';
      try {
        const { user, token } = await loadSession();
        if (user && token) next = '/';
      } catch {}
      if (!cancelled) router.replace(next as any);
    }, 2800);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1A0310" />

      {/* WOMEN BG — desktop on the right, mobile fills the screen without cutting the body vertically */}
      <ScreenBackground opacity={0.22} mobileOpacity={0.22} desktopWidth="60%" />
      <View style={styles.overlay} />

      {/* Glows */}
      <View style={styles.glowTL} />
      <View style={styles.glowBR} />

      {/* Content: logo is centered exactly like the native splash, the text comes in below it */}
      <View style={styles.content}>
        <View style={styles.logoCenter} pointerEvents="none">
          <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
            <Image source={require('../../assets/images/splash-icon.png')} style={{ width: 200, height: 200 }} resizeMode="contain" />
          </Animated.View>
        </View>
        <View style={styles.textBlock}>
          <Animated.View style={[styles.goldLine, { width: lineWidth }]} />
          <Animated.Text style={[styles.appName, { opacity: textOpacity }]}>WS App</Animated.Text>
          <Animated.Text style={[styles.tagline, { opacity: subOpacity }]}>Women Safety Application</Animated.Text>
        </View>
        <Animated.View style={[styles.bottomWrap, { opacity: subOpacity }]}>
          <View style={styles.dotRow}>
            {[0,1,2].map(i => <View key={i} style={[styles.dot, i===1 && styles.dotActive]} />)}
          </View>
          <Text style={styles.bottomText}>Always With You</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#1A0310' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,3,16,0.62)', zIndex: 2 },
  glowTL:  { position: 'absolute', top: -80, left: -80, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(92,10,45,0.55)', zIndex: 3 },
  glowBR:  { position: 'absolute', bottom: -60, right: -60, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(11,110,79,0.12)', zIndex: 3 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  logoCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  textBlock:  { position: 'absolute', top: '50%', marginTop: 112, alignItems: 'center' },
  logoWrap:  { alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  logoOuter: { width: 120, height: 120, borderRadius: 30, borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.4)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  logoMid:   { width: 100, height: 100, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.03)' },
  logoCore:  { width: 80, height: 80, borderRadius: 20, backgroundColor: 'rgba(92,10,45,0.6)', borderWidth: 1.5, borderColor: '#C9A84C', alignItems: 'center', justifyContent: 'center' },
  logoText:  { color: '#C9A84C', fontSize: 28, fontWeight: '900', letterSpacing: 3 },
  goldLine:  { height: 1.5, backgroundColor: '#C9A84C', marginBottom: 20 },
  appName:   { color: '#FDF8F9', fontSize: 32, fontWeight: '900', letterSpacing: 4, marginBottom: 10 },
  tagline:   { color: 'rgba(201,168,76,0.7)', fontSize: 13, fontWeight: '500', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 0 },
  bottomWrap:{ position: 'absolute', bottom: 50, alignItems: 'center', gap: 12 },
  dotRow:    { flexDirection: 'row', gap: 8 },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  dotActive: { width: 20, backgroundColor: '#C9A84C' },
  bottomText:{ color: 'rgba(255,255,255,0.25)', fontSize: 11, fontWeight: '600', letterSpacing: 3, textTransform: 'uppercase' },
});