import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import ScreenBackground from '../components/ScreenBackground';
import { loadSession } from './session-storage';

const HELPLINES = [
  { name: 'Women Helpline', number: '1091', icon: '👩', color: '#C9A84C' },
  { name: 'Police', number: '100', icon: '🚔', color: '#4ade80' },
  { name: 'Ambulance', number: '108', icon: '🚑', color: '#60a5fa' },
  { name: 'iCall Support', number: '9152987821', icon: '💬', color: '#a78bfa' },
];

const QUICK = [
  { label: 'Emergency\nContacts', icon: '👥', route: '/contacts', color: '#C9A84C' },
  { label: 'Report\nIncident', icon: '📋', route: '/report', color: '#4ade80' },
  { label: 'AI Support', icon: '🤖', route: '/support', color: '#a78bfa' },
  { label: 'Safety\nInformation', icon: '🛡️', route: '/safety-info', color: '#60a5fa' },
];

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const params = useLocalSearchParams<{ fullName?: string; phone?: string; email?: string; uid?: string }>();

  const [sessionUser, setSessionUser] = useState({
    fullName: String(params.fullName ?? '').trim(),
    phone: String(params.phone ?? '').trim(),
    email: String(params.email ?? '').trim(),
    uid: String(params.uid ?? '').trim(),
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { user, token } = await loadSession();
        if (!token || !user) {
          router.replace('/login' as any);
          return;
        }
        if (!active) return;
        setSessionUser({
          fullName: String(params.fullName ?? user.fullName ?? user.name ?? '').trim(),
          phone: String(params.phone ?? user.phone ?? '').trim(),
          email: String(params.email ?? user.email ?? '').trim(),
          uid: String(params.uid ?? user.uid ?? user.id ?? '').trim(),
        });
      } catch {
        router.replace('/login' as any);
      }
    })();
    return () => { active = false; };
  }, []);

  const fullName = sessionUser.fullName;
  const phone = sessionUser.phone;
  const email = sessionUser.email;
  const uid = sessionUser.uid;
  const initials = getInitials(fullName);
  const pulseOuter = useRef(new Animated.Value(1)).current;
  const pulseMid = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseOuter, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseMid, {
            toValue: 1.06,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseOuter, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseMid, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [pulseOuter, pulseMid]);


  return (
    <View style={styles.container}>
      <ScreenBackground opacity={0.18} mobileOpacity={0.1} desktopWidth="58%" />
      <StatusBar barStyle="light-content" backgroundColor="#1A0310" />
      <View style={styles.glowTL} />
      <View style={styles.glowBR} />
      <View style={styles.glowMid} />

      {/* TOP BAR */}
      <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
        <View style={styles.topLeft}>
          <Image source={require('../../assets/images/splash-icon.png')} style={{ width: 42, height: 42 }} resizeMode="contain" />
          <View>
            <Text style={styles.appName}>WS App</Text>
            <Text style={styles.appSub}>Women Safety</Text>
          </View>
        </View>

        <View style={styles.topRight}>
          <TouchableOpacity
            style={styles.pillBtn}
            onPress={() => Linking.openURL('tel:1091')}
          >
            <Text style={styles.pillTxt}>📞 1091</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() =>
              router.push({
                pathname: '/profile',
                params: {
                  fullName,
                  phone,
                  email,
                  uid,
                },
              } as any)
            }
          >
            <Text style={styles.avatarTxt}>{initials}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* NAV */}
      <View style={styles.navBar}>
        {[
          { l: 'Home', i: '🏠', r: '/' },
          { l: 'Contacts', i: '👥', r: '/contacts' },
          { l: 'Report', i: '📋', r: '/report' },
          { l: 'Support', i: '💬', r: '/support' },
        ].map((n, idx) => (
          <TouchableOpacity
            key={n.l}
            style={[styles.navItem, idx === 0 && styles.navItemActive]}
            onPress={() => router.push(n.r as any)}
          >
            <Text style={styles.navIco}>{n.i}</Text>
            <Text style={[styles.navLbl, idx === 0 && styles.navLblActive]}>
              {n.l}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          !isMobile && styles.scrollDesktop,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO */}
        <View style={styles.hero}>
          <View style={styles.heroTopLine} />
          <Text style={styles.heroEye}>✦ ALWAYS PROTECTED ✦</Text>
          <Text style={styles.heroTitle}>
            Your Safety is{'\n'}Our Priority
          </Text>
          <Text style={styles.heroSub}>
            Real-time alerts • AI Support • Emergency SOS
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>24/7</Text>
              <Text style={styles.statLbl}>Active</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>100%</Text>
              <Text style={styles.statLbl}>Private</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>FREE</Text>
              <Text style={styles.statLbl}>Forever</Text>
            </View>
          </View>
        </View>

        {/* USER CARD */}
        <TouchableOpacity
          style={styles.userCard}
          onPress={() =>
            router.push({
              pathname: '/profile',
              params: {
                fullName,
                phone,
                email,
                uid,
              },
            } as any)
          }
          activeOpacity={0.85}
        >
          <View style={styles.userLeft}>
            <View style={styles.userAv}>
              <Text style={styles.userAvTxt}>{initials}</Text>
            </View>
            <View>
              <Text style={styles.userGreet}>Good day,</Text>
              <Text style={styles.userName}>{fullName} 👋</Text>
            </View>
          </View>

          <View style={styles.safeBadge}>
            <Text style={styles.safeTxt}>✓ SAFE</Text>
          </View>
        </TouchableOpacity>

        {/* SOS */}
        <View style={styles.sosSection}>
          <Text style={styles.sosLabel}>EMERGENCY SOS</Text>

          <TouchableOpacity
            onPress={() => router.push('/alert' as any)}
            activeOpacity={0.85}
          >
            <Animated.View
              style={[
                styles.sosOuter,
                { transform: [{ scale: pulseOuter }] },
              ]}
            >
              <Animated.View
                style={[
                  styles.sosMid,
                  { transform: [{ scale: pulseMid }] },
                ]}
              >
                <View style={styles.sosCore}>
                  <Text style={styles.sosTxt}>SOS</Text>
                  <Text style={styles.sosSubTxt}>Press to Alert</Text>
                </View>
              </Animated.View>
            </Animated.View>
          </TouchableOpacity>

          <Text style={styles.sosHint}>Tap to activate emergency alert</Text>
        </View>

        {/* QUICK ACCESS */}
        <View style={styles.secHd}>
          <View style={styles.secLine} />
          <Text style={styles.secTxt}>Quick Access</Text>
          <View style={styles.secLine} />
        </View>

        <View style={styles.quickGrid}>
          {QUICK.map((q) => (
            <TouchableOpacity
              key={q.label}
              style={styles.quickCard}
              onPress={() => router.push(q.route as any)}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.quickIcoWrap,
                  { borderColor: `${q.color}40` },
                ]}
              >
                <Text style={styles.quickIco}>{q.icon}</Text>
              </View>

              <Text style={styles.quickLbl}>{q.label}</Text>

              <View
                style={[
                  styles.quickLine,
                  { backgroundColor: q.color },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* HELPLINES */}
        <View style={styles.secHd}>
          <View style={styles.secLine} />
          <Text style={styles.secTxt}>Helplines</Text>
          <View style={styles.secLine} />
        </View>

        {HELPLINES.map((h) => (
          <View key={h.number} style={styles.hlCard}>
            <View
              style={[
                styles.hlIco,
                { backgroundColor: `${h.color}15` },
              ]}
            >
              <Text style={{ fontSize: 20 }}>{h.icon}</Text>
            </View>

            <View style={styles.hlInfo}>
              <Text style={styles.hlName}>{h.name}</Text>
              <Text style={[styles.hlNum, { color: h.color }]}>
                {h.number}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.callBtn,
                {
                  backgroundColor: `${h.color}20`,
                  borderColor: `${h.color}40`,
                },
              ]}
              onPress={() => Linking.openURL(`tel:${h.number}`)}
            >
              <Text style={[styles.callTxt, { color: h.color }]}>Call</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* OFFLINE */}
        <View style={styles.offlineCard}>
          <Text style={{ fontSize: 18 }}>📡</Text>
          <Text style={styles.offlineTxt}>
            GPS + SMS alerts work without internet
          </Text>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <View style={styles.footerLine} />
          <Text style={styles.footerTxt}>Always With You</Text>
          <Text style={styles.footerSub}>Women Safety Application</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A0310',
    overflow: 'hidden',
  },

  glowTL: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(92,10,45,0.5)',
  },

  glowBR: {
    position: 'absolute',
    bottom: -60,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(11,110,79,0.12)',
  },

  glowMid: {
    position: 'absolute',
    top: '42%',
    left: '35%',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(92,10,45,0.1)',
  },

  topBar: {
    backgroundColor: 'rgba(30,3,16,0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,168,76,0.2)',
  },

  topBarMobile: {
    paddingTop: 40,
  },

  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  logoBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(92,10,45,0.6)',
    borderWidth: 1.5,
    borderColor: '#C9A84C',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoTxt: {
    color: '#C9A84C',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },

  appName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  appSub: {
    color: 'rgba(201,168,76,0.5)',
    fontSize: 9,
    letterSpacing: 1,
  },

  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  pillBtn: {
    backgroundColor: 'rgba(92,10,45,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
  },

  pillTxt: {
    color: '#C9A84C',
    fontSize: 11,
    fontWeight: '700',
  },

  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#C9A84C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },

  avatarTxt: {
    color: '#1A0310',
    fontSize: 10,
    fontWeight: '900',
  },

  navBar: {
    backgroundColor: 'rgba(20,2,12,0.8)',
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },

  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },

  navItemActive: {
    borderRadius: 8,
  },

  navIco: {
    fontSize: 16,
    marginBottom: 2,
  },

  navLbl: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '600',
  },

  navLblActive: {
    color: '#C9A84C',
    fontWeight: '800',
  },

  scroll: {
    alignItems: 'center',
    paddingBottom: 20,
  },

  scrollDesktop: {
    paddingHorizontal: 40,
    maxWidth: 760,
    alignSelf: 'center',
    width: '100%',
  },

  hero: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,168,76,0.15)',
    padding: 24,
    marginBottom: 14,
    position: 'relative',
    overflow: 'hidden',
  },

  heroTopLine: {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: 1,
    backgroundColor: 'rgba(201,168,76,0.3)',
  },

  heroEye: {
    color: 'rgba(201,168,76,0.7)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },

  heroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    letterSpacing: -0.5,
    marginBottom: 8,
  },

  heroSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginBottom: 18,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(201,168,76,0.06)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.15)',
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  statNum: {
    color: '#C9A84C',
    fontSize: 20,
    fontWeight: '900',
  },

  statLbl: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    marginTop: 2,
  },

  statDiv: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(201,168,76,0.2)',
  },

  userCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginHorizontal: 0,
    paddingHorizontal: 16,
  },

  userLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  userAv: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(92,10,45,0.5)',
    borderWidth: 1.5,
    borderColor: '#C9A84C',
    alignItems: 'center',
    justifyContent: 'center',
  },

  userAvTxt: {
    color: '#C9A84C',
    fontSize: 13,
    fontWeight: '900',
  },

  userGreet: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
  },

  userName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  safeBadge: {
    backgroundColor: 'rgba(11,110,79,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(11,110,79,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },

  safeTxt: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },

  sosSection: {
    alignItems: 'center',
    marginBottom: 28,
    paddingHorizontal: 16,
  },

  sosLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: 16,
  },

  sosOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: 'rgba(201,168,76,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },

  sosMid: {
    width: 152,
    height: 152,
    borderRadius: 76,
    borderWidth: 1.5,
    borderColor: 'rgba(201,168,76,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sosCore: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(92,10,45,0.6)',
    borderWidth: 2,
    borderColor: '#C9A84C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },

  sosTxt: {
    color: '#C9A84C',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
  },

  sosSubTxt: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    letterSpacing: 1.5,
    marginTop: 2,
  },

  sosHint: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    marginTop: 14,
  },

  secHd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginBottom: 14,
    paddingHorizontal: 16,
  },

  secLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(201,168,76,0.15)',
  },

  secTxt: {
    color: 'rgba(201,168,76,0.7)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    marginBottom: 28,
    paddingHorizontal: 16,
  },

  quickCard: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    overflow: 'hidden',
  },

  quickIcoWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  quickIco: {
    fontSize: 24,
  },

  quickLbl: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 17,
  },

  quickLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 0,
  },

  hlCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    paddingHorizontal: 16,
  },

  hlIco: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  hlInfo: {
    flex: 1,
  },

  hlName: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '700',
  },

  hlNum: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },

  callBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },

  callTxt: {
    fontSize: 12,
    fontWeight: '800',
  },

  offlineCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(11,110,79,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(11,110,79,0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    paddingHorizontal: 16,
  },

  offlineTxt: {
    flex: 1,
    color: 'rgba(74,222,128,0.7)',
    fontSize: 12,
    fontWeight: '500',
  },

  footer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },

  footerLine: {
    width: 60,
    height: 1,
    backgroundColor: 'rgba(201,168,76,0.3)',
    marginBottom: 14,
  },

  footerTxt: {
    color: 'rgba(201,168,76,0.6)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  footerSub: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    marginTop: 4,
  },
});