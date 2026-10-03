import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
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

export default function ProfileScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const params = useLocalSearchParams<{
    fullName?: string;
    phone?: string;
    email?: string;
    uid?: string;
  }>();

  const getStorage = () => {
    try {
      return typeof globalThis !== 'undefined'
        ? (globalThis as any).localStorage
        : null;
    } catch {
      return null;
    }
  };

  const getStoredUser = () => {
    try {
      const storage = getStorage();
      const candidates = ['wsUser', 'user', 'userData', 'wsappUser'];

      for (const key of candidates) {
        const raw = storage?.getItem?.(key);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw);
          if (parsed) return parsed;
        } catch {
          // Ignore malformed storage entries and continue to the next key.
        }
      }
    } catch {
      // Storage may not be available on every native runtime.
    }

    return null;
  };

  const getStoredToken = () => {
    try {
      const storage = getStorage();
      const keys = ['wsToken', 'token', 'idToken', 'wsAuthToken'];

      for (const key of keys) {
        const value = storage?.getItem?.(key);
        if (value) return String(value);
      }
    } catch {
      // Ignore storage errors.
    }

    return '';
  };

  const storedUser = getStoredUser() || {};
  const initialFullName =
    String(params.fullName ?? '').trim() ||
    String(storedUser.fullName ?? storedUser.name ?? '').trim() ||
    'User';
  const initialPhone =
    String(params.phone ?? '').trim() ||
    String(storedUser.phone ?? '').trim();
  const initialGmail =
    String(params.email ?? '').trim().toLowerCase() ||
    String(storedUser.email ?? '').trim().toLowerCase();
  const profileUid =
    String(params.uid ?? '').trim() ||
    String(storedUser.uid ?? storedUser.id ?? '').trim();

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [gmail, setGmail] = useState(initialGmail);
  const [contactCount, setContactCount] = useState(0);

  const loadContactCount = () => {
    if (!profileUid) {
      setContactCount(0);
      return;
    }

    try {
      const raw = getStorage()?.getItem?.(
        `wsapp_emergency_contacts_${profileUid.toLowerCase()}`
      );

      if (!raw) {
        setContactCount(0);
        return;
      }

      const parsed = JSON.parse(raw);
      setContactCount(Array.isArray(parsed) ? parsed.length : 0);
    } catch {
      setContactCount(0);
    }
  };

  useEffect(() => {
    loadContactCount();
  }, [profileUid]);

  const saveAnim = useRef(
    new Animated.Value(1)
  ).current;

  const handleSave = () => {
    Animated.sequence([
      Animated.timing(saveAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(saveAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsEditing(false);
    });
  };

  const handleLogout = () => {
    const clearSessionAndGoLogin = () => {
      const storage = getStorage();
      const sessionKeys = [
        'wsToken',
        'token',
        'idToken',
        'wsAuthToken',
        'wsUser',
        'user',
        'userData',
        'wsappUser',
      ];

      for (const key of sessionKeys) {
        try {
          storage?.removeItem?.(key);
        } catch {
          // Ignore storage cleanup errors.
        }
      }

      router.replace('/login' as any);
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        'Logout\n\nAre you sure you want to logout?'
      );
      if (confirmed) {
        clearSessionAndGoLogin();
      }
      return;
    }

    Alert.alert('Logout', 'Are you sure?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: clearSessionAndGoLogin,
      },
    ]);
  };

  const performDeleteAccount = async () => {
    const token = getStoredToken();

    if (!token) {
      if (Platform.OS === 'web') {
        window.alert('Please sign in again before deleting your account.');
      } else {
        Alert.alert(
          'Session Missing',
          'Please sign in again before deleting your account.'
        );
      }
      return;
    }

    try {
      const backendUrl =
        process.env.EXPO_PUBLIC_BACKEND_URL ||
        'https://wsapp-9w4r.onrender.com';

      const response = await fetch(
        `${backendUrl}/api/account/delete`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || 'Unable to delete your account.'
        );
      }

      const storage = getStorage();
      const sessionKeys = [
        'wsToken',
        'token',
        'idToken',
        'wsAuthToken',
        'wsUser',
        'user',
        'userData',
        'wsappUser',
      ];

      for (const key of sessionKeys) {
        try {
          storage?.removeItem?.(key);
        } catch {
          // Ignore storage cleanup errors.
        }
      }

      if (Platform.OS === 'web') {
        window.alert(
          'Account deleted successfully. You can register again later using the same email and phone as a new account.'
        );
        router.replace('/login' as any);
      } else {
        Alert.alert(
          'Account Deleted',
          'Your account has been deleted. You can register again later using the same email and phone as a new account.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/login' as any),
            },
          ]
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to delete your account.';

      if (Platform.OS === 'web') {
        window.alert(`Account Deletion Failed\n\n${message}`);
      } else {
        Alert.alert('Account Deletion Failed', message);
      }
    }
  };

  const handleDeleteAccount = () => {
    const message =
      'This permanently deletes your account and profile. You can register again later using the same email and phone as a new account.';

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Delete Account\n\n${message}`);
      if (confirmed) {
        void performDeleteAccount();
      }
      return;
    }

    Alert.alert(
      'Delete Account',
      message,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            void performDeleteAccount();
          },
        },
      ]
    );
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((x) => x[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  return (
    <View style={styles.container}>

      {/* =====================================================
          BACKGROUND ONLY
          This layer NEVER receives touches
         ===================================================== */}
      <View
        style={styles.backgroundLayer}
        pointerEvents="none"
      >
        <ScreenBackground
          opacity={0.18}
          mobileOpacity={0.10}
          desktopWidth="58%"
        />
      </View>

      {/* DARK OVERLAY - also never receives touches */}
      <View
        style={styles.overlay}
        pointerEvents="none"
      />

      <StatusBar
        barStyle="light-content"
        backgroundColor="#1A0310"
      />

      {/* =====================================================
          ALL INTERACTIVE CONTENT
          Higher zIndex so buttons always receive touches
         ===================================================== */}
      <View
        style={styles.contentLayer}
        pointerEvents="box-none"
      >

        {/* GLOWS */}
        <View
          style={styles.glowTL}
          pointerEvents="none"
        />

        <View
          style={styles.glowBR}
          pointerEvents="none"
        />

        {/* TOP BAR */}
        <View
          style={[
            styles.topBar,
            isMobile && styles.topBarMobile,
          ]}
        >
          <TouchableOpacity
            onPress={() =>
              router.replace('/' as any)
            }
            activeOpacity={0.7}
          >
            <Text style={styles.backTxt}>
              ← Home
            </Text>
          </TouchableOpacity>

          <Text style={styles.topTitle}>
            My Profile
          </Text>

          <TouchableOpacity
            style={styles.editBtn}
            onPress={() =>
              isEditing
                ? handleSave()
                : setIsEditing(true)
            }
            activeOpacity={0.8}
          >
            <Text style={styles.editBtnTxt}>
              {isEditing ? '✓ Save' : '✎ Edit'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* SCROLLABLE CONTENT */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scroll,
            !isMobile && styles.scrollDesktop,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* AVATAR */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarOuter}>
              <View style={styles.avatarMid}>
                <View style={styles.avatarCore}>
                  <Text style={styles.avatarTxt}>
                    {getInitials(fullName)}
                  </Text>
                </View>
              </View>
            </View>

            {!isEditing && (
              <>
                <Text style={styles.userName}>
                  {fullName}
                </Text>

                <View style={styles.protectedBadge}>
                  <Text style={styles.protectedTxt}>
                    🛡 PROTECTED
                  </Text>
                </View>

                <Text style={styles.joinDate}>
                  Phone verified • WS App member
                </Text>
              </>
            )}
          </View>

          {/* STATS */}
          {!isEditing && (
            <View style={styles.statsRow}>
              {[
                [String(contactCount), 'Contacts'],
                ['0', 'SOS Drills'],
                ['0', 'Reports'],
              ].map(([num, label], index) => (
                <View
                  key={label}
                  style={[
                    styles.statCard,
                    index === 1 &&
                      styles.statCardActive,
                  ]}
                >
                  <Text style={styles.statNum}>
                    {num}
                  </Text>

                  <Text style={styles.statLbl}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* PERSONAL DETAILS */}
          <View
            style={[
              styles.card,
              !isMobile &&
                styles.cardDesktop,
            ]}
          >
            <View style={styles.cardTopLine} />

            <View style={styles.cardHd}>
              <View style={styles.cardLine} />

              <Text style={styles.cardHdTxt}>
                Personal Details
              </Text>

              <View style={styles.cardLine} />
            </View>

            {[
              {
                lbl: 'Full Name',
                ico: '👤',
                val: fullName,
                set: setFullName,
                type: 'default',
              },
              {
                lbl: 'Phone',
                ico: '📱',
                val: phone,
                set: setPhone,
                type: 'phone-pad',
              },
              {
                lbl: 'Gmail',
                ico: '✉️',
                val: gmail,
                set: setGmail,
                type: 'email-address',
              },
            ].map((field) => (
              <View
                key={field.lbl}
                style={styles.fg}
              >
                <Text style={styles.flbl}>
                  {field.lbl.toUpperCase()}
                </Text>

                {isEditing ? (
                  <View style={styles.iw}>
                    <Text style={styles.iico}>
                      {field.ico}
                    </Text>

                    <TextInput
                      style={[
                        styles.inp,
                        {
                          outlineStyle: 'none',
                        } as any,
                      ]}
                      value={field.val}
                      onChangeText={field.set}
                      keyboardType={
                        field.type as any
                      }
                      autoCapitalize="none"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                    />
                  </View>
                ) : (
                  <View style={styles.fval}>
                    <Text style={styles.fvalIco}>
                      {field.ico}
                    </Text>

                    <Text style={styles.fvalTxt}>
                      {field.val}
                    </Text>
                  </View>
                )}
              </View>
            ))}

            {isEditing && (
              <View style={styles.editActions}>
                <Animated.View
                  style={[
                    styles.saveAnimated,
                    {
                      transform: [
                        {
                          scale: saveAnim,
                        },
                      ],
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleSave}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.saveBtnTxt}>
                      ✓ Save Changes
                    </Text>
                  </TouchableOpacity>
                </Animated.View>

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() =>
                    setIsEditing(false)
                  }
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnTxt}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* QUICK LINKS */}
          {!isEditing && (
            <View
              style={[
                styles.card,
                !isMobile &&
                  styles.cardDesktop,
              ]}
            >
              <View style={styles.cardTopLine} />

              <View style={styles.cardHd}>
                <View style={styles.cardLine} />

                <Text style={styles.cardHdTxt}>
                  Quick Access
                </Text>

                <View style={styles.cardLine} />
              </View>

              {[
                {
                  ico: '👥',
                  title: 'Emergency Contacts',
                  sub: 'Manage safety network',
                  route: '/contacts',
                },
                {
                  ico: '📋',
                  title: 'My Reports',
                  sub: 'View submitted complaints',
                  route: '/report',
                },
                {
                  ico: '💬',
                  title: 'AI Safety Support',
                  sub: 'Chat with assistant',
                  route: '/support',
                },
              ].map((link, index) => (
                <View key={link.title}>
                  <TouchableOpacity
                    style={styles.linkRow}
                    onPress={() =>
                      router.push(
                        link.route as any
                      )
                    }
                    activeOpacity={0.7}
                  >
                    <View style={styles.linkIco}>
                      <Text
                        style={{ fontSize: 18 }}
                      >
                        {link.ico}
                      </Text>
                    </View>

                    <View style={styles.linkInfo}>
                      <Text style={styles.linkTitle}>
                        {link.title}
                      </Text>

                      <Text style={styles.linkSub}>
                        {link.sub}
                      </Text>
                    </View>

                    <Text style={styles.linkArr}>
                      ›
                    </Text>
                  </TouchableOpacity>

                  {index < 2 && (
                    <View
                      style={styles.linkDiv}
                    />
                  )}
                </View>
              ))}
            </View>
          )}

          {/* PRIVACY */}
          {!isEditing && (
            <View
              style={[
                styles.privacyCard,
                !isMobile &&
                  styles.cardDesktop,
              ]}
            >
              <Text style={{ fontSize: 18 }}>
                🔒
              </Text>

              <Text style={styles.privacyTxt}>
                Your data is encrypted and stored securely.
                We never share your personal information.
              </Text>
            </View>
          )}

          {/* ACCOUNT SECURITY */}
          {!isEditing && (
            <View
              style={[
                styles.dangerCard,
                !isMobile && styles.cardDesktop,
              ]}
            >
              <Text style={styles.dangerIcon}>⚠️</Text>

              <View style={styles.dangerInfo}>
                <Text style={styles.dangerTitle}>Delete Account</Text>
                <Text style={styles.dangerSub}>
                  Permanently delete this account. You can register again later as a new account.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDeleteAccount}
                activeOpacity={0.8}
              >
                <Text style={styles.deleteBtnTxt}>Delete Account</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* LOGOUT */}
          {!isEditing && (
            <TouchableOpacity
              style={[
                styles.logoutBtn,
                !isMobile &&
                  styles.cardDesktop,
              ]}
              onPress={handleLogout}
              activeOpacity={0.75}
            >
              <Text style={styles.logoutIco}>
                ⎋
              </Text>

              <Text style={styles.logoutTxt}>
                Logout
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.version}>
            WS App v1.0.0 • BCA Major Project 2025
          </Text>

          {/* FOOTER */}
          <View style={styles.footer}>
            <View style={styles.footerLine} />

            <Text style={styles.footerTxt}>
              Always With You
            </Text>

            <Text style={styles.footerSub}>
              Women Safety Application
            </Text>
          </View>

        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A0310',
    overflow: 'hidden',
  },

  /* BACKGROUND */
  backgroundLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },

  /* ALL BUTTONS / CONTENT ABOVE IMAGE */
  contentLayer: {
    flex: 1,
    zIndex: 10,
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor:
      'rgba(26,3,16,0.72)',
    zIndex: 1,
  },

  glowTL: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor:
      'rgba(92,10,45,0.5)',
    zIndex: 0,
  },

  glowBR: {
    position: 'absolute',
    bottom: -60,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor:
      'rgba(11,110,79,0.12)',
    zIndex: 0,
  },

  topBar: {
    backgroundColor:
      'rgba(30,3,16,0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor:
      'rgba(201,168,76,0.2)',
    zIndex: 20,
  },

  topBarMobile: {
    paddingTop: 40,
  },

  backTxt: {
    color: '#C9A84C',
    fontSize: 13,
    fontWeight: '700',
  },

  topTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  editBtn: {
    backgroundColor:
      'rgba(201,168,76,0.15)',
    borderWidth: 1,
    borderColor:
      'rgba(201,168,76,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },

  editBtnTxt: {
    color: '#C9A84C',
    fontSize: 12,
    fontWeight: '800',
  },

  scrollView: {
    flex: 1,
    zIndex: 20,
  },

  scroll: {
    alignItems: 'center',
    paddingBottom: 30,
  },

  scrollDesktop: {
    paddingHorizontal: 40,
    maxWidth: 680,
    alignSelf: 'center',
    width: '100%',
  },

  avatarSection: {
    alignItems: 'center',
    paddingVertical: 28,
  },

  avatarOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor:
      'rgba(201,168,76,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#C9A84C',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },

  avatarMid: {
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 1.5,
    borderColor:
      'rgba(201,168,76,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarCore: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor:
      'rgba(92,10,45,0.6)',
    borderWidth: 1.5,
    borderColor: '#C9A84C',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarTxt: {
    color: '#C9A84C',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },

  userName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },

  protectedBadge: {
    backgroundColor:
      'rgba(11,110,79,0.15)',
    borderWidth: 1,
    borderColor:
      'rgba(74,222,128,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 6,
  },

  protectedTxt: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  joinDate: {
    color:
      'rgba(255,255,255,0.3)',
    fontSize: 12,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    width: '100%',
  },

  statCard: {
    flex: 1,
    backgroundColor:
      'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor:
      'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },

  statCardActive: {
    borderColor:
      'rgba(201,168,76,0.35)',
    backgroundColor:
      'rgba(201,168,76,0.06)',
  },

  statNum: {
    color: '#C9A84C',
    fontSize: 26,
    fontWeight: '900',
  },

  statLbl: {
    color:
      'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },

  card: {
    width: '100%',
    backgroundColor:
      'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor:
      'rgba(255,255,255,0.1)',
    borderRadius: 18,
    padding: 20,
    marginBottom: 14,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },

  cardDesktop: {
    maxWidth: 560,
  },

  cardTopLine: {
    position: 'absolute',
    top: 0,
    left: '15%',
    right: '15%',
    height: 1,
    backgroundColor:
      'rgba(201,168,76,0.3)',
  },

  cardHd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },

  cardLine: {
    flex: 1,
    height: 1,
    backgroundColor:
      'rgba(201,168,76,0.15)',
  },

  cardHdTxt: {
    color:
      'rgba(201,168,76,0.7)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },

  fg: {
    marginBottom: 14,
  },

  flbl: {
    color:
      'rgba(201,168,76,0.6)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 6,
  },

  fval: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor:
      'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor:
      'rgba(255,255,255,0.07)',
  },

  fvalIco: {
    fontSize: 16,
  },

  fvalTxt: {
    color:
      'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
  },

  iw: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor:
      'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor:
      'rgba(201,168,76,0.3)',
    borderRadius: 12,
    paddingHorizontal: 14,
  },

  iico: {
    fontSize: 16,
    marginRight: 10,
  },

  inp: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 12,
  },

  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },

  saveAnimated: {
    flex: 1,
  },

  saveBtn: {
    backgroundColor:
      'rgba(201,168,76,0.2)',
    borderWidth: 1.5,
    borderColor: '#C9A84C',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },

  saveBtnTxt: {
    color: '#C9A84C',
    fontSize: 14,
    fontWeight: '800',
  },

  cancelBtn: {
    borderWidth: 1,
    borderColor:
      'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
  },

  cancelBtnTxt: {
    color:
      'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '600',
  },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },

  linkIco: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor:
      'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor:
      'rgba(201,168,76,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  linkInfo: {
    flex: 1,
  },

  linkTitle: {
    color:
      'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '700',
  },

  linkSub: {
    color:
      'rgba(255,255,255,0.35)',
    fontSize: 12,
    marginTop: 1,
  },

  linkArr: {
    color: '#C9A84C',
    fontSize: 22,
    fontWeight: '700',
  },

  linkDiv: {
    height: 1,
    backgroundColor:
      'rgba(255,255,255,0.06)',
  },

  privacyCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor:
      'rgba(11,110,79,0.08)',
    borderWidth: 1,
    borderColor:
      'rgba(74,222,128,0.15)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    paddingHorizontal: 16,
  },

  privacyTxt: {
    flex: 1,
    color:
      'rgba(74,222,128,0.6)',
    fontSize: 12,
    lineHeight: 18,
  },

  dangerCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(248,113,113,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.20)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },

  dangerIcon: {
    fontSize: 19,
  },

  dangerInfo: {
    flex: 1,
  },

  dangerTitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '800',
  },

  dangerSub: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  deleteBtn: {
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.32)',
    backgroundColor: 'rgba(248,113,113,0.10)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  deleteBtnTxt: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '800',
  },

  logoutBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor:
      'rgba(248,113,113,0.06)',
    borderWidth: 1,
    borderColor:
      'rgba(248,113,113,0.15)',
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 16,
    paddingHorizontal: 16,
  },

  logoutIco: {
    color: '#f87171',
    fontSize: 16,
  },

  logoutTxt: {
    color: '#f87171',
    fontSize: 15,
    fontWeight: '800',
  },

  version: {
    color:
      'rgba(255,255,255,0.2)',
    fontSize: 11,
    marginBottom: 20,
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
    backgroundColor:
      'rgba(201,168,76,0.3)',
    marginBottom: 14,
  },

  footerTxt: {
    color:
      'rgba(201,168,76,0.6)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  footerSub: {
    color:
      'rgba(255,255,255,0.2)',
    fontSize: 10,
    marginTop: 4,
  },
});